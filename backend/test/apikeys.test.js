'use strict';
// Personal API keys: creating, scopes, expiry, revoking, and using a key for the whole upload flow.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { startServer, client, baseFields, fakeVideo } = require('./helpers');

let srv;
let alice;

// A script-like client: no cookies, no CSRF token, just the key.
function keyClient(token, header = 'authorization') {
  async function request(method, p, json, extra = {}) {
    const headers = { ...extra, [header]: header === 'authorization' ? `Bearer ${token}` : token };
    if (json !== undefined) headers['content-type'] = 'application/json';
    const res = await fetch(srv.base + p, { method, headers, body: json === undefined ? undefined : JSON.stringify(json), redirect: 'manual' });
    res.json_ = await res.json().catch(() => null);
    return res;
  }
  return {
    get: (p, extra) => request('GET', p, undefined, extra),
    post: (p, json = {}, extra) => request('POST', p, json, extra),
    async upload(field, name, data) {
      const t = await request('POST', '/api/uploads', { files: [{ field, name, size: data.length }] });
      if (t.status !== 201) return { res: t };
      const ticket = t.json_.uploads[0];
      const put = await fetch(srv.base + ticket.url, { method: 'PUT', headers: ticket.headers, body: data });
      assert.equal(put.status, 200);
      return { res: t, id: ticket.id };
    },
  };
}

async function makeKey(body) {
  const res = await alice.post('/api/me/keys', { name: 'Test key', expires: 'never', ...body });
  return res;
}

before(async () => {
  srv = await startServer();
  // The first account becomes a moderator; alice is an ordinary user.
  await client(srv.base).signup('founder');
  alice = client(srv.base);
  await alice.signup('alice');
});
after(() => srv.stop());

test('creating a key returns the token once, listing never does', async () => {
  const res = await makeKey({ name: 'Upload script', scopes: ['assets:read'], expires: 30 });
  assert.equal(res.status, 201, JSON.stringify(res.json_));
  assert.match(res.json_.token, /^cfx_[\w-]{40}$/);
  assert.deepEqual(res.json_.key.scopes, ['assets:read']);
  assert.ok(res.json_.key.expires_at > Date.now() + 29 * 24 * 3600 * 1000);
  const list = await alice.get('/api/me/keys');
  assert.equal(list.status, 200);
  const k = list.json_.keys.find((x) => x.id === res.json_.key.id);
  assert.equal(k.name, 'Upload script');
  assert.equal(k.prefix, res.json_.token.slice(0, 12));
  assert.ok(!JSON.stringify(list.json_).includes(res.json_.token), 'token never listed');
  assert.ok(list.json_.scopes.every((s) => s.id !== 'admin'), 'non-moderators are not offered moderation');
});

test('validates name, scopes and expiry', async () => {
  let r = await makeKey({ name: '', scopes: ['assets:read'] });
  assert.equal(r.status, 400); assert.ok(r.json_.errors.name);
  r = await makeKey({ scopes: [] });
  assert.ok(r.json_.errors.scopes);
  r = await makeKey({ scopes: ['admin'] });
  assert.match(r.json_.errors.scopes, /moderators/);
  r = await makeKey({ scopes: ['assets:read'], expires: undefined, expiresAt: '2001-01-01' });
  assert.match(r.json_.errors.expires, /future/);
  r = await makeKey({ scopes: ['assets:read'], expires: 0 });
  assert.ok(r.json_.errors.expires);
  r = await makeKey({ scopes: ['assets:read'], expires: undefined, expiresAt: '2099-12-31' });
  assert.match(r.json_.errors.expires, /10 years/);
  const nextMonth = new Date(Date.now() + 40 * 24 * 3600 * 1000).toISOString().slice(0, 10);
  r = await makeKey({ scopes: ['assets:read'], expires: undefined, expiresAt: nextMonth });
  assert.equal(r.status, 201);
});

test('a key only does what its scopes allow', async () => {
  const token = (await makeKey({ scopes: ['assets:read'] })).json_.token;
  const k = keyClient(token);
  assert.equal((await k.get('/api/me/assets')).status, 200);
  assert.equal((await k.get('/api/me/storage')).status, 200);
  let r = await k.post('/api/uploads', { files: [{ field: 'file', name: 'a.mp4', size: 10 }] });
  assert.equal(r.status, 403);
  assert.equal(r.json_.missing_scope, 'assets:write');
  assert.equal((await k.get('/api/me/saved')).status, 403);
  // Without profile:read the session looks logged out instead of failing.
  r = await k.get('/api/session');
  assert.equal(r.status, 200);
  assert.equal(r.json_.user, null);
  // Never available to keys, whatever their scopes.
  for (const [m, p] of [['GET', '/api/me/keys'], ['POST', '/api/me/keys'], ['POST', '/api/me/password'], ['POST', '/api/auth/logout']]) {
    r = m === 'GET' ? await k.get(p) : await k.post(p, {});
    assert.equal(r.status, 403, `${m} ${p}`);
  }
  // X-API-Key works too.
  assert.equal((await keyClient(token, 'x-api-key').get('/api/me/assets')).status, 200);
});

