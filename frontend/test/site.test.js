'use strict';
// Runs the real API and the website together and drives the site like a browser would.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createFrontend } = require('../src/app');
const { loadConfig } = require('../src/config');

const backendDir = path.join(__dirname, '..', '..', 'backend');
const haveBackend = fs.existsSync(path.join(backendDir, 'node_modules', 'express'));
const quiet = { log() {}, warn() {}, error() {} };

let api;
let site;
let dataDir;
const listen = (app) => new Promise((resolve) => { const s = app.listen(0, '127.0.0.1', () => resolve(s)); });

before(async () => {
  if (!haveBackend) return;
  const { loadConfig: apiConfig } = require(path.join(backendDir, 'src', 'config'));
  const { createApp } = require(path.join(backendDir, 'src', 'app'));
  dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'clipfx-site-test-'));
  api = createApp(apiConfig({ dataDir, storage: 'local', rateLimits: false, logRequests: false, mediaProcessing: false, internalSecret: 's3cret' }), { log: quiet });
  api.server = await listen(api.app);
  const backendUrl = `http://127.0.0.1:${api.server.address().port}`;
  site = { server: await listen(createFrontend(loadConfig({ backendUrl, internalSecret: 's3cret', cookieSecure: false, logRequests: false }), { log: quiet })) };
  site.base = `http://127.0.0.1:${site.server.address().port}`;
  api.app.locals.base = backendUrl;
});

after(async () => {
  if (!haveBackend) return;
  await new Promise((r) => site.server.close(r));
  await new Promise((r) => api.server.close(r));
  await api.media.idle();
  api.close();
  fs.rmSync(dataDir, { recursive: true, force: true });
});

function browser() {
  const jar = new Map();
  async function go(method, p, { form, json, headers = {}, body } = {}) {
    const h = { ...headers };
    if (jar.size) h.cookie = [...jar].map(([k, v]) => `${k}=${v}`).join('; ');
    let payload = body;
    if (form) {
      const params = new URLSearchParams();
      for (const [k, v] of Object.entries(form)) [].concat(v).forEach((x) => params.append(k, x));
      if (!('_csrf' in form) && jar.has('csrf')) params.append('_csrf', decodeURIComponent(jar.get('csrf')));
      payload = params;
    }
    if (json) { h['content-type'] = 'application/json'; h['x-csrf-token'] = decodeURIComponent(jar.get('csrf')); payload = JSON.stringify(json); }
    const res = await fetch(p.startsWith('http') ? p : site.base + p, { method, headers: h, body: payload, redirect: 'manual' });
    for (const c of res.headers.getSetCookie()) {
      const [kv] = c.split(';');
      const i = kv.indexOf('=');
      const k = kv.slice(0, i);
      const v = kv.slice(i + 1);
      if (!v || /Expires=Thu, 01 Jan 1970/i.test(c)) jar.delete(k); else jar.set(k, v);
    }
    res.text_ = await res.text();
    try { res.json_ = JSON.parse(res.text_); } catch { res.json_ = null; }
    return res;
  }
  const b = {
    jar,
    get: (p, o) => go('GET', p, o),
    post: (p, o) => go('POST', p, o),
    async signup(username) {
      await b.get('/signup');
      return b.post('/signup', { form: { username, password: 'correct horse battery', agree: 'on' } });
    },
    // What the upload script does, through the website's /api proxy.
    async upload(fields, file) {
      const t = (await b.post('/api/uploads', { json: { files: [{ field: 'file', name: file.name, size: file.data.length }] } })).json_.uploads[0];
      const put = await fetch(site.base + t.url, { method: 'PUT', headers: t.headers, body: file.data });
      assert.equal(put.status, 200);
      return b.post('/api/assets', { json: { ...fields, uploads: { file: t.id } } });
    },
  };
  return b;
}

const fields = (extra = {}) => ({ title: 'Light Leaks', category: 'overlays', license: 'cc0', rights: true, tags: 'light, film', ...extra });
const opts = { skip: !haveBackend && 'backend dependencies not installed (run npm install in backend/)' };

test('pages render with security headers', opts, async () => {
  const b = browser();
  for (const p of ['/', '/browse', '/about', '/guidelines', '/licenses', '/terms', '/privacy', '/copyright', '/donate', '/login', '/signup']) {
    const res = await b.get(p);
    assert.equal(res.status, 200, p);
    assert.match(res.headers.get('content-security-policy'), /default-src 'self'/);
    assert.match(res.text_, /<title>/);
  }
  assert.equal((await b.get('/nope')).status, 404);
  assert.equal((await b.get('/upload')).status, 302);
  assert.equal((await b.get('/static/css/style.css')).status, 200);
  assert.match((await b.get('/robots.txt')).text_, /Sitemap:/);
});

test('sign up through the form, then the session works', opts, async () => {
  const b = browser();
  const res = await b.signup('alice');
  assert.equal(res.status, 303);
  assert.equal(res.headers.get('location'), '/upload');
  assert.ok(b.jar.has('sid'), 'API session cookie passed through');
  const page = await b.get('/upload');
  assert.equal(page.status, 200);
  assert.match(page.text_, /data-upload-form/);
});

