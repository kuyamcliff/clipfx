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
let googleToken;
const listen = (app) => new Promise((resolve) => { const s = app.listen(0, '127.0.0.1', () => resolve(s)); });

before(async () => {
  if (!haveBackend) return;
  const { loadConfig: apiConfig } = require(path.join(backendDir, 'src', 'config'));
  const { createApp } = require(path.join(backendDir, 'src', 'app'));
  dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'clipfx-site-test-'));
  // Stand-in for Google's token endpoint: answers every code with an ID token for one account.
  googleToken = require('node:http').createServer((req, res) => {
    const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
    const claims = { iss: 'https://accounts.google.com', aud: 'site-test-client', exp: Math.floor(Date.now() / 1000) + 600, sub: 'g-site', email: 'gina@example.org', email_verified: true, name: 'Gina Grade' };
    res.writeHead(200, { 'content-type': 'application/json' });
    if (req.url.startsWith('/tiktok/token')) return res.end(JSON.stringify({ access_token: 't', open_id: 'tt-site' }));
    if (req.url.startsWith('/tiktok/user')) return res.end(JSON.stringify({ data: { user: { display_name: 'Tia Cuts' } } }));
    return res.end(JSON.stringify({ id_token: `${b64({ alg: 'RS256' })}.${b64(claims)}.sig` }));
  });
  await new Promise((r) => googleToken.listen(0, '127.0.0.1', r));
  const google = { clientId: 'site-test-client', clientSecret: 'shh', authUrl: 'https://accounts.google.com/o/oauth2/v2/auth', tokenUrl: `http://127.0.0.1:${googleToken.address().port}/token` };
  const fake = `http://127.0.0.1:${googleToken.address().port}`;
  const tiktok = { clientKey: 'awsite', clientSecret: 'shh', authUrl: 'https://www.tiktok.com/v2/auth/authorize/', tokenUrl: `${fake}/tiktok/token`, userUrl: `${fake}/tiktok/user` };
  api = await createApp(apiConfig({ dataDir, storage: 'local', rateLimits: false, logRequests: false, mediaProcessing: false, internalSecret: 's3cret', google, tiktok }), { log: quiet });
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
  googleToken.close();
  await api.media.idle();
  await api.close();
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
  const home = (await b.get('/')).text_;
  const css = /href="(\/static\/css\/style\.css\?v=[\w-]+)"/.exec(home);
  assert.ok(css, 'stylesheet URL carries a version so caches pick up new deploys');
  assert.equal((await b.get(css[1])).status, 200);
  assert.match(home, /src="\/static\/js\/app\.js\?v=[\w-]+"/);
  assert.match((await b.get('/robots.txt')).text_, /Sitemap:/);
});

