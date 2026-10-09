'use strict';
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { startServer, client, baseFields, fakeVideo, png } = require('./helpers');

let srv;
let alice;
let bob;
let anon;

before(async () => {
  srv = await startServer({ multipartThreshold: 64 * 1024, minPartSize: 20 * 1024 });
  alice = client(srv.base);
  bob = client(srv.base);
  anon = client(srv.base);
});
after(() => srv.stop());

const keyOf = (slug) => srv.models.assets.rowBySlug(slug).file_key;
const fileExists = (key) => fs.existsSync(path.join(srv.config.uploadDir, key));

test('meta, session and health', async () => {
  const meta = await anon.get('/api/meta');
  assert.equal(meta.status, 200);
  assert.ok(meta.json_.catalog.categories.length > 5);
  assert.equal(meta.json_.config.storageOrigin, '');
  assert.equal((await anon.get('/api/session')).json_.user, null);
  assert.equal((await anon.get('/healthz')).json_.storage, 'local');
  assert.equal((await anon.get('/api/nope')).status, 404);
});

test('first user becomes admin, second is a member', async () => {
  const res = await alice.signup('alice');
  assert.equal(res.status, 201);
  assert.ok(alice.jar.has('sid'));
  assert.equal(res.json_.user.role, 'admin');
  assert.equal((await alice.get('/api/session')).json_.user.username, 'alice');
  await bob.signup('bob');
  assert.equal(srv.models.users.byUsername('bob').role, 'user');
});

test('signup and login validation', async () => {
  const c = client(srv.base);
  let res = await c.post('/api/auth/signup', { username: 'a!', password: 'longenough', agree: true });
  assert.equal(res.status, 400);
  assert.ok(res.json_.errors.username);
  res = await c.post('/api/auth/signup', { username: 'Alice', password: 'longenough', agree: true });
  assert.match(res.json_.errors.username, /taken/);
  res = await c.post('/api/auth/signup', { username: 'admin', password: 'longenough', agree: true });
  assert.match(res.json_.errors.username, /reserved/);
  assert.equal((await c.login('bob', 'wrong password')).status, 401);
  assert.equal((await c.login('BOB')).status, 200);
});

