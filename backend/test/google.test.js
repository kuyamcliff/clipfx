'use strict';
// "Continue with Google" against a stand-in for Google's token endpoint.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const { startServer, client } = require('./helpers');

const CLIENT_ID = 'test-client.apps.googleusercontent.com';
let srv;
let google;
let nextClaims = {};
let lastExchange = null;

const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
const idToken = (claims) => `${b64({ alg: 'RS256' })}.${b64(claims)}.sig`;

before(async () => {
  google = http.createServer((req, res) => {
    let body = '';
    req.on('data', (c) => { body += c; });
    req.on('end', () => {
      lastExchange = Object.fromEntries(new URLSearchParams(body));
      if (lastExchange.code === 'bad') { res.writeHead(400, { 'content-type': 'application/json' }); return res.end('{"error":"invalid_grant"}'); }
      const claims = { iss: 'https://accounts.google.com', aud: CLIENT_ID, exp: Math.floor(Date.now() / 1000) + 3600, email_verified: true, ...nextClaims };
      res.writeHead(200, { 'content-type': 'application/json' });
      return res.end(JSON.stringify({ access_token: 'x', id_token: idToken(claims) }));
    });
  });
  await new Promise((r) => google.listen(0, '127.0.0.1', r));
  srv = await startServer({
    google: { clientId: CLIENT_ID, clientSecret: 'shh', authUrl: 'https://accounts.google.com/o/oauth2/v2/auth', tokenUrl: `http://127.0.0.1:${google.address().port}/token` },
  });
});

after(async () => {
  await srv.stop();
  google.close();
});

async function signInWithGoogle(c, claims, code = 'good') {
  nextClaims = claims;
  const start = await c.get('/api/auth/google/start');
  assert.equal(start.status, 200);
  return c.post('/api/auth/google', { code, verifier: start.json_.verifier });
}

test('meta says Google sign-in is available, and the start URL is complete', async () => {
  const c = client(srv.base);
  assert.equal((await c.get('/api/meta')).json_.config.googleAuth, true);
  const { url, state, verifier } = (await c.get('/api/auth/google/start')).json_;
  const u = new URL(url);
  assert.equal(u.searchParams.get('client_id'), CLIENT_ID);
  assert.equal(u.searchParams.get('redirect_uri'), 'http://frontend.test/auth/google/callback');
  assert.equal(u.searchParams.get('state'), state);
  assert.equal(u.searchParams.get('code_challenge_method'), 'S256');
  assert.ok(verifier.length > 40);
});

test('first Google sign-in creates an account; the next one logs into it', async () => {
  const c = client(srv.base);
  let res = await signInWithGoogle(c, { sub: 'g-1', email: 'Jane.Doe@gmail.com', name: 'Jane Doe' });
  assert.equal(res.status, 201, res.body_.toString());
  assert.equal(res.json_.created, true);
  assert.equal(res.json_.user.username, 'jane_doe');
  assert.equal(res.json_.user.email, 'jane.doe@gmail.com');
  assert.equal(res.json_.user.has_password, false);
  assert.equal(lastExchange.redirect_uri, 'http://frontend.test/auth/google/callback');
  assert.equal(lastExchange.client_secret, 'shh');
  assert.equal((await c.get('/api/session')).json_.user.username, 'jane_doe');

  const again = client(srv.base);
  res = await signInWithGoogle(again, { sub: 'g-1', email: 'jane.doe@gmail.com', name: 'Jane Doe' });
  assert.equal(res.status, 200);
  assert.equal(res.json_.created, false);
  assert.equal(res.json_.user.username, 'jane_doe');

  // A different Google account with the same name gets its own username.
  res = await signInWithGoogle(client(srv.base), { sub: 'g-2', email: 'jane.doe@example.org', name: 'Jane Doe' });
  assert.equal(res.json_.user.username, 'jane_doe2');
});

test('a verified Google email links to the existing account with that email', async () => {
  const c = client(srv.base);
  await c.post('/api/auth/signup', { username: 'bob', email: 'bob@example.org', password: 'correct horse battery', agree: true });
  const res = await signInWithGoogle(client(srv.base), { sub: 'g-bob', email: 'BOB@example.org', name: 'Robert' });
  assert.equal(res.status, 200);
  assert.equal(res.json_.user.username, 'bob');
  // Unverified emails never link.
  const other = await signInWithGoogle(client(srv.base), { sub: 'g-fake', email: 'bob@example.org', email_verified: false, name: 'Not Bob' });
  assert.notEqual(other.json_.user.username, 'bob');
  assert.equal(other.json_.user.email, '');
});

test('bad codes and tokens for another app are refused', async () => {
  let res = await signInWithGoogle(client(srv.base), { sub: 'g-x', email: 'x@example.org' }, 'bad');
  assert.equal(res.status, 400);
  res = await signInWithGoogle(client(srv.base), { sub: 'g-x', email: 'x@example.org', aud: 'someone-else' });
  assert.equal(res.status, 400);
  res = await signInWithGoogle(client(srv.base), { sub: 'g-x', email: 'x@example.org', exp: 1 });
  assert.equal(res.status, 400);
  assert.equal((await client(srv.base).post('/api/auth/google', { code: 'good' })).status, 400, 'verifier required');
});

test('Google-only accounts can set a password and delete themselves', async () => {
  const c = client(srv.base);
  await signInWithGoogle(c, { sub: 'g-pw', email: 'pw@example.org', name: 'Pat Writer' });
  assert.equal((await c.post('/api/auth/login', { login: 'pw@example.org', password: '' })).status, 401, 'no empty-password login');
  let res = await c.post('/api/me/password', { password: 'brand new password' });
  assert.equal(res.status, 200, res.body_.toString());
  assert.equal((await client(srv.base).post('/api/auth/login', { login: 'pat_writer', password: 'brand new password' })).status, 200);

  const d = client(srv.base);
  await signInWithGoogle(d, { sub: 'g-del', email: 'del@example.org', name: 'Del Ete' });
  res = await d.post('/api/me/delete', { confirm: 'wrong' });
  assert.equal(res.status, 400);
  res = await d.post('/api/me/delete', { confirm: 'del' });
  assert.equal(res.status, 200, res.body_.toString());
});

test('without Google settings the endpoints are off', async () => {
  const plain = await startServer();
  try {
    const c = client(plain.base);
    assert.equal((await c.get('/api/meta')).json_.config.googleAuth, false);
    assert.equal((await c.get('/api/auth/google/start')).status, 404);
  } finally {
    await plain.stop();
  }
});
