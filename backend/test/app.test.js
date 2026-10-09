'use strict';
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { startServer, client, baseFields } = require('./helpers');

let srv;
let alice;
let bob;
let anon;
const fakeVideo = { name: 'leaks.mp4', data: Buffer.concat([Buffer.from([0, 0, 0, 0x18]), Buffer.from('ftypmp42'), Buffer.alloc(2048, 7)]) };

before(async () => {
  srv = await startServer();
  alice = client(srv.base);
  bob = client(srv.base);
  anon = client(srv.base);
});
after(() => srv.stop());

const slugFrom = (res) => JSON.parse(res.text_).url.replace('/a/', '');

test('public pages render with security headers', async () => {
  for (const p of ['/', '/browse', '/about', '/guidelines', '/licenses', '/terms', '/privacy', '/copyright', '/donate', '/login', '/signup']) {
    const res = await anon.get(p);
    assert.equal(res.status, 200, p);
    assert.match(res.headers.get('content-security-policy'), /default-src 'self'/);
    assert.equal(res.headers.get('x-content-type-options'), 'nosniff');
  }
  assert.equal((await anon.get('/does-not-exist')).status, 404);
  assert.equal((await anon.get('/upload')).status, 302);
});

test('first user becomes admin, second is a regular member', async () => {
  const res = await alice.signup('alice');
  assert.equal(res.status, 302);
  assert.ok(alice.jar.has('sid'));
  assert.equal(srv.models.users.byUsername('alice').role, 'admin');
  await bob.signup('bob');
  assert.equal(srv.models.users.byUsername('bob').role, 'user');
});

test('signup validation rejects bad and duplicate usernames', async () => {
  const c = client(srv.base);
  await c.get('/signup');
  let res = await c.post('/signup', { form: { username: 'a!', password: 'longenough', agree: 'on' } });
  assert.equal(res.status, 400);
  res = await c.post('/signup', { form: { username: 'Alice', password: 'longenough', agree: 'on' } });
  assert.equal(res.status, 400);
  assert.match(res.text_, /taken/);
  res = await c.post('/signup', { form: { username: 'admin', password: 'longenough', agree: 'on' } });
  assert.match(res.text_, /reserved/);
});

test('login works with username or email, fails with wrong password', async () => {
  const c = client(srv.base);
  assert.equal((await c.login('bob', 'wrong password')).status, 401);
  assert.equal((await c.login('BOB')).status, 302);
});

test('POST without CSRF token or from another origin is rejected', async () => {
  let res = await alice.post('/settings/profile', { form: { _csrf: 'nope', display_name: 'x' } });
  assert.equal(res.status, 403);
  res = await alice.post('/settings/profile', { form: { display_name: 'x' }, headers: { origin: 'https://evil.example' } });
  assert.equal(res.status, 403);
  res = await alice.upload(baseFields(), { file: fakeVideo }, { csrf: false });
  assert.equal(res.status, 403);
});