test('full access: upload, create, edit, save, profile and delete with no cookies or CSRF token', async () => {
  const res = await makeKey({ name: 'Everything', scopes: 'all' });
  assert.deepEqual(res.json_.key.scopes, ['*']);
  const k = keyClient(res.json_.token);
  assert.equal((await k.get('/api/session')).json_.user.username, 'alice');

  const up = await k.upload('file', fakeVideo.name, fakeVideo.data);
  assert.equal(up.res.status, 201, JSON.stringify(up.res.json_));
  let r = await k.post('/api/assets', { ...baseFields({ title: 'Made by a script', visibility: 'unlisted' }), uploads: { file: up.id } });
  assert.equal(r.status, 201, JSON.stringify(r.json_));
  const { slug } = r.json_;

  // Unlisted: missing from public listings, but in the owner's own list and downloadable.
  assert.ok((await k.get('/api/me/assets')).json_.result.items.some((a) => a.slug === slug));
  assert.ok(!(await client(srv.base).get('/api/assets?q=script')).json_.result.items.some((a) => a.slug === slug));
  assert.equal((await k.get(`/api/assets/${slug}`)).json_.asset.isOwner, true);
  assert.equal((await k.get(`/api/assets/${slug}/download`)).status, 302);

  r = await k.post(`/api/assets/${slug}/edit`, { ...baseFields({ title: 'Renamed by a script' }) });
  assert.equal(r.status, 200, JSON.stringify(r.json_));
  assert.equal((await k.get(`/api/assets/${slug}`)).json_.asset.title, 'Renamed by a script');

  assert.equal((await k.post(`/api/assets/${slug}/save`, {})).status, 200);
  assert.ok((await k.get('/api/me/saved')).json_.result.items.some((a) => a.slug === slug));

  r = await k.post('/api/me/profile', { display_name: 'Alice Bot', bio: '', website: '', email: '' });
  assert.equal(r.status, 200, JSON.stringify(r.json_));

  assert.equal((await k.post(`/api/assets/${slug}/delete`, {})).status, 200);
  assert.equal((await k.get(`/api/assets/${slug}`)).status, 404);
});

test('password-locked files: API clients unlock with a header token', async () => {
  const owner = keyClient((await makeKey({ scopes: 'all' })).json_.token);
  const up = await owner.upload('file', 'pack.zip', Buffer.from('PK locked'));
  const slug = (await owner.post('/api/assets', { ...baseFields({ title: 'Locked pack', password: 'open sesame' }), uploads: { file: up.id } })).json_.slug;

  await client(srv.base).signup('bob');
  const bob = client(srv.base);
  await bob.login('bob');
  const bobKey = keyClient((await bob.post('/api/me/keys', { name: 'Bob', scopes: ['assets:read'], expires: 'never' })).json_.token);
  assert.equal((await bobKey.get(`/api/assets/${slug}/download`)).status, 403);
  const r = await bobKey.post(`/api/assets/${slug}/unlock`, { password: 'open sesame' });
  assert.equal(r.status, 200);
  assert.ok(r.json_.unlock_token);
  assert.equal((await bobKey.get(`/api/assets/${slug}/download`, { 'x-unlock-token': r.json_.unlock_token })).status, 302);
});

test('revoked, expired and made-up keys are refused, even with a valid session cookie', async () => {
  const res = await makeKey({ scopes: ['assets:read'] });
  const k = keyClient(res.json_.token);
  assert.equal((await alice.post(`/api/me/keys/${res.json_.key.id}/revoke`, {})).status, 200);
  let r = await k.get('/api/me/assets');
  assert.equal(r.status, 401);
  assert.match(r.json_.error, /invalid, expired or revoked/);

  const exp = await makeKey({ scopes: ['assets:read'] });
  await srv.db.run('UPDATE api_keys SET expires_at = ? WHERE id = ?', [Date.now() - 1000, exp.json_.key.id]);
  assert.equal((await keyClient(exp.json_.token).get('/api/me/assets')).status, 401);
  assert.ok((await alice.get('/api/me/keys')).json_.keys.find((x) => x.id === exp.json_.key.id).expired);

  // A bad key fails even when the request also carries alice's cookies.
  r = await alice.get('/api/me/assets', { headers: { authorization: 'Bearer cfx_not-a-real-key-at-all-000000' } });
  assert.equal(r.status, 401);
  // Revoking someone else's key does nothing.
  const other = client(srv.base);
  await other.signup('mallory');
  const mine = await makeKey({ scopes: ['assets:read'] });
  assert.equal((await other.post(`/api/me/keys/${mine.json_.key.id}/revoke`, {})).status, 404);
});

test('moderators can give a key moderation access', async () => {
  const founder = client(srv.base);
  await founder.login('founder');
  const offered = (await founder.get('/api/me/keys')).json_.scopes.map((x) => x.id);
  assert.ok(offered.includes('admin'));
  const k = keyClient((await founder.post('/api/me/keys', { name: 'Mod bot', scopes: ['admin'], expires: 7 })).json_.token);
  assert.equal((await k.get('/api/admin')).status, 200);
  const plain = keyClient((await founder.post('/api/me/keys', { name: 'Reader', scopes: ['assets:read'], expires: 7 })).json_.token);
  assert.equal((await plain.get('/api/admin')).status, 403);
  // Full access includes moderation for moderators, but never for ordinary users.
  const fullMod = keyClient((await founder.post('/api/me/keys', { name: 'All', scopes: 'all', expires: 7 })).json_.token);
  assert.equal((await fullMod.get('/api/admin')).status, 200);
  const fullAlice = keyClient((await alice.post('/api/me/keys', { name: 'All', scopes: 'all', expires: 7 })).json_.token);
  assert.equal((await fullAlice.get('/api/admin')).status, 404);
});

test('banned users lose API access', async () => {
  const carol = client(srv.base);
  await carol.signup('carol');
  const token = (await carol.post('/api/me/keys', { name: 'c', scopes: ['assets:read'], expires: 'never' })).json_.token;
  const u = await srv.models.users.byUsername('carol');
  await srv.models.users.setBanned(u.id, true);
  assert.equal((await keyClient(token).get('/api/me/assets')).status, 401);
});
