'use strict';
// Link expiry, download limits, password locks, anonymous uploads, avatars and social links.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { startServer, client, baseFields, fakeVideo, png } = require('./helpers');

let srv;
let alice;
const zip = (name = 'pack.zip') => ({ name, data: Buffer.from(`PK ${name} ${Math.random()}`) });

before(async () => {
  srv = await startServer();
  alice = client(srv.base);
  await alice.signup('alice');
});
after(() => srv.stop());

test('expiring links stop working for everyone but the owner', async () => {
  const res = await alice.createAsset(baseFields({ title: 'Short Lived', expiresIn: 1 }), { file: zip() });
  assert.equal(res.status, 201, res.body_.toString());
  const { slug } = res.json_;
  const anon = client(srv.base);
  const page = await anon.get(`/api/assets/${slug}`);
  assert.equal(page.status, 200);
  assert.ok(page.json_.asset.expires_at > Date.now());
  // Not listed while it's a private share.
  assert.ok(!(await anon.get('/api/assets?q=short')).json_.result.items.some((a) => a.slug === slug));

  const row = await srv.models.assets.rowBySlug(slug);
  await srv.models.assets.setFields(row.id, { expires_at: Date.now() - 1000 });
  let r = await anon.get(`/api/assets/${slug}`);
  assert.equal(r.status, 410);
  assert.equal(r.json_.expired, 'expired');
  assert.equal((await anon.get(`/api/assets/${slug}/download`)).status, 410);
  assert.equal((await alice.get(`/api/assets/${slug}`)).status, 200, 'owner still sees it');

  // The owner makes it permanent again.
  r = await alice.post(`/api/assets/${slug}/edit`, baseFields({ title: 'Short Lived', expiry: 'never' }));
  assert.equal(r.status, 200, r.body_.toString());
  assert.equal((await anon.get(`/api/assets/${slug}`)).status, 200);
  assert.equal((await anon.get(`/api/assets/${slug}`)).json_.asset.expires_at, null);
});

test('expiry and limit values are validated', async () => {
  for (const bad of [{ expiresIn: 0.5 }, { expiresIn: 600000 }, { expiresIn: 'soon' }, { maxDownloads: -1 }, { password: 'abc' }]) {
    const res = await alice.createAsset(baseFields(bad), { file: zip() });
    assert.equal(res.status, 400, JSON.stringify(bad));
  }
});

test('download limits', async () => {
  const { slug } = (await alice.createAsset(baseFields({ title: 'Two Downloads', maxDownloads: 2 }), { file: zip() })).json_;
  const one = client(srv.base);
  assert.equal((await one.get(`/api/assets/${slug}`)).json_.asset.downloads_left, 2);
  const row = await srv.models.assets.rowBySlug(slug);
  await srv.models.assets.addDownload(row.id);
  await srv.models.assets.addDownload(row.id);
  const r = await one.get(`/api/assets/${slug}`);
  assert.equal(r.status, 410);
  assert.equal(r.json_.expired, 'limit');
});

test('password-protected files', async () => {
  const { slug } = (await alice.createAsset(baseFields({ title: 'Locked Pack', password: 'open sesame' }), { file: fakeVideo })).json_;
  const visitor = client(srv.base);
  let r = await visitor.get(`/api/assets/${slug}`);
  assert.equal(r.status, 200);
  assert.equal(r.json_.asset.locked, true);
  assert.equal(r.json_.asset.unlocked, false);
  assert.equal(r.json_.asset.videoSrc, null, 'media hidden while locked');
  assert.equal((await visitor.get(`/api/assets/${slug}/download`)).status, 403);

  r = await visitor.post(`/api/assets/${slug}/unlock`, { password: 'wrong' });
  assert.equal(r.status, 400);
  r = await visitor.post(`/api/assets/${slug}/unlock`, { password: 'open sesame' });
  assert.equal(r.status, 200);
  assert.equal((await visitor.get(`/api/assets/${slug}`)).json_.asset.unlocked, true);
  assert.equal((await visitor.get(`/api/assets/${slug}/download`)).status, 302);

  // Changing the password locks everyone out again; removing it unlocks for all.
  await alice.post(`/api/assets/${slug}/edit`, baseFields({ title: 'Locked Pack', password: 'new secret' }));
  assert.equal((await visitor.get(`/api/assets/${slug}/download`)).status, 403);
  await alice.post(`/api/assets/${slug}/edit`, baseFields({ title: 'Locked Pack', removePassword: true }));
  assert.equal((await client(srv.base).get(`/api/assets/${slug}/download`)).status, 302);
  assert.equal((await alice.get(`/api/assets/${slug}`)).json_.asset.locked, false);
});

