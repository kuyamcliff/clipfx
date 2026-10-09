'use strict';
// Local disk storage that mimics R2's presigned-URL flow. URLs point at /api/blob/<key>
// and carry an HMAC signature, so the upload code path is identical in development and production.
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const { pipeline } = require('node:stream/promises');
const { newKey, contentDisposition } = require('./index');

const STABLE_WINDOW = 6 * 3600;

function createLocalStorage(config) {
  const dir = path.resolve(config.uploadDir);
  fs.mkdirSync(dir, { recursive: true });
  const partsDir = path.join(dir, '.multipart');

  const abs = (key) => {
    const full = path.resolve(dir, key);
    if (!full.startsWith(dir + path.sep) || full.startsWith(partsDir)) throw new Error('Invalid storage key');
    return full;
  };

  const FIELDS = ['op', 'key', 'exp', 'len', 'ct', 'cd', 'uid', 'part'];
  const sign = (p) => crypto.createHmac('sha256', config.storageSecret).update(FIELDS.map((f) => p[f] ?? '').join('\n')).digest('base64url');

  function signedUrl(params) {
    const p = { ...params };
    p.sig = sign(p);
    const qs = new URLSearchParams();
    for (const [k, v] of Object.entries(p)) if (k !== 'key' && v !== undefined && v !== '') qs.set(k, String(v));
    return `/api/blob/${p.key}?${qs}`;
  }

  // Validates a request to /api/blob. Returns the signed parameters or null.
  function verify(key, query) {
    const p = { key };
    for (const f of FIELDS) if (f !== 'key' && query[f] !== undefined) p[f] = String(query[f]);
    if (!query.sig || !p.exp || Number(p.exp) < Date.now() / 1000) return null;
    const expected = Buffer.from(sign(p));
    const got = Buffer.from(String(query.sig));
    return expected.length === got.length && crypto.timingSafeEqual(expected, got) ? p : null;
  }

  const expIn = (seconds) => Math.floor(Date.now() / 1000) + seconds;

  async function writeStream(stream, dest, expectedLength) {
    await fsp.mkdir(path.dirname(dest), { recursive: true });
    const tmp = `${dest}.${crypto.randomBytes(4).toString('hex')}.part`;
    const md5 = crypto.createHash('md5');
    let size = 0;
    stream.on('data', (d) => { size += d.length; md5.update(d); });
    try {
      await pipeline(stream, fs.createWriteStream(tmp));
      if (expectedLength !== undefined && size !== expectedLength) throw Object.assign(new Error('Length mismatch'), { status: 400 });
      await fsp.rename(tmp, dest);
    } catch (err) {
      await fsp.unlink(tmp).catch(() => {});
      throw err;
    }
    return `"${md5.digest('hex')}"`;
  }

  return {
    kind: 'local',
    origin: '',
    origins: [],
    newKey,
    abs,
    verify,

    async presignPut(key, { contentType, contentLength, ttl = 3600 }) {
      return { url: signedUrl({ op: 'put', key, exp: expIn(ttl), len: contentLength, ct: contentType }), headers: { 'Content-Type': contentType } };
    },
    async createMultipart() {
      return crypto.randomBytes(12).toString('hex');
    },
    async presignPart(key, uploadId, partNumber, contentLength, ttl = 6 * 3600) {
      return signedUrl({ op: 'part', key, exp: expIn(ttl), len: contentLength, uid: uploadId, part: partNumber });
    },
    async completeMultipart(key, uploadId, parts) {
      const folder = path.join(partsDir, uploadId);
      const sorted = [...parts].sort((a, b) => a.number - b.number);
      const dest = abs(key);
      await fsp.mkdir(path.dirname(dest), { recursive: true });
      const out = fs.createWriteStream(dest);
      try {
        for (const p of sorted) {
          const file = path.join(folder, String(p.number));
          const etag = await fsp.readFile(`${file}.etag`, 'utf8').catch(() => null);
          if (!etag || etag !== p.etag) throw Object.assign(new Error(`Part ${p.number} is missing or its ETag doesn't match`), { status: 400 });
          await pipeline(fs.createReadStream(file), out, { end: false });
        }
      } finally {
        await new Promise((r) => out.end(r));
      }
      await fsp.rm(folder, { recursive: true, force: true });
    },
    async abortMultipart(key, uploadId) {
      await fsp.rm(path.join(partsDir, uploadId), { recursive: true, force: true });
    },

    // Called by the /api/blob route.
    async receive(params, stream) {
      if (params.op === 'part') {
        const dest = path.join(partsDir, params.uid, String(Number(params.part)));
        const etag = await writeStream(stream, dest, Number(params.len));
        await fsp.writeFile(`${dest}.etag`, etag);
        return etag;
      }
      return writeStream(stream, abs(params.key), Number(params.len));
    },

    async stat(key) {
      try {
        const st = await fsp.stat(abs(key));
        return { size: st.size };
      } catch {
        return null;
      }
    },
    async readRange(key, start, end) {
      const fh = await fsp.open(abs(key), 'r');
      try {
        const buf = Buffer.alloc(end - start + 1);
        const { bytesRead } = await fh.read(buf, 0, buf.length, start);
        return buf.subarray(0, bytesRead);
      } finally {
        await fh.close();
      }
    },
    async readStream(key) {
      return fs.createReadStream(abs(key));
    },
    async move(fromKey, toKey) {
      const dest = abs(toKey);
      await fsp.mkdir(path.dirname(dest), { recursive: true });
      await fsp.rename(abs(fromKey), dest);
    },
    async putFile(localPath, key) {
      const dest = abs(key);
      await fsp.mkdir(path.dirname(dest), { recursive: true });
      try {
        await fsp.rename(localPath, dest);
      } catch (err) {
        if (err.code !== 'EXDEV') throw err;
        await fsp.copyFile(localPath, dest);
        await fsp.unlink(localPath);
      }
    },
    async remove(key) {
      if (key) await fsp.unlink(abs(key)).catch(() => {});
    },
    // stable: URL stays identical for a few hours so browsers can cache thumbnails.
    async urlFor(key, { contentType, filename, attachment = false, ttl = 3600, stable = false } = {}) {
      const now = Math.floor(Date.now() / 1000);
      const exp = stable ? Math.floor(now / STABLE_WINDOW) * STABLE_WINDOW + 4 * STABLE_WINDOW : now + ttl;
      return signedUrl({ op: 'get', key, exp, ct: contentType, cd: contentDisposition(attachment ? 'attachment' : 'inline', filename) });
    },
    async ffmpegInput(key) {
      return abs(key);
    },
  };
}

module.exports = { createLocalStorage };