test('upload, view, share and download an asset', async () => {
  const res = await alice.upload(baseFields({ title: 'Leaks <script>alert(1)</script>' }), { file: fakeVideo });
  assert.equal(res.status, 201, res.text_);
  const body = JSON.parse(res.text_);
  assert.match(body.shareUrl, /^http:\/\/127\.0\.0\.1:\d+\/a\/[A-Za-z0-9]{8}$/);
  const slug = slugFrom(res);

  const page = await anon.get(`/a/${slug}`);
  assert.equal(page.status, 200);
  assert.ok(!page.text_.includes('<script>alert(1)</script>'), 'title must be escaped');
  assert.ok(page.text_.includes('Leaks &lt;script&gt;'));
  assert.ok(page.text_.includes(body.shareUrl));
  assert.match(page.text_, /og:video/);

  const dl = await anon.get(`/a/${slug}/download`);
  assert.equal(dl.status, 200);
  assert.equal(dl.headers.get('content-type'), 'application/octet-stream');
  assert.match(dl.headers.get('content-disposition'), /attachment; filename="leaks.mp4"/);
  assert.deepEqual(dl.body_, fakeVideo.data);
  await anon.get(`/a/${slug}/download`); // same visitor: not double counted
  assert.equal(srv.models.assets.bySlug(slug).downloads, 1);

  const inline = await anon.get(`/m/${slug}/file`);
  assert.equal(inline.status, 200);
  assert.equal(inline.headers.get('content-type'), 'video/mp4');
  assert.match(inline.headers.get('content-security-policy'), /sandbox/);

  const ranged = await anon.get(`/m/${slug}/file`, { headers: { range: 'bytes=0-9' } });
  assert.equal(ranged.status, 206);
  assert.equal(ranged.body_.length, 10);

  const a = srv.models.assets.bySlug(slug);
  assert.deepEqual(a.software.map((s) => s.id), ['ae', 'pr']);
  assert.deepEqual(a.tags, ['light leak', 'film', 'warm']);
});

test('rejects unsupported files, missing fields and fake thumbnails', async () => {
  let res = await alice.upload(baseFields(), { file: { name: 'virus.exe', data: Buffer.from('MZ') } });
  assert.equal(res.status, 400);
  assert.match(JSON.parse(res.text_).errors.file, /\.exe files aren’t accepted/);

  res = await alice.upload(baseFields({ title: '', category: 'nope' }), { file: fakeVideo });
  assert.equal(res.status, 400);
  const { errors } = JSON.parse(res.text_);
  assert.ok(errors.title && errors.category);

  res = await alice.upload(baseFields(), { file: fakeVideo, thumbnail: { name: 'x.png', data: Buffer.from('<html>') } });
  assert.equal(res.status, 400);
  assert.ok(JSON.parse(res.text_).errors.thumbnail);

  res = await alice.upload(baseFields({ rights: '' }), { file: fakeVideo });
  assert.equal(res.status, 400);

  // nothing left behind in tmp
  assert.deepEqual(fs.readdirSync(srv.config.tmpDir).filter((f) => f.startsWith('up-')), []);
});

