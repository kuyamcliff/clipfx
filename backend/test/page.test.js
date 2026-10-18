'use strict';
// Developer pages: settings, featured products, the page address and download stats.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { startServer, client, baseFields, fakeVideo } = require('./helpers');

let srv;
let dev;
let other;
let mine;
let theirs;

before(async () => {
  srv = await startServer({ pagesDomain: 'clipfx.test' });
  await client(srv.base).signup('founder');
  dev = client(srv.base);
  await dev.signup('jane_dev');
  other = client(srv.base);
  await other.signup('otto');
  mine = (await dev.createAsset(baseFields({ title: 'Jane CLI', category: 'devtools', license: 'mit', software: ['linux', 'macos'] }), { file: fakeVideo })).json_.slug;
  theirs = (await other.createAsset(baseFields({ title: 'Otto App' }), { file: fakeVideo })).json_.slug;
});
after(() => srv.stop());

test('defaults, then saving a page; featured products are limited to your own', async () => {
  let res = await dev.get('/api/me/page');
  assert.equal(res.status, 200);
  assert.equal(res.json_.host, 'jane-dev.clipfx.test');
  assert.equal(res.json_.page.theme, 'auto');
  assert.deepEqual(res.json_.page.links, []);

  res = await dev.put('/api/me/page', {
    json: {
      headline: '  Tools for terminal people  ', about: 'I build small, fast tools.', accent: '#22C55E', theme: 'dark', layout: 'list',
      cover: 'mesh', featured: [mine, theirs, 'not a slug!'], links: [{ label: 'Docs', url: 'docs.jane.dev' }, { label: '', url: '' }],
      cta: { label: 'Star on GitHub', url: 'https://github.com/jane' }, show_stats: false,
    },
  });
  assert.equal(res.status, 200, JSON.stringify(res.json_));
  const p = res.json_.page;
  assert.equal(p.headline, 'Tools for terminal people');
  assert.equal(p.accent, '#22c55e');
  assert.equal(p.theme, 'dark');
  assert.equal(p.layout, 'list');
  assert.equal(p.cover, 'mesh');
  assert.deepEqual(p.featured, [mine], 'someone else’s product can’t be featured');
  assert.deepEqual(p.links, [{ label: 'Docs', url: 'https://docs.jane.dev/' }]);
  assert.deepEqual(p.cta, { label: 'Star on GitHub', url: 'https://github.com/jane' });
  assert.equal(p.show_stats, false);
});

test('bad values are refused with field errors', async () => {
  const res = await dev.put('/api/me/page', { json: { accent: 'red', links: [{ label: 'x', url: 'javascript:alert(1)' }], cta: { label: 'Go', url: 'not a url' } } });
  assert.equal(res.status, 400);
  assert.ok(res.json_.errors.accent);
  assert.ok(res.json_.errors.links_0);
  assert.ok(res.json_.errors.cta);
});

test('the public profile carries the page settings, the page host and featured products', async () => {
  const res = await client(srv.base).get('/api/users/jane_dev');
  assert.equal(res.status, 200);
  assert.equal(res.json_.profile.page_host, 'jane-dev.clipfx.test');
  assert.equal(res.json_.profile.page.headline, 'Tools for terminal people');
  assert.deepEqual(res.json_.featured.map((a) => a.slug), [mine]);
  assert.equal(res.json_.featured[0].category.id || res.json_.featured[0].category, 'devtools');
  const meta = (await client(srv.base).get('/api/meta')).json_;
  assert.equal(meta.config.pagesDomain, 'clipfx.test');
  assert.ok(meta.config.pageOptions.accents.length > 4);
  assert.ok(meta.catalog.categories.some((c) => c.id === 'devtools'));
  assert.ok(meta.catalog.licenses.some((l) => l.id === 'mit'));
});

test('download stats: one entry per day, top products', async () => {
  await client(srv.base).get(`/api/assets/${mine}/download`);
  const res = await dev.get('/api/me/downloads?days=7');
  assert.equal(res.status, 200);
  assert.equal(res.json_.days.length, 7);
  assert.match(res.json_.days[6].date, /^\d{4}-\d{2}-\d{2}$/);
  assert.equal(res.json_.days[6].downloads, 1);
  assert.deepEqual(res.json_.top, [{ slug: mine, title: 'Jane CLI', downloads: 1 }]);
  assert.equal((await client(srv.base).get('/api/me/downloads')).status, 401);
});

test('reserved names cannot be used as usernames (they would clash with site hostnames)', async () => {
  for (const name of ['www', 'api', 'download', 'mcp']) {
    const res = await client(srv.base).signup(name);
    assert.equal(res.status, 400, name);
  }
});

test('API keys: page settings need profile scopes', async () => {
  const make = async (scopes) => (await dev.post('/api/me/keys', { name: `k-${scopes.join('-')}`, scopes, expires: 30 })).json_.token;
  const readKey = await make(['profile:read']);
  const writeKey = await make(['profile:write']);
  const anon = client(srv.base);
  assert.equal((await anon.get('/api/me/page', { headers: { authorization: `Bearer ${readKey}` }, csrf: false })).status, 200);
  assert.equal((await anon.put('/api/me/page', { json: { headline: 'via key' }, headers: { authorization: `Bearer ${readKey}` }, csrf: false })).status, 403);
  const res = await anon.put('/api/me/page', { json: { headline: 'via key' }, headers: { authorization: `Bearer ${writeKey}` }, csrf: false });
  assert.equal(res.status, 200, JSON.stringify(res.json_));
  assert.equal(res.json_.page.headline, 'via key');
});