test('the /api proxy returns complete bodies even when the API compresses them', opts, async () => {
  const zlib = require('node:zlib');
  const big = JSON.stringify({ ok: true, items: Array.from({ length: 400 }, (_, i) => `item-${i}-${'x'.repeat(20)}`) });
  const http = require('node:http');
  const upstream = http.createServer((req, res) => {
    const gz = zlib.gzipSync(big);
    res.writeHead(200, { 'content-type': 'application/json', 'content-encoding': 'gzip', 'content-length': gz.length });
    res.end(gz);
  });
  await new Promise((r) => upstream.listen(0, '127.0.0.1', r));
  const app = createFrontend(loadConfig({ backendUrl: `http://127.0.0.1:${upstream.address().port}`, logRequests: false }), { log: quiet });
  const srv = await listen(app);
  try {
    const res = await fetch(`http://127.0.0.1:${srv.address().port}/api/anything`);
    assert.equal(await res.text(), big);
  } finally {
    srv.close();
    upstream.close();
  }
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

test('continue with Google: redirect, state check, callback', opts, async () => {
  const b = browser();
  assert.match((await b.get('/login')).text_, /href="\/auth\/google"/);
  let res = await b.get('/auth/google?next=/upload');
  assert.equal(res.status, 302);
  const to = new URL(res.headers.get('location'));
  assert.equal(to.host, 'accounts.google.com');
  const state = to.searchParams.get('state');
  assert.ok(b.jar.has('oauth'));

  // A wrong state is refused and the flow starts over.
  const other = browser();
  await other.get('/auth/google');
  res = await other.get(`/auth/google/callback?code=abc&state=${encodeURIComponent(state)}`);
  assert.equal(res.headers.get('location'), '/login');

  res = await b.get(`/auth/google/callback?code=abc&state=${encodeURIComponent(state)}`);
  assert.equal(res.status, 302);
  assert.equal(res.headers.get('location'), '/upload');
  assert.ok(!b.jar.has('oauth'), 'state cookie is single use');
  const settings = await b.get('/settings');
  assert.equal(settings.status, 200);
  assert.match(settings.text_, /You don't have a password yet/);
  assert.match(settings.text_, /Sign-in methods/);

  res = await browser().get('/auth/google/callback?error=access_denied');
  assert.equal(res.headers.get('location'), '/login');
});

test('TikTok sign-up, then connecting Google from settings', opts, async () => {
  const b = browser();
  assert.match((await b.get('/signup')).text_, /href="\/auth\/tiktok"/);
  let res = await b.get('/auth/tiktok');
  const to = new URL(res.headers.get('location'));
  assert.equal(to.host, 'www.tiktok.com');
  res = await b.get(`/auth/tiktok/callback?code=abc&state=${encodeURIComponent(to.searchParams.get('state'))}`);
  assert.equal(res.headers.get('location'), '/settings');
  let settings = (await b.get('/settings')).text_;
  assert.match(settings, /Tia Cuts/);
  assert.match(settings, /action="\/settings\/connections\/tiktok\/remove"/);
  assert.match(settings, /href="\/auth\/google\?next=\/settings"/);

  // Google is already used by another account (from the earlier test), so connecting it is refused.
  res = await b.get('/auth/google?next=/settings');
  const g = new URL(res.headers.get('location'));
  res = await b.get(`/auth/google/callback?code=abc&state=${encodeURIComponent(g.searchParams.get('state'))}`);
  assert.equal(res.headers.get('location'), '/settings#connections');
  settings = (await b.get('/settings')).text_;
  assert.match(settings, /already used by another/);

  // Only sign-in method on a passwordless account: disconnect is refused with a message.
  res = await b.post('/settings/connections/tiktok/remove', { form: { back: '/settings' } });
  assert.equal(res.status, 303);
  assert.match((await b.get('/settings')).text_, /Set a password or connect another sign-in method/);
});

test('sitemaps list pages, every public asset and every account', opts, async () => {
  const b = browser();
  await b.signup('sam');
  const pub = (await b.upload(fields({ title: 'Sitemap Public' }), { name: 'pub.zip', data: Buffer.from('PK pub') })).json_;
  const hidden = (await b.upload(fields({ title: 'Sitemap Hidden', visibility: 'unlisted' }), { name: 'hid.zip', data: Buffer.from('PK hid') })).json_;

  const anon = browser();
  const index = await anon.get('/sitemap.xml');
  assert.equal(index.status, 200);
  assert.match(index.headers.get('content-type'), /xml/);
  assert.match(index.text_, /<sitemapindex/);
  for (const part of ['pages', 'assets-1', 'creators-1']) assert.match(index.text_, new RegExp(`/sitemaps/${part}\\.xml</loc>`));

  const pages = (await anon.get('/sitemaps/pages.xml')).text_;
  assert.match(pages, /\/browse\?category=overlays<\/loc>/);
  assert.match(pages, /\/licenses<\/loc>/);
  assert.doesNotMatch(pages, /\/login|\/signup/);

  const assets = (await anon.get('/sitemaps/assets-1.xml')).text_;
  assert.ok(assets.includes(`/a/${pub.slug}</loc>`), 'public asset listed');
  assert.ok(!assets.includes(`/a/${hidden.slug}<`), 'unlisted asset left out');
  assert.match(assets, /<lastmod>\d{4}-\d\d-\d\dT/);

  const creators = (await anon.get('/sitemaps/creators-1.xml')).text_;
  assert.match(creators, /\/u\/sam<\/loc>/);
  assert.match(creators, /\/u\/alice<\/loc>/, 'accounts without uploads are listed too');

  assert.equal((await anon.get('/sitemaps/assets-2.xml')).status, 404);
  assert.equal((await anon.get('/sitemaps/assets-0.xml')).status, 404);
  assert.match((await anon.get('/robots.txt')).text_, /Sitemap: .*\/sitemap\.xml/);
});

test('brand: logo, icons, manifest and default share image', opts, async () => {
  const b = browser();
  const home = (await b.get('/')).text_;
  assert.match(home, /<img class="mark" src="\/static\/brand\/logo\.png"/);
  assert.match(home, /rel="apple-touch-icon" href="\/static\/brand\/apple-touch-icon\.png"/);
  assert.match(home, /property="og:image" content="http:\/\/127\.0\.0\.1:\d+\/static\/brand\/og\.png"/);
  const ld = JSON.parse(/<script type="application\/ld\+json">(.*?)<\/script>/.exec(home)[1]);
  assert.equal(ld[0]['@type'], 'Organization');
  assert.match(ld[0].logo, /icon-512\.png$/);
  for (const p of ['/static/brand/logo.png', '/static/brand/favicon-32.png', '/static/brand/og.png', '/static/brand/icon-512.png']) {
    assert.equal((await b.get(p)).status, 200, p);
  }
  const manifest = await b.get('/manifest.webmanifest');
  assert.equal(manifest.status, 200);
  assert.equal(JSON.parse(manifest.text_).name, 'ClipFX');
  assert.equal((await b.get('/favicon.ico')).headers.get('location'), '/static/brand/favicon.ico');
});