test('writes need the CSRF token, JSON, and an allowed origin', async () => {
  let res = await alice.post('/api/me/profile', { display_name: 'x' }, { csrf: false });
  assert.equal(res.status, 403);
  res = await alice.post('/api/me/profile', { display_name: 'x' }, { headers: { origin: 'https://evil.example' } });
  assert.equal(res.status, 403);
  res = await alice.post('/api/me/profile', { display_name: 'Alice' }, { headers: { origin: 'http://frontend.test' } });
  assert.equal(res.status, 200);
  res = await fetch(`${srv.base}/api/me/profile`, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded', cookie: `csrf=${alice.jar.get('csrf')}; sid=${alice.jar.get('sid')}`, 'x-csrf-token': alice.jar.get('csrf') }, body: 'display_name=x' });
  assert.equal(res.status, 415);
});

test('upload straight to storage, view, download', async () => {
  const res = await alice.createAsset(baseFields({ title: 'Leaks <b>bold</b>' }), { file: fakeVideo, thumbnail: { name: 'thumb.png', data: png } });
  assert.equal(res.status, 201, res.body_.toString());
  const { slug, shareUrl } = res.json_;
  assert.equal(shareUrl, `http://frontend.test/a/${slug}`);

  const page = await anon.get(`/api/assets/${slug}?view=1`);
  assert.equal(page.status, 200);
  const a = page.json_.asset;
  assert.equal(a.title, 'Leaks <b>bold</b>');
  assert.deepEqual(a.software, ['ae', 'pr']);
  assert.deepEqual(a.tags, ['light leak', 'film', 'warm']);
  assert.equal(a.views, 1);
  assert.match(a.thumbUrl, /^\/api\/blob\/t\//);
  assert.match(a.videoSrc, /^\/api\/blob\/f\//);
  assert.equal(a.file_key, undefined, 'storage keys stay private');

  const thumb = await anon.get(a.thumbUrl);
  assert.equal(thumb.headers.get('content-type'), 'image/png');

  const dl = await anon.get(`/api/assets/${slug}/download`);
  assert.equal(dl.status, 302);
  const file = await anon.get(dl.headers.get('location'));
  assert.equal(file.status, 200);
  assert.match(file.headers.get('content-disposition'), /^attachment; filename="leaks.mp4"/);
  assert.deepEqual(file.body_, fakeVideo.data);
  await anon.get(`/api/assets/${slug}/download`);
  assert.equal(srv.models.assets.rowBySlug(slug).downloads, 1, 'same visitor counted once');

  const tampered = dl.headers.get('location').replace('op=get', 'op=get&x=1').replace(/sig=[^&]+/, 'sig=AAAA');
  assert.equal((await anon.get(tampered)).status, 403);
  await srv.media.idle();
  assert.equal(srv.models.assets.rowBySlug(slug).file_sha256.length, 64, 'hash computed in background');
});

test('big files go up in parts', async () => {
  const data = Buffer.alloc(150 * 1024);
  for (let i = 0; i < data.length; i++) data[i] = i % 251;
  const up = await alice.uploadFiles({ file: { name: 'pack.zip', data } });
  const t = up.tickets[0];
  assert.equal(t.method, 'multipart');
  assert.ok(t.parts.length >= 3);
  const res = await alice.post('/api/assets', { ...baseFields({ title: 'Multipart Pack' }), uploads: up.ids });
  assert.equal(res.status, 201, res.body_.toString());
  const dl = await anon.get(`/api/assets/${res.json_.slug}/download`);
  assert.deepEqual((await anon.get(dl.headers.get('location'))).body_, data);
});

test('storage refuses uploads that differ from what was approved', async () => {
  const tickets = await alice.post('/api/uploads', { files: [{ field: 'file', name: 'a.zip', size: 10 }] });
  const t = tickets.json_.uploads[0];
  let r = await fetch(srv.base + t.url, { method: 'PUT', headers: t.headers, body: Buffer.alloc(20) });
  assert.equal(r.status, 400, 'wrong size rejected');
  r = await fetch(srv.base + t.url.replace(/len=\d+/, 'len=20'), { method: 'PUT', headers: t.headers, body: Buffer.alloc(20) });
  assert.equal(r.status, 403, 'tampered URL rejected');
  // Never uploaded, so it can't be attached.
  const res = await alice.post('/api/assets', { ...baseFields(), uploads: { file: t.id } });
  assert.equal(res.status, 400);
  assert.match(res.json_.errors.file, /didn’t arrive/);
});

test('rejects bad types, sizes, fields and fake thumbnails', async () => {
  let res = await alice.post('/api/uploads', { files: [{ field: 'file', name: 'virus.exe', size: 2 }] });
  assert.equal(res.status, 400);
  assert.match(res.json_.errors.file, /\.exe files aren’t accepted/);
  res = await alice.post('/api/uploads', { files: [{ field: 'file', name: 'huge.mp4', size: srv.config.maxUpload + 1 }] });
  assert.match(res.json_.errors.file, /too large/);
  const quota = srv.config.userQuota;
  srv.config.userQuota = 1000;
  res = await alice.post('/api/uploads', { files: [{ field: 'file', name: 'x.mp4', size: 5000 }] });
  srv.config.userQuota = quota;
  assert.equal(res.status, 413);
  res = await anon.post('/api/uploads', { files: [{ field: 'file', name: 'x.mp4', size: 5 }] });
  assert.equal(res.status, 401);

  res = await alice.createAsset(baseFields({ title: '', category: 'nope' }), { file: fakeVideo });
  assert.equal(res.status, 400);
  assert.ok(res.json_.errors.title && res.json_.errors.category);
  res = await alice.createAsset(baseFields(), { file: fakeVideo, thumbnail: { name: 'x.png', data: Buffer.from('<html><script>alert(1)</script>') } });
  assert.equal(res.status, 400);
  assert.ok(res.json_.errors.thumbnail);
  res = await alice.createAsset(baseFields({ rights: false }), { file: fakeVideo });
  assert.ok(res.json_.errors.rights);
});

test("you can't attach someone else's upload", async () => {
  const up = await alice.uploadFiles({ file: fakeVideo });
  const res = await bob.post('/api/assets', { ...baseFields(), uploads: up.ids });
  assert.equal(res.status, 400);
});

test('unlisted assets are hidden from listings but reachable by link', async () => {
  const res = await alice.createAsset(baseFields({ title: 'Secret Whoosh Pack', visibility: 'unlisted', category: 'sfx' }), {
    file: { name: 'whoosh.wav', data: Buffer.from('RIFF....WAVEfmt ') },
  });
  const { slug } = res.json_;
  const list = await anon.get('/api/assets?q=whoosh');
  assert.ok(!list.json_.result.items.some((a) => a.slug === slug));
  assert.equal((await anon.get(`/api/assets/${slug}`)).status, 200);
  const mine = await alice.get('/api/me/assets');
  assert.ok(mine.json_.result.items.some((a) => a.slug === slug && a.shareUrl.endsWith(slug)));
});

test('search and filters', async () => {
  await alice.createAsset(baseFields({ title: 'Cinematic Teal LUT', category: 'luts', tags: 'teal, orange', license: 'cc-by', software: ['resolve'] }), {
    file: { name: 'teal.cube', data: Buffer.from('LUT_3D_SIZE 2') },
  });
  const titles = async (qs) => (await anon.get(`/api/assets?${qs}`)).json_.result.items.map((a) => a.title);
  assert.ok((await titles('q=teal')).includes('Cinematic Teal LUT'));
  assert.ok((await titles('q=cinem')).includes('Cinematic Teal LUT'));
  assert.ok((await titles('category=luts&software=resolve')).includes('Cinematic Teal LUT'));
  assert.ok(!(await titles('category=overlays')).includes('Cinematic Teal LUT'));
  assert.ok(!(await titles('noattr=1')).includes('Cinematic Teal LUT'));
  assert.ok((await titles('tag=orange')).includes('Cinematic Teal LUT'));
  assert.equal((await anon.get('/api/assets?q=%22%29%20OR%20*')).status, 200);
  assert.equal((await anon.get('/api/assets?sort=trending&page=2')).status, 200);
  const home = await anon.get('/api/home');
  assert.ok(home.json_.fresh.length > 0);
});

test('only the owner or a moderator can edit or delete', async () => {
  const { slug } = (await alice.createAsset(baseFields({ title: 'Alice Asset' }), { file: fakeVideo })).json_;
  assert.equal((await bob.post(`/api/assets/${slug}/edit`, baseFields())).status, 403);
  assert.equal((await bob.post(`/api/assets/${slug}/delete`)).status, 403);
  assert.equal((await anon.post(`/api/assets/${slug}/delete`)).status, 401);
  assert.ok(srv.models.assets.rowBySlug(slug));
});

test('editing metadata and uploading a new version keeps the link', async () => {
  const { slug } = (await alice.createAsset(baseFields({ title: 'Version One' }), { file: fakeVideo, thumbnail: { name: 't.png', data: png } })).json_;
  const before = srv.models.assets.rowBySlug(slug);
  const up = await alice.uploadFiles({ file: { name: 'v2.zip', data: Buffer.from('PK new version') } });
  const res = await alice.post(`/api/assets/${slug}/edit`, { ...baseFields({ title: 'Version Two', visibility: 'unlisted' }), uploads: up.ids });
  assert.equal(res.status, 200, res.body_.toString());
  const after = srv.models.assets.rowBySlug(slug);
  assert.equal(after.title, 'Version Two');
  assert.equal(after.visibility, 'unlisted');
  assert.equal(after.file_name, 'v2.zip');
  assert.equal(after.file_kind, 'archive');
  assert.equal(after.thumb_key, null, 'old thumbnail dropped with the old file');
  assert.ok(!fileExists(before.file_key), 'old file removed from storage');
  assert.ok(!fileExists(before.thumb_key));
  assert.ok(fileExists(after.file_key));
});

test('saving favorites', async () => {
  const { slug } = (await alice.createAsset(baseFields({ title: 'Saveable' }), { file: fakeVideo })).json_;
  let res = await bob.post(`/api/assets/${slug}/save`);
  assert.equal(res.json_.saved, true);
  assert.equal(res.json_.count, 1);
  assert.ok((await bob.get('/api/me/saved')).json_.result.items.some((a) => a.slug === slug));
  res = await bob.post(`/api/assets/${slug}/save`);
  assert.equal(res.json_.saved, false);
});

test('reports, removal and blocking re-uploads of the same file', async () => {
  const data = Buffer.from('PK unique stolen pack');
  const { slug } = (await bob.createAsset(baseFields({ title: 'Totally Not Stolen' }), { file: { name: 'pack.zip', data } })).json_;
  await srv.media.idle();
  let res = await anon.post(`/api/assets/${slug}/report`, { reason: 'copyright', details: 'short' });
  assert.equal(res.status, 400);
  res = await anon.post(`/api/assets/${slug}/report`, { reason: 'stolen', details: 'This is a paid pack from a marketplace.' });
  assert.equal(res.status, 200);

  assert.equal((await bob.get('/api/admin')).status, 404);
  const admin = await alice.get('/api/admin');
  assert.ok(admin.json_.reports.some((r) => r.title === 'Totally Not Stolen'));
  const report = admin.json_.reports.find((r) => r.title === 'Totally Not Stolen');
  assert.equal((await alice.post(`/api/admin/reports/${report.id}/remove`, { block: true })).status, 200);

  assert.equal((await anon.get(`/api/assets/${slug}`)).status, 410);
  assert.equal((await anon.get(`/api/assets/${slug}/download`)).status, 410);
  assert.equal((await bob.get(`/api/assets/${slug}`)).status, 200, 'owner still sees it, with the notice');

  // Same bytes again: accepted at first, then removed by the background hash check.
  const again = await bob.createAsset(baseFields({ title: 'Trying Again' }), { file: { name: 'again.zip', data } });
  assert.equal(again.status, 201);
  await srv.media.idle();
  assert.equal(srv.models.assets.rowBySlug(again.json_.slug).status, 'removed');
});

test('removing an asset moves its files so shared links stop working; restoring brings it back', async () => {
  const { slug } = (await bob.createAsset(baseFields({ title: 'Takedown Test' }), { file: { name: 'take.zip', data: Buffer.from('PK takedown') }, thumbnail: { name: 't.png', data: png } })).json_;
  const before = srv.models.assets.rowBySlug(slug);
  const id = before.id;
  assert.equal((await alice.post(`/api/admin/assets/${id}/remove`, { reason: 'Copyright' })).status, 200);
  const removed = srv.models.assets.rowBySlug(slug);
  assert.ok(!fileExists(before.file_key) && !fileExists(before.thumb_key), 'old keys are gone');
  assert.ok(fileExists(removed.file_key) && removed.file_key.startsWith('x/'));
  const ownerView = (await bob.get(`/api/assets/${slug}`)).json_.asset;
  assert.equal(ownerView.thumbUrl, null, 'the uploader no longer gets media links for a removed asset');
  assert.ok((await alice.get(`/api/assets/${slug}`)).json_.asset.thumbUrl, 'moderators still do');

  assert.equal((await alice.post(`/api/admin/assets/${id}/restore`)).status, 200);
  const restored = srv.models.assets.rowBySlug(slug);
  assert.equal(restored.status, 'active');
  assert.ok(restored.file_key.startsWith('f/') && fileExists(restored.file_key));
  const dl = await anon.get(`/api/assets/${slug}/download`);
  assert.equal((await anon.get(dl.headers.get('location'))).body_.toString(), 'PK takedown');
});

test('banning hides a user and their uploads', async () => {
  const carol = client(srv.base);
  await carol.signup('carol');
  const { slug } = (await carol.createAsset(baseFields({ title: 'Carol Clip' }), { file: fakeVideo })).json_;
  const id = srv.models.users.byUsername('carol').id;
  assert.equal((await alice.post(`/api/admin/users/${id}/ban`)).status, 200);
  assert.equal((await anon.get(`/api/assets/${slug}`)).status, 410);
  assert.equal((await anon.get('/api/users/carol')).status, 404);
  assert.equal((await carol.get('/api/session')).json_.user, null);
  assert.equal((await carol.login('carol')).status, 403);
});

test('password reset links from moderators', async () => {
  const id = srv.models.users.byUsername('bob').id;
  const res = await alice.post(`/api/admin/users/${id}/reset`);
  const token = res.json_.link.split('/reset/')[1];
  assert.match(res.json_.link, /^http:\/\/frontend\.test\/reset\//);
  const c = client(srv.base);
  assert.equal((await c.get(`/api/auth/reset/${token}`)).json_.username, 'bob');
  assert.equal((await c.post(`/api/auth/reset/${token}`, { password: 'brand new password' })).status, 200);
  assert.equal((await client(srv.base).login('bob', 'brand new password')).status, 200);
  assert.equal((await c.get(`/api/auth/reset/${token}`)).status, 410);
});

test('profile settings validate websites', async () => {
  let res = await alice.post('/api/me/profile', { display_name: 'Alice A.', website: 'javascript:alert(1)' });
  assert.equal(res.status, 400);
  res = await alice.post('/api/me/profile', { display_name: 'Alice A.', website: 'alice.studio', bio: 'Editor.' });
  assert.equal(res.status, 200);
  assert.equal((await anon.get('/api/users/alice')).json_.profile.website, 'https://alice.studio/');
  assert.equal((await anon.get('/api/users/alice')).json_.profile.email, undefined, 'email stays private');
});

test('deleting an account removes its files', async () => {
  const dave = client(srv.base);
  await dave.signup('dave');
  const { slug } = (await dave.createAsset(baseFields({ title: 'Dave Stuff' }), { file: fakeVideo })).json_;
  const key = keyOf(slug);
  assert.ok(fileExists(key));
  assert.equal((await dave.post('/api/me/delete', { confirm: 'dave', password: 'wrong' })).status, 400);
  assert.equal((await dave.post('/api/me/delete', { confirm: 'dave', password: 'correct horse battery' })).status, 200);
  assert.ok(!fileExists(key));
  assert.equal(srv.models.users.byUsername('dave'), undefined);
});

test('abandoned uploads are cleaned up', async () => {
  const up = await alice.uploadFiles({ file: { name: 'forgotten.zip', data: Buffer.from('PK forgotten') } });
  const row = srv.models.uploads.get(up.ids.file, srv.models.users.byUsername('alice').id);
  assert.ok(fileExists(row.key));
  srv.models.db.prepare('UPDATE uploads SET created_at = 0 WHERE id = ?').run(row.id);
  await srv.sweep();
  assert.ok(!fileExists(row.key));
  assert.equal(srv.models.uploads.get(row.id, row.user_id), undefined);
});

test('client IP is only trusted from the frontend', async () => {
  const { slug } = (await alice.createAsset(baseFields({ title: 'Counted' }), { file: fakeVideo })).json_;
  const hit = (headers) => fetch(`${srv.base}/api/assets/${slug}/download`, { headers, redirect: 'manual' });
  await hit({ 'x-client-ip': '1.1.1.1' });
  await hit({ 'x-client-ip': '2.2.2.2' }); // ignored without the secret: same IP as before
  assert.equal(srv.models.assets.rowBySlug(slug).downloads, 1);
  await hit({ 'x-client-ip': '3.3.3.3', 'x-internal-secret': 'test-secret' });
  assert.equal(srv.models.assets.rowBySlug(slug).downloads, 2);
});
