'use strict';
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { loadConfig } = require('../src/config');
const { createApp } = require('../src/app');

async function startServer(overrides = {}) {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'clipfx-test-'));
  const config = loadConfig({ dataDir, rateLimits: false, logRequests: false, mediaProcessing: false, cookieSecure: false, ...overrides });
  const silent = { log() {}, warn() {}, error() {} };
  const instance = createApp(config, { log: overrides.verbose ? console : silent });
  const server = await new Promise((resolve) => { const s = instance.app.listen(0, '127.0.0.1', () => resolve(s)); });
  const base = `http://127.0.0.1:${server.address().port}`;
  return {
    ...instance, config, base, dataDir,
    async stop() {
      await new Promise((r) => server.close(r));
      await instance.media.idle();
      instance.close();
      fs.rmSync(dataDir, { recursive: true, force: true });
    },
  };
}

function client(base) {
  const jar = new Map();
  async function request(method, p, { form, body, headers = {} } = {}) {
    const h = { ...headers };
    if (jar.size) h.cookie = [...jar].map(([k, v]) => `${k}=${v}`).join('; ');
    let payload = body;
    if (form) {
      const params = new URLSearchParams();
      for (const [k, v] of Object.entries(form)) [].concat(v).forEach((x) => params.append(k, x));
      if (!('_csrf' in form) && jar.has('csrf')) params.append('_csrf', decodeURIComponent(jar.get('csrf')));
      payload = params;
    }
    const res = await fetch(base + p, { method, headers: h, body: payload, redirect: 'manual' });
    for (const c of res.headers.getSetCookie()) {
      const [kv] = c.split(';');
      const i = kv.indexOf('=');
      const k = kv.slice(0, i);
      const v = kv.slice(i + 1);
      if (!v || /Expires=Thu, 01 Jan 1970/i.test(c)) jar.delete(k); else jar.set(k, v);
    }
    res.body_ = Buffer.from(await res.arrayBuffer());
    res.text_ = res.body_.toString();
    return res;
  }
  const c = {
    jar,
    get: (p, o) => request('GET', p, o),
    post: (p, o) => request('POST', p, o),
    csrf: () => decodeURIComponent(jar.get('csrf') || ''),
    async signup(username, password = 'correct horse battery') {
      await c.get('/signup');
      return c.post('/signup', { form: { username, password, agree: 'on' } });
    },
    async login(login, password = 'correct horse battery') {
      await c.get('/login');
      return c.post('/login', { form: { login, password } });
    },
    async upload(fields, files, { json = true, csrf = true, url = '/upload' } = {}) {
      if (!jar.has('csrf')) await c.get('/');
      const fd = new FormData();
      for (const [k, v] of Object.entries(fields)) [].concat(v).forEach((x) => fd.append(k, x));
      for (const [k, f] of Object.entries(files)) fd.append(k, new Blob([f.data]), f.name);
      const headers = {};
      if (json) headers.accept = 'application/json';
      if (csrf) headers['x-csrf-token'] = c.csrf();
      return request('POST', url, { body: fd, headers });
    },
  };
  return c;
}

const baseFields = (extra = {}) => ({
  title: 'Organic Light Leaks', category: 'overlays', license: 'cc0', visibility: 'public', rights: 'on',
  tags: 'light leak, film, warm', software: ['ae', 'pr'], description: 'Twelve light leaks.', ...extra,
});

module.exports = { startServer, client, baseFields };
