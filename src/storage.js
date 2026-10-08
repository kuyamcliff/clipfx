'use strict';
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');

function createStorage(dir) {
  fs.mkdirSync(dir, { recursive: true });

  function abs(key) {
    const full = path.resolve(dir, key);
    if (!full.startsWith(dir + path.sep)) throw new Error('Invalid storage key');
    return full;
  }

  function newKey(ext) {
    const id = crypto.randomBytes(16).toString('hex');
    return `${id.slice(0, 2)}/${id}${ext ? `.${ext}` : ''}`;
  }

  async function moveIn(srcPath, ext) {
    const key = newKey(ext);
    const dest = abs(key);
    await fsp.mkdir(path.dirname(dest), { recursive: true });
    try {
      await fsp.rename(srcPath, dest);
    } catch (err) {
      if (err.code !== 'EXDEV') throw err;
      await fsp.copyFile(srcPath, dest);
      await fsp.unlink(srcPath);
    }
    return key;
  }

  async function remove(key) {
    if (!key) return;
    await fsp.unlink(abs(key)).catch(() => {});
  }

  return { dir, abs, newKey, moveIn, remove };
}

function sha256File(file) {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash('sha256');
    fs.createReadStream(file).on('error', reject).on('data', (d) => hash.update(d)).on('end', () => resolve(hash.digest('hex')));
  });
}

// Lightweight magic-byte check for files we display inline (previews & thumbnails).
async function sniff(file) {
  const fh = await fsp.open(file, 'r');
  try {
    const buf = Buffer.alloc(16);
    await fh.read(buf, 0, 16, 0);
    if (buf[0] === 0x89 && buf.toString('ascii', 1, 4) === 'PNG') return 'png';
    if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'jpg';
    if (buf.toString('ascii', 0, 4) === 'GIF8') return 'gif';
    if (buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WEBP') return 'webp';
    if (buf.toString('ascii', 4, 8) === 'ftyp') return 'mp4';
    if (buf.readUInt32BE(0) === 0x1a45dfa3) return 'webm';
    return null;
  } finally {
    await fh.close();
  }
}

module.exports = { createStorage, sha256File, sniff };
