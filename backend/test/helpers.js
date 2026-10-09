'use strict';
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const { loadConfig } = require('../src/config');
const { createApp } = require('../src/app');

async function startServer(overrides = {}) {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'clipfx-api-test-'));
  // Set TEST_DATABASE_URL to run the suite against Postgres (each server gets its own schema).
  const pg = process.env.TEST_DATABASE_URL;
  const schema = `clipfx_test_${process.pid}_${Math.random().toString(36).slice(2, 8)}`;
  const config = loadConfig({
    dataDir, rateLimits: false, logRequests: false, mediaProcessing: false, cookieSecure: false,
    storage: 'local', baseUrl: 'http://frontend.test', internalSecret: 'test-secret',
    databaseUrl: pg || '', databaseSchema: schema, ...overrides,
  });
  const silent = { log() {}, warn() {}, error() {} };
  const instance = await createApp(config, { log: overrides.verbose ? console : silent });
  const server = await new Promise((resolve) => { const s = instance.app.listen(0, '127.0.0.1', () => resolve(s)); });
  const base = `http://127.0.0.1:${server.address().port}`;
  return {
    ...instance, config, base, dataDir,
    async stop() {
      await new Promise((r) => server.close(r));
      await instance.media.idle();
      if (instance.db.dialect === 'postgres') await instance.db.run(`DROP SCHEMA ${schema} CASCADE`);
      await instance.close();
      fs.rmSync(dataDir, { recursive: true, force: true });
    },
  };
}

// A browser-like client: keeps cookies and sends the double-submit CSRF token, like the frontend does.
function client(base) {
  const jar = new Map([['csrf', crypto.randomBytes(16).toString('hex')]]);
  async function request(method, p, { json, body, headers = {}, csrf = true } = {}) {
    const h = { ...headers };
    h.cookie = [...jar].map(([k, v]) => `${k}=${v}`).join('; ');
    if (csrf) h['x-csrf-token'] = jar.get('csrf');
    let payload = body;
    if (json !== undefined) { h['content-type'] = 'application/json'; payload = JSON.stringify(json); }
    const res = await fetch(p.startsWith('http') ? p : base + p, { method, headers: h, body: payload, redirect: 'manual' });
    for (const c of res.headers.getSetCookie()) {
      const [kv] = c.split(';');
      const i = kv.indexOf('=');
      const k = kv.slice(0, i);
      const v = kv.slice(i + 1);
      if (!v || /Expires=Thu, 01 Jan 1970/i.test(c)) jar.delete(k); else jar.set(k, v);
    }
    res.body_ = Buffer.from(await res.arrayBuffer());
    try { res.json_ = JSON.parse(res.body_.toString()); } catch { res.json_ = null; }
    return res;
  }

  const c = {
    jar,
    get: (p, o) => request('GET', p, o),
    post: (p, json = {}, o = {}) => request('POST', p, { json, ...o }),
    put: (p, o) => request('PUT', p, o),
    async signup(username, password = 'correct horse battery') {
      return c.post('/api/auth/signup', { username, password, agree: true });
    },
    async login(login, password = 'correct horse battery') {
      return c.post('/api/auth/login', { login, password });
    },
    // Does what the browser does: ask for tickets, PUT to storage, complete multipart uploads.
    async uploadFiles(files) {
      const list = Object.entries(files).map(([field, f]) => ({ field, name: f.name, size: f.data.length }));
      const res = await c.post('/api/uploads', { files: list });
      if (res.status !== 201) return { res };
      const ids = {};
      for (const t of res.json_.uploads) {
        const data = files[t.field].data;
        if (t.method === 'put') {
          const r = await fetch(base + t.url, { method: 'PUT', headers: t.headers, body: data });
          if (r.status !== 200) throw new Error(`PUT failed ${r.status} ${await r.text()}`);
        } else {
          const parts = [];
          for (const p of t.parts) {
            const start = (p.number - 1) * t.partSize;
            const r = await fetch(base + p.url, { method: 'PUT', body: data.subarray(start, start + p.size) });
            if (r.status !== 200) throw new Error(`part ${p.number} failed ${r.status}`);
            parts.push({ number: p.number, etag: r.headers.get('etag') });
          }
          const done = await c.post(`/api/uploads/${t.id}/complete`, { parts });
          if (done.status !== 200) throw new Error(`complete failed ${done.status} ${done.body_}`);
        }
        ids[t.field] = t.id;
      }
      return { res, ids, tickets: res.json_.uploads };
    },
    async createAsset(fields, files) {
      const up = await c.uploadFiles(files);
      if (!up.ids) return up.res;
      return c.post('/api/assets', { ...fields, uploads: up.ids });
    },
  };
  return c;
}

const baseFields = (extra = {}) => ({
  title: 'Organic Light Leaks', category: 'overlays', license: 'cc0', visibility: 'public', rights: true,
  tags: 'light leak, film, warm', software: ['ae', 'pr'], description: 'Twelve light leaks.', ...extra,
});

const fakeVideo = { name: 'leaks.mp4', data: Buffer.concat([Buffer.from([0, 0, 0, 0x18]), Buffer.from('ftypmp42'), Buffer.alloc(2048, 7)]) };
const png = Buffer.from('89504e470d0a1a0a0000000d4948445200000001000000010806000000', 'hex');

module.exports = { startServer, client, baseFields, fakeVideo, png };