test('anonymous uploads with a private manage key', async () => {
  const anon = client(srv.base);
  const res = await anon.createAsset(baseFields({ title: 'No Account Pack' }), { file: zip('anon.zip') });
  assert.equal(res.status, 201, res.body_.toString());
  const { slug, manageKey, manageUrl } = res.json_;
  assert.ok(manageKey && manageUrl.includes(manageKey));

  const page = (await client(srv.base).get(`/api/assets/${slug}`)).json_.asset;
  assert.equal(page.anonymous, true);
  assert.equal(page.canEdit, false);
  assert.equal((await anon.get(`/api/assets/${slug}?key=${manageKey}`)).json_.asset.canEdit, true);

  // Someone else's anonymous upload tickets can't be claimed.
  const other = client(srv.base);
  const t = (await anon.post('/api/uploads', { files: [{ field: 'file', name: 'x.zip', size: 4 }] })).json_.uploads[0];
  const steal = await other.post('/api/assets', { ...baseFields(), uploads: { file: t.id } });
  assert.equal(steal.status, 400);

  // Without the key nobody can change it; with it, edit and delete work.
  assert.equal((await other.post(`/api/assets/${slug}/delete`)).status, 403);
  let r = await other.post(`/api/assets/${slug}/edit`, { ...baseFields({ title: 'Renamed Anon' }), manageKey });
  assert.equal(r.status, 200, r.body_.toString());
  r = await other.post(`/api/assets/${slug}/delete`, { manageKey });
  assert.equal(r.status, 200);

  // The system account never shows up as a creator or counts as a member.
  assert.equal((await client(srv.base).get('/api/users/anonymous')).status, 404);
  const creators = (await client(srv.base).get('/api/creators')).json_.creators;
  assert.ok(!creators.some((c) => c.username === 'anonymous'));
  assert.ok(!(await client(srv.base).get('/api/sitemap/users')).json_.items.some((u) => u.username === 'anonymous'));
});

test('anonymous uploads have their own size limit', async () => {
  const anon = client(srv.base);
  const max = srv.config.anonMaxUpload;
  const r = await anon.post('/api/uploads', { files: [{ field: 'file', name: 'big.zip', size: max + 1 }] });
  assert.equal(r.status, 400);
  assert.match(r.json_.error, /Anonymous uploads/);
});

test('profile photo and social links', async () => {
  const up = await alice.uploadFiles({ avatar: { name: 'me.png', data: png } });
  assert.equal(up.res.status, 201, up.res.body_.toString());
  let r = await alice.post('/api/me/avatar', { upload: up.ids.avatar });
  assert.equal(r.status, 200, r.body_.toString());
  assert.ok(r.json_.avatar_url);
  assert.ok((await alice.get('/api/session')).json_.user.avatar_url);

  r = await alice.post('/api/me/profile', {
    display_name: 'Alice', bio: '', website: '', email: '',
    social_youtube: '@alicecuts', social_x: 'https://twitter.com/alice', social_tiktok: '', social_instagram: 'https://evil.example/alice',
  });
  assert.equal(r.status, 400);
  assert.ok(r.json_.errors.social_instagram);
  r = await alice.post('/api/me/profile', { display_name: 'Alice', bio: '', website: '', email: '', social_youtube: '@alicecuts', social_x: 'https://twitter.com/alice' });
  assert.equal(r.status, 200, r.body_.toString());
  const profile = (await client(srv.base).get('/api/users/alice')).json_.profile;
  assert.deepEqual(profile.socials, { youtube: 'https://www.youtube.com/@alicecuts', x: 'https://twitter.com/alice' });
  assert.ok(profile.avatar_url);

  // Anonymous visitors can't upload avatars.
  const anon = client(srv.base);
  assert.equal((await anon.post('/api/uploads', { files: [{ field: 'avatar', name: 'a.png', size: 10 }] })).status, 400);

  r = await alice.post('/api/me/avatar/remove');
  assert.equal(r.status, 200);
  assert.equal((await alice.get('/api/session')).json_.user.avatar_url, null);
});