test('form errors re-render with messages and keep values', opts, async () => {
  const b = browser();
  await b.get('/signup');
  const res = await b.post('/signup', { form: { username: 'x!', email: 'me@example.org', password: 'short' } });
  assert.equal(res.status, 400);
  assert.match(res.text_, /3–24 characters/);
  assert.match(res.text_, /value="me@example.org"/);
});

test('forms without a valid token or from another site are refused', opts, async () => {
  const b = browser();
  await b.get('/login');
  assert.equal((await b.post('/login', { form: { login: 'a', password: 'b', _csrf: 'nope' } })).status, 403);
  assert.equal((await b.post('/login', { form: { login: 'a', password: 'b' }, headers: { origin: 'https://evil.example' } })).status, 403);
  const fresh = await fetch(`${site.base}/login`, { method: 'POST', body: new URLSearchParams({ login: 'a', password: 'b' }), redirect: 'manual' });
  assert.equal(fresh.status, 403);
});

test('upload through the proxy, view, download, escape titles', opts, async () => {
  const b = browser();
  await b.signup('bob');
  const data = Buffer.from('PK some zip bytes');
  const res = await b.upload(fields({ title: 'Leaks <script>alert(1)</script>' }), { name: 'leaks.zip', data });
  assert.equal(res.status, 201, res.text_);
  const page = await b.get(`${res.json_.url}?uploaded=1`);
  assert.equal(page.status, 200);
  assert.ok(!page.text_.includes('<script>alert(1)</script>'));
  assert.ok(page.text_.includes('Leaks &lt;script&gt;'));
  assert.match(page.text_, /Uploaded\./);
  assert.match(page.text_, /property="og:title"/);

  const dl = await b.get(`${res.json_.url}/download`);
  assert.equal(dl.status, 302);
  const file = await fetch(site.base + dl.headers.get('location'));
  assert.equal(Buffer.from(await file.arrayBuffer()).toString(), data.toString());
  assert.match(file.headers.get('content-disposition'), /attachment/);

  const anon = browser();
  const list = await anon.get('/browse?q=leaks');
  assert.match(list.text_, /Leaks &lt;script&gt;/);
});

test('saving, editing details without JavaScript, deleting', opts, async () => {
  const b = browser();
  await b.signup('carol');
  const { url, slug } = (await b.upload(fields({ title: 'Carol Pack' }), { name: 'pack.zip', data: Buffer.from('PK carol') })).json_;
  let res = await b.post(`${url}/save`, { form: {} });
  assert.equal(res.status, 303);
  assert.match((await b.get('/saved')).text_, /Carol Pack/);

  await b.get(`${url}/edit`);
  res = await b.post(`${url}/edit`, { form: { title: '', category: 'overlays', license: 'cc0' } });
  assert.equal(res.status, 400);
  assert.match(res.text_, /Give it a title/);
  res = await b.post(`${url}/edit`, { form: { title: 'Carol Pack v2', category: 'luts', license: 'cc-by', visibility: 'unlisted', software: ['ae', 'resolve'] } });
  assert.equal(res.status, 303);
  const page = await b.get(url);
  assert.match(page.text_, /Carol Pack v2/);
  assert.match(page.text_, /After Effects<\/a>, <a href="\/browse\?software=resolve">DaVinci Resolve/);

  const other = browser();
  await other.signup('mallory');
  assert.equal((await other.get(`${url}/edit`)).status, 403);

  res = await b.post(`${url}/delete`, { form: {} });
  assert.equal(res.status, 303);
  assert.equal(res.headers.get('location'), '/dashboard');
  assert.equal((await b.get(`/a/${slug}`)).status, 404);
});

test('reports and moderation through the site', opts, async () => {
  const admin = browser();
  await admin.get('/login');
  await admin.post('/login', { form: { login: 'alice', password: 'correct horse battery' } });
  const b = browser();
  await b.signup('dave');
  const { url } = (await b.upload(fields({ title: 'Dodgy Pack' }), { name: 'dodgy.zip', data: Buffer.from('PK dodgy') })).json_;

  await b.get(`${url}/report`);
  let res = await b.post(`${url}/report`, { form: { reason: 'stolen', details: 'Paid pack from a marketplace.' } });
  assert.equal(res.status, 303);
  const queue = await admin.get('/admin');
  assert.match(queue.text_, /Dodgy Pack/);
  const id = /\/admin\/reports\/(\d+)\/remove/.exec(queue.text_)[1];
  res = await admin.post(`/admin/reports/${id}/remove`, { form: { reason: 'Leaked', block: 'on', back: '/admin?tab=reports' } });
  assert.equal(res.status, 303);
  assert.equal((await browser().get(url)).status, 410);
  assert.equal((await b.get('/admin')).status, 404, 'members can’t see moderation');
});

test('login errors and logout', opts, async () => {
  const b = browser();
  await b.get('/login');
  let res = await b.post('/login', { form: { login: 'alice', password: 'wrong' } });
  assert.equal(res.status, 401);
  assert.match(res.text_, /Wrong username/);
  res = await b.post('/login', { form: { login: 'alice', password: 'correct horse battery', next: '/dashboard' } });
  assert.equal(res.headers.get('location'), '/dashboard');
  res = await b.post('/logout', { form: {} });
  assert.equal(res.status, 303);
  assert.ok(!b.jar.has('sid'));
});