test('non-JS multipart form post works with the hidden CSRF field', async () => {
  const fields = { ...baseFields({ title: 'No JS Upload' }), _csrf: alice.csrf() };
  const res = await alice.upload(fields, { file: { name: 'grain.zip', data: Buffer.from('PK zip data') } }, { json: false, csrf: false });
  assert.equal(res.status, 303);
  assert.match(res.headers.get('location'), /^\/a\//);
});

test('unlisted assets are hidden from browse but reachable by link', async () => {
  const res = await alice.upload(baseFields({ title: 'Secret Whoosh Pack', visibility: 'unlisted', category: 'sfx' }), {
    file: { name: 'whoosh.wav', data: Buffer.from('RIFF....WAVEfmt ') },
  });
  const slug = slugFrom(res);
  const browse = await anon.get('/browse?q=whoosh');
  assert.ok(!browse.text_.includes('Secret Whoosh Pack'));
  const page = await anon.get(`/a/${slug}`);
  assert.equal(page.status, 200);
  assert.equal(page.headers.get('x-robots-tag'), 'noindex');
  const dash = await alice.get('/dashboard');
  assert.ok(dash.text_.includes('Secret Whoosh Pack'));
});

test('search and filters', async () => {
  await alice.upload(baseFields({ title: 'Cinematic Teal LUT', category: 'luts', tags: 'teal, orange', license: 'cc-by', software: 'resolve' }), {
    file: { name: 'teal.cube', data: Buffer.from('LUT_3D_SIZE 2') },
  });
  let res = await anon.get('/browse?q=teal');
  assert.ok(res.text_.includes('Cinematic Teal LUT'));
  res = await anon.get('/browse?q=cinem'); // prefix search
  assert.ok(res.text_.includes('Cinematic Teal LUT'));
  res = await anon.get('/browse?category=luts&software=resolve');
  assert.ok(res.text_.includes('Cinematic Teal LUT'));
  res = await anon.get('/browse?category=overlays');
  assert.ok(!res.text_.includes('Cinematic Teal LUT'));
  res = await anon.get('/browse?noattr=1');
  assert.ok(!res.text_.includes('Cinematic Teal LUT'));
  res = await anon.get('/browse?tag=orange');
  assert.ok(res.text_.includes('Cinematic Teal LUT'));
  res = await anon.get('/browse?q=%22%29%20OR%20*'); // hostile FTS input doesn't crash
  assert.equal(res.status, 200);
  res = await anon.get('/browse?sort=trending&page=2');
  assert.equal(res.status, 200);
  const credit = await anon.get(`/a/${srv.models.assets.list({ q: 'teal' }).items[0].slug}`);
  assert.match(credit.text_, /Copy this credit/);
});

test('only the owner (or a moderator) can edit or delete', async () => {
  const slug = slugFrom(await alice.upload(baseFields({ title: 'Alice Asset' }), { file: fakeVideo }));
  let res = await bob.get(`/a/${slug}/edit`);
  assert.equal(res.status, 403);
  res = await bob.post(`/a/${slug}/delete`, { form: {} });
  assert.equal(res.status, 403);
  res = await anon.post(`/a/${slug}/delete`, { form: {} });
  assert.equal(res.status, 302);
  assert.ok(srv.models.assets.bySlug(slug));
});

test('editing metadata and uploading a new version keeps the link', async () => {
  const slug = slugFrom(await alice.upload(baseFields({ title: 'Version One' }), { file: fakeVideo }));
  const before = srv.models.assets.rawById(srv.models.assets.bySlug(slug).id);
  const res = await alice.upload(baseFields({ title: 'Version Two', visibility: 'unlisted' }), {
    file: { name: 'v2.zip', data: Buffer.from('PK new version') },
  }, { url: `/a/${slug}/edit` });
  assert.equal(res.status, 200, res.text_);
  const after = srv.models.assets.rawById(before.id);
  assert.equal(after.slug, slug);
  assert.equal(after.title, 'Version Two');
  assert.equal(after.visibility, 'unlisted');
  assert.equal(after.file_name, 'v2.zip');
  assert.equal(after.file_kind, 'archive');
  assert.ok(!fs.existsSync(path.join(srv.config.uploadDir, before.file_key)), 'old file removed');
  assert.ok(fs.existsSync(path.join(srv.config.uploadDir, after.file_key)));
});

test('saving favorites', async () => {
  const slug = slugFrom(await alice.upload(baseFields({ title: 'Saveable' }), { file: fakeVideo }));
  await bob.get(`/a/${slug}`);
  let res = await bob.post(`/a/${slug}/save`, { form: {}, headers: { accept: 'application/json' } });
  assert.deepEqual(JSON.parse(res.text_), { ok: true, saved: true, count: 1 });
  res = await bob.get('/saved');
  assert.ok(res.text_.includes('Saveable'));
  res = await bob.post(`/a/${slug}/save`, { form: {}, headers: { accept: 'application/json' } });
  assert.equal(JSON.parse(res.text_).saved, false);
});

test('reports, moderation removal and hash blocking', async () => {
  const data = Buffer.from('PK unique stolen pack');
  const slug = slugFrom(await bob.upload(baseFields({ title: 'Totally Not Stolen' }), { file: { name: 'pack.zip', data } }));
  await anon.get(`/a/${slug}`);
  let res = await anon.post(`/a/${slug}/report`, { form: { reason: 'copyright', details: 'short' } });
  assert.equal(res.status, 400);
  res = await anon.post(`/a/${slug}/report`, { form: { reason: 'stolen', details: 'This is a paid pack from a marketplace.' } });
  assert.equal(res.status, 303);

  assert.equal((await bob.get('/admin')).status, 404);
  const admin = await alice.get('/admin');
  assert.ok(admin.text_.includes('Totally Not Stolen'));
  const report = srv.models.reports.open()[0];
  res = await alice.post(`/admin/reports/${report.id}/remove`, { form: { block: 'on' } });
  assert.equal(res.status, 303);

  assert.equal((await anon.get(`/a/${slug}`)).status, 410);
  assert.equal((await anon.get(`/a/${slug}/download`)).status, 410);
  assert.equal((await anon.get(`/m/${slug}/file`)).status, 404);
  assert.equal((await bob.get(`/a/${slug}`)).status, 200, 'owner sees removal notice');

  res = await bob.upload(baseFields({ title: 'Trying Again' }), { file: { name: 'again.zip', data } });
  assert.equal(res.status, 400);
  assert.match(JSON.parse(res.text_).errors.file, /removed/);
});

test('banning hides a user and their uploads', async () => {
  const carol = client(srv.base);
  await carol.signup('carol');
  const slug = slugFrom(await carol.upload(baseFields({ title: 'Carol Clip' }), { file: fakeVideo }));
  const id = srv.models.users.byUsername('carol').id;
  await alice.get('/admin?tab=users');
  await alice.post(`/admin/users/${id}/ban`, { form: {} });
  assert.equal((await anon.get(`/a/${slug}`)).status, 410);
  assert.equal((await anon.get('/u/carol')).status, 404);
  assert.equal((await carol.get('/upload')).status, 302, 'banned session is dropped');
  assert.equal((await carol.login('carol')).status, 403);
});

test('password reset links from moderators', async () => {
  const id = srv.models.users.byUsername('bob').id;
  const token = srv.models.resets.create(id);
  const c = client(srv.base);
  await c.get(`/reset/${token}`);
  const res = await c.post(`/reset/${token}`, { form: { password: 'brand new password' } });
  assert.equal(res.status, 303);
  assert.equal((await client(srv.base).login('bob', 'brand new password')).status, 302);
  assert.equal((await c.get(`/reset/${token}`)).status, 410, 'token is single use');
});

test('profile settings validate websites', async () => {
  await alice.get('/settings');
  let res = await alice.post('/settings/profile', { form: { display_name: 'Alice A.', website: 'javascript:alert(1)', bio: '' } });
  assert.equal(res.status, 400);
  res = await alice.post('/settings/profile', { form: { display_name: 'Alice A.', website: 'alice.studio', bio: 'Editor.' } });
  assert.equal(res.status, 303);
  assert.equal(srv.models.users.byUsername('alice').website, 'https://alice.studio/');
  res = await anon.get('/u/alice');
  assert.ok(res.text_.includes('alice.studio'));
});

test('deleting an account removes its files', async () => {
  const dave = client(srv.base);
  await dave.signup('dave');
  const slug = slugFrom(await dave.upload(baseFields({ title: 'Dave Stuff' }), { file: fakeVideo }));
  const key = srv.models.assets.rawById(srv.models.assets.bySlug(slug).id).file_key;
  assert.ok(fs.existsSync(path.join(srv.config.uploadDir, key)));
  let res = await dave.post('/settings/delete', { form: { confirm: 'dave', password: 'wrong' } });
  assert.equal(res.status, 400);
  res = await dave.post('/settings/delete', { form: { confirm: 'dave', password: 'correct horse battery' } });
  assert.equal(res.status, 303);
  assert.ok(!fs.existsSync(path.join(srv.config.uploadDir, key)));
  assert.equal(srv.models.users.byUsername('dave'), undefined);
});

test('sitemap lists public assets only', async () => {
  const res = await anon.get('/sitemap.xml');
  assert.match(res.text_, /<urlset/);
  assert.ok(!res.text_.includes('Secret'));
});
