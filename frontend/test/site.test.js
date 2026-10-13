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
  assert.equal((await b.get('/upload')).status, 200, 'anyone can upload');
  assert.equal((await b.get('/developers')).status, 200);
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

test('anonymous upload gets a private manage link that edits and deletes', opts, async () => {
  const anon = browser();
  await anon.get('/upload');
  const res = await anon.upload(fields({ title: 'Anon Site Pack' }), { name: 'anon.zip', data: Buffer.from('PK anon site') });
  assert.equal(res.status, 201, res.text_);
  const { url, manageKey } = res.json_;
  const page = await anon.get(`${url}?uploaded=1&key=${manageKey}`);
  assert.equal(page.status, 200);
  assert.match(page.text_, /Your private manage link/);
  assert.match(page.text_, /Uploaded\./);
  assert.match(page.text_, /Anonymous/);

  const visitor = browser();
  const plain = await visitor.get(url);
  assert.doesNotMatch(plain.text_, /private manage link/);
  assert.doesNotMatch(plain.text_, new RegExp(manageKey));

  const edit = await visitor.get(`${url}/edit?key=${manageKey}`);
  assert.equal(edit.status, 200);
  let r = await visitor.post(`${url}/edit`, { form: { title: 'Anon Renamed', category: 'overlays', license: 'cc0', manageKey, expiry: 'keep' } });
  assert.equal(r.status, 303);
  assert.ok(r.headers.get('location').includes(`key=${manageKey}`));
  assert.match((await visitor.get(url)).text_, /Anon Renamed/);
  assert.equal((await browser().get(`${url}/edit`)).status, 403);
  r = await visitor.post(`${url}/delete`, { form: { manageKey } });
  assert.equal(r.status, 303);
  assert.equal((await visitor.get(url)).status, 404);
});

test('password-locked files unlock through the page form', opts, async () => {
  const b = browser();
  await b.signup('lockie');
  const { url } = (await b.upload(fields({ title: 'Locked Site Pack', password: 'letmein' }), { name: 'lock.zip', data: Buffer.from('PK lock') })).json_;
  const v = browser();
  let page = await v.get(url);
  assert.match(page.text_, /Password protected/);
  assert.match(page.text_, /name="robots" content="noindex"/);
  let dl = await v.get(`${url}/download`);
  assert.equal(dl.status, 302);
  assert.match(dl.headers.get('location'), /#unlock$/);
  let r = await v.post(`${url}/unlock`, { form: { password: 'nope' } });
  assert.equal(r.status, 303);
  assert.match((await v.get(url)).text_, /Wrong password/);
  r = await v.post(`${url}/unlock`, { form: { password: 'letmein' } });
  assert.equal(r.status, 303);
  page = await v.get(url);
  assert.doesNotMatch(page.text_, /Password protected/);
  dl = await v.get(`${url}/download`);
  assert.equal(dl.status, 302);
  assert.doesNotMatch(dl.headers.get('location'), /#unlock/);
});

test('expired links show an expired page; owners can set a new expiry from the form', opts, async () => {
  const b = browser();
  await b.signup('tempo');
  const { url, slug } = (await b.upload(fields({ title: 'Tempo Pack', expiresIn: 5 }), { name: 't.zip', data: Buffer.from('PK t') })).json_;
  const owner = await b.get(url);
  assert.match(owner.text_, /data-expires="\d+"/);
  const row = await api.models.assets.rowBySlug(slug);
  await api.models.assets.setFields(row.id, { expires_at: Date.now() - 1000 });
  const v = await browser().get(url);
  assert.equal(v.status, 410);
  assert.match(v.text_, /This link has expired/);
  const r = await b.post(`${url}/edit`, { form: { title: 'Tempo Pack', category: 'overlays', license: 'cc0', expiry: 'after', expiryAmount: '2', expiryUnit: '60' } });
  assert.equal(r.status, 303);
  assert.equal((await browser().get(url)).status, 200);
  const fresh = await api.models.assets.rowBySlug(slug);
  assert.ok(Math.abs(fresh.expires_at - (Date.now() + 2 * 3600 * 1000)) < 60000);
});

test('open to AI: robots, llms.txt and the API docs', opts, async () => {
  const b = browser();
  const robots = (await b.get('/robots.txt')).text_;
  for (const bot of ['GPTBot', 'ClaudeBot', 'PerplexityBot', 'Google-Extended']) assert.match(robots, new RegExp(`User-agent: ${bot}`));
  assert.match(robots, /Allow: \/api\/assets/);
  assert.match(robots, /Disallow: \/settings/);
  const llms = await b.get('/llms.txt');
  assert.equal(llms.status, 200);
  assert.match(llms.text_, /^# ClipFX/);
  assert.match(llms.text_, /\/api\/assets\?q=/);
  assert.match((await b.get('/developers')).text_, /api\/assets\/\{slug\}/);
});

test('API keys: create from settings, shown once, used through the proxy, revoked', opts, async () => {
  const b = browser();
  await b.signup('keymaker');
  let page = await b.get('/settings/api-keys');
  assert.equal(page.status, 200);
  assert.match(page.text_, /Full access/);
  assert.match(page.text_, /assets:write/);

  // Validation errors re-render with the name kept.
  page = await b.post('/settings/api-keys', { form: { name: 'Reader', expires: '30' } });
  assert.equal(page.status, 400);
  assert.match(page.text_, /Pick at least one permission/);
  assert.match(page.text_, /value="Reader"/);

  page = await b.post('/settings/api-keys', { form: { name: 'Reader', expires: '30', scopes: ['assets:read', 'saved:read'] } });
  assert.equal(page.status, 200);
  assert.equal(page.headers.get('cache-control'), 'no-store');
  const token = /(cfx_[\w-]{40})/.exec(page.text_)[1];
  assert.match(page.text_, /won't be shown again/);

  // Listed by name and prefix, never the token itself.
  page = await b.get('/settings/api-keys');
  assert.ok(!page.text_.includes(token));
  assert.match(page.text_, new RegExp(token.slice(0, 12)));
  assert.match(page.text_, /Never used/);

  // The key works through the website's /api proxy, with no cookies.
  const call = (p) => fetch(site.base + p, { headers: { authorization: `Bearer ${token}` } });
  assert.equal((await call('/api/me/assets')).status, 200);
  const denied = await fetch(site.base + '/api/uploads', { method: 'POST', headers: { 'x-api-key': token, 'content-type': 'application/json' }, body: JSON.stringify({ files: [] }) });
  assert.equal(denied.status, 403);
  assert.equal((await denied.json()).missing_scope, 'assets:write');

  // Full access with a custom expiry date.
  const date = new Date(Date.now() + 10 * 24 * 3600 * 1000).toISOString().slice(0, 10);
  page = await b.post('/settings/api-keys', { form: { name: 'Everything', expires: 'custom', expiresAt: date, full: 'on' } });
  assert.equal(page.status, 200);
  assert.match(page.text_, /Full access/);

  const id = /\/settings\/api-keys\/([\w-]+)\/revoke/.exec((await b.get('/settings/api-keys')).text_.split('Reader')[1])[1];
  const revoked = await b.post(`/settings/api-keys/${id}/revoke`, { form: {} });
  assert.equal(revoked.status, 303);
  assert.equal((await call('/api/me/assets')).status, 401);
});

test('API key docs list every permission and the upload steps', opts, async () => {
  const page = await browser().get('/developers/api');
  assert.equal(page.status, 200);
  for (const s of ['assets:read', 'assets:write', 'assets:delete', 'saved:read', 'saved:write', 'profile:read', 'profile:write', 'reports:write', 'account:delete', 'admin']) {
    assert.match(page.text_, new RegExp(`<code>${s}</code>`), s);
  }
  assert.match(page.text_, /Authorization: Bearer cfx_/);
  assert.match(page.text_, /X-Unlock-Token/);
  assert.match((await browser().get('/developers')).text_, /href="\/developers\/api"/);
  assert.match((await browser().get('/llms.txt')).text_, /developers\/api/);
});

test('MCP: sign-in required, then handshake, tools and account tools with an API key', opts, async () => {
  let id = 0;
  const rpc = async (method, params, token, extra = {}) => {
    const headers = { 'content-type': 'application/json', accept: 'application/json, text/event-stream', ...extra };
    if (token) headers.authorization = `Bearer ${token}`;
    const res = await fetch(`${site.base}/mcp`, { method: 'POST', headers, body: JSON.stringify({ jsonrpc: '2.0', id: ++id, method, params }) });
    return { status: res.status, body: await res.json().catch(() => null), headers: res.headers };
  };

  // No token: 401 that points at the OAuth metadata. Nothing is answered, not even initialize.
  for (const t of [undefined, 'cfx_not-a-real-key-aaaaaaaaaaaaaaaaaaaaa', 'garbage']) {
    const r = await rpc('initialize', { protocolVersion: '2025-06-18' }, t);
    assert.equal(r.status, 401, String(t));
    assert.match(r.headers.get('www-authenticate'), /Bearer resource_metadata="http:\/\/[^"]+\/\.well-known\/oauth-protected-resource\/mcp"/);
    assert.equal(r.body.result, undefined);
  }
  assert.equal((await rpc('tools/list')).status, 401);

  const b = browser();
  await b.signup('agentowner');
  const page = await b.post('/settings/api-keys', { form: { name: 'Agent', expires: '30', full: 'on' } });
  const token = /(cfx_[\w-]{40})/.exec(page.text_)[1];
  const tool = async (name, args) => (await rpc('tools/call', { name, arguments: args }, token)).body.result;

  const init = await rpc('initialize', { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'test', version: '1' } }, token);
  assert.equal(init.status, 200);
  assert.equal(init.body.result.protocolVersion, '2025-06-18');
  assert.equal(init.body.result.serverInfo.name, 'clipfx');
  assert.ok(init.body.result.capabilities.tools);
  assert.equal(init.headers.get('access-control-allow-origin'), '*');
  assert.equal(init.headers.get('set-cookie'), null, 'no cookies on /mcp');
  assert.equal((await rpc('initialize', { protocolVersion: '1999-01-01' }, token)).body.result.protocolVersion, '2025-11-25');

  // Notifications get 202 and no body.
  const note = await fetch(`${site.base}/mcp`, { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` }, body: JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }) });
  assert.equal(note.status, 202);

  const { tools } = (await rpc('tools/list', undefined, token)).body.result;
  for (const n of ['search_files', 'get_file', 'get_download_link', 'list_categories', 'whoami', 'list_my_files', 'upload_small_file', 'publish_file', 'edit_file', 'delete_file', 'toggle_save', 'update_profile']) {
    assert.ok(tools.some((t) => t.name === n), n);
  }
  assert.ok(tools.every((t) => t.inputSchema.type === 'object' && t.description));
  assert.equal(tools.find((t) => t.name === 'delete_file').annotations.destructiveHint, true);

  const cats = await tool('list_categories', {});
  assert.equal(cats.isError, false);
  assert.ok(cats.structuredContent.categories.some((c) => c.id === 'software'));
  assert.equal((await tool('whoami', {})).structuredContent.username, 'agentowner');

  const up = await tool('upload_small_file', { file_name: 'agent-pack.zip', content_base64: Buffer.from('PK agent made this').toString('base64') }, token);
  assert.equal(up.isError, false, up.content[0].text);
  const noRights = await tool('publish_file', { upload_id: up.structuredContent.upload_id, title: 'Agent Pack', category: 'other', license: 'cc0', confirm_rights: false }, token);
  assert.equal(noRights.isError, true);
  const pub = await tool('publish_file', { upload_id: up.structuredContent.upload_id, title: 'Agent Pack', category: 'other', license: 'cc0', tags: ['agent'], confirm_rights: true }, token);
  assert.equal(pub.isError, false, pub.content[0].text);
  const { slug } = pub.structuredContent;

  const found = await tool('search_files', { query: 'Agent Pack' });
  assert.ok(found.structuredContent.items.some((x) => x.slug === slug));
  let edited = await tool('edit_file', { slug, visibility: 'unlisted', max_downloads: 50 }, token);
  assert.equal(edited.isError, false, edited.content[0].text);
  edited = await tool('edit_file', { slug, title: 'Agent Pack v2' }, token);
  assert.equal(edited.isError, false, edited.content[0].text);
  const mine = await tool('get_file', { slug }, token);
  assert.equal(mine.structuredContent.title, 'Agent Pack v2');
  assert.equal(mine.structuredContent.visibility, 'unlisted');
  assert.equal(mine.structuredContent.max_downloads, 50, 'untouched settings are kept');
  assert.deepEqual(mine.structuredContent.tags, ['agent']);
  assert.match((await tool('get_download_link', { slug }, token)).structuredContent.url, /^https?:\/\//);

  assert.equal((await tool('toggle_save', { slug }, token)).structuredContent.saved, true);
  assert.equal((await tool('update_profile', { bio: 'Made by an agent' }, token)).isError, false);
  assert.equal((await tool('whoami', {}, token)).structuredContent.bio, 'Made by an agent');

  assert.equal((await tool('delete_file', { slug }, token)).isError, false);
  assert.equal((await tool('get_file', { slug })).isError, true, 'deleted');

  // A bad key is reported clearly; unknown tools are JSON-RPC errors.
  assert.equal((await rpc('tools/call', { name: 'nope', arguments: {} }, token)).body.error.code, -32602);
  assert.equal((await rpc('does/not/exist', undefined, token)).body.error.code, -32601);

  // Browsers opening /mcp get the setup guide.
  const get = await fetch(`${site.base}/mcp`, { headers: { accept: 'text/html' }, redirect: 'manual' });
  assert.equal(get.status, 302);
  assert.equal(get.headers.get('location'), '/developers/mcp');
  assert.equal((await fetch(`${site.base}/mcp`)).status, 405);
});

test('MCP setup guide: linked, lists every tool, client configs use the real URL', opts, async () => {
  const page = await browser().get('/developers/mcp');
  assert.equal(page.status, 200);
  const { TOOLS } = require('../src/mcp');
  for (const t of TOOLS) assert.match(page.text_, new RegExp(`<code>${t.name}</code>`), t.name);
  assert.match(page.text_, new RegExp(`claude mcp add --transport http clipfx ${site.base}/mcp`));
  assert.match((await browser().get('/developers')).text_, /href="\/developers\/mcp"/);
  assert.match((await browser().get('/llms.txt')).text_, /\/mcp : MCP server/);
});


test('MCP sign-in: discovery, registration, consent page and PKCE token, then the token works on /mcp', opts, async () => {
  const crypto = require('node:crypto');
  const prm = await (await fetch(`${site.base}/.well-known/oauth-protected-resource/mcp`)).json();
  assert.equal(prm.resource, `${site.base}/mcp`);
  const asUrl = prm.authorization_servers[0];
  const meta = await (await fetch(`${asUrl}/.well-known/oauth-authorization-server`)).json();
  assert.deepEqual(meta.code_challenge_methods_supported, ['S256']);

  const redirect = 'http://127.0.0.1:41999/callback';
  const reg = await fetch(meta.registration_endpoint, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ client_name: 'Test Agent', redirect_uris: [redirect] }) });
  assert.equal(reg.status, 201);
  const { client_id } = await reg.json();

  const verifier = crypto.randomBytes(32).toString('base64url');
  const challenge = crypto.createHash('sha256').update(verifier).digest('base64url');
  const q = new URLSearchParams({ response_type: 'code', client_id, redirect_uri: redirect, code_challenge: challenge, code_challenge_method: 'S256', state: 'xyz', scope: 'assets:read profile:read', resource: prm.resource });
  const authorizePath = `/oauth/authorize?${q}`;

  // Signed out: sent to log in, and back here afterwards.
  const b = browser();
  let r = await b.get(authorizePath);
  assert.equal(r.status, 302);
  assert.equal(r.headers.get('location'), `/login?next=${encodeURIComponent(authorizePath)}`);

  await b.signup('oauthuser');
  r = await b.get(authorizePath);
  assert.equal(r.status, 200);
  assert.match(r.text_, /Test Agent<\/strong> wants to use your ClipFX account/);
  assert.match(r.text_, /127\.0\.0\.1:41999/);
  assert.match(r.text_, /value="assets:read" checked/);
  assert.doesNotMatch(r.text_, /value="assets:delete" checked/);
  // Browsers apply form-action to the redirect after Allow, so the app's return address must be allowed.
  assert.match(r.headers.get('content-security-policy'), /form-action 'self' http:\/\/127\.0\.0\.1:41999;/);
  assert.ok(!prm.scopes_supported.includes('*') && !prm.scopes_supported.includes('account:delete'));

  // Unknown app or unregistered redirect: an error page, never a redirect.
  assert.equal((await b.get(`/oauth/authorize?${new URLSearchParams({ ...Object.fromEntries(q), redirect_uri: 'https://evil.example/cb' })}`)).status, 400);
  assert.equal((await b.get(`/oauth/authorize?${new URLSearchParams({ ...Object.fromEntries(q), client_id: 'app_nope' })}`)).status, 400);

  // Cancel goes back with access_denied.
  const form = { ...Object.fromEntries(q), scopes: ['assets:read', 'profile:read'], expires: '30' };
  r = await b.post('/oauth/authorize', { form: { ...form, decision: 'deny' } });
  assert.equal(r.status, 303);
  assert.match(r.headers.get('location'), /^http:\/\/127\.0\.0\.1:41999\/callback\?error=access_denied/);

  r = await b.post('/oauth/authorize', { form: { ...form, decision: 'allow' } });
  assert.equal(r.status, 303);
  const back = new URL(r.headers.get('location'));
  assert.equal(back.origin + back.pathname, redirect);
  assert.equal(back.searchParams.get('state'), 'xyz');
  const code = back.searchParams.get('code');

  // Token exchange, form-encoded like most OAuth clients send it.
  const tok = await fetch(meta.token_endpoint, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ grant_type: 'authorization_code', code, code_verifier: verifier, client_id, redirect_uri: redirect }) });
  assert.equal(tok.status, 200);
  assert.equal(tok.headers.get('access-control-allow-origin'), '*');
  const t = await tok.json();
  assert.equal(t.token_type, 'Bearer');
  assert.equal(t.scope, 'assets:read profile:read');

  const call = (method, params) => fetch(`${site.base}/mcp`, { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${t.access_token}` }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }) }).then((x) => x.json());
  assert.equal((await call('tools/call', { name: 'whoami', arguments: {} })).result.structuredContent.username, 'oauthuser');
  const denied = (await call('tools/call', { name: 'list_saved', arguments: {} })).result;
  assert.equal(denied.isError, true);
  assert.match(denied.content[0].text, /saved:read/);

  // It shows up as a connected app, and disconnecting it ends access.
  const keys = await b.get('/settings/api-keys');
  assert.match(keys.text_, /Test Agent<\/strong> <span class="keytag keytag-full">Connected app/);
  const keyId = /\/settings\/api-keys\/([\w-]+)\/revoke/.exec(keys.text_)[1];
  await b.post(`/settings/api-keys/${keyId}/revoke`, { form: {} });
  const after = await fetch(`${site.base}/mcp`, { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${t.access_token}` }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'ping' }) });
  assert.equal(after.status, 401);
  assert.match(after.headers.get('www-authenticate'), /error="invalid_token"/);
});
