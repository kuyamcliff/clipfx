'use strict';
// "Sign in with ClipFX" for MCP clients: registration, consent, PKCE token exchange.
const crypto = require('node:crypto');
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { startServer, client } = require('./helpers');

let srv;
let alice;
const REDIRECT = 'http://127.0.0.1:33418/callback';

const pkce = () => {
  const verifier = crypto.randomBytes(32).toString('base64url');
  return { verifier, challenge: crypto.createHash('sha256').update(verifier).digest('base64url') };
};
const keyGet = (token, p) => fetch(srv.base + p, { headers: { authorization: `Bearer ${token}` } });

async function register(body = {}) {
  return client(srv.base).post('/api/oauth/register', { client_name: 'Claude', redirect_uris: [REDIRECT], ...body });
}

async function connect(clientId, { scopes = 'all', expires = 90, p = pkce() } = {}) {
  const r = await alice.post('/api/oauth/authorize', { client_id: clientId, redirect_uri: REDIRECT, code_challenge: p.challenge, code_challenge_method: 'S256', scopes, expires });
  assert.equal(r.status, 200, JSON.stringify(r.json_));
  return { code: r.json_.code, ...p };
}

const exchange = (clientId, code, verifier, redirect = REDIRECT) => client(srv.base).post('/api/oauth/token', {
  grant_type: 'authorization_code', code, code_verifier: verifier, client_id: clientId, redirect_uri: redirect,
});

before(async () => {
  srv = await startServer();
  await client(srv.base).signup('founder');
  alice = client(srv.base);
  await alice.signup('alice');
});
after(() => srv.stop());

test('apps register with safe redirect addresses only', async () => {
  const ok = await register({ redirect_uris: [REDIRECT, 'https://claude.ai/api/mcp/auth_callback', 'cursor://anysphere.cursor-retrieval/oauth/callback'] });
  assert.equal(ok.status, 201);
  assert.match(ok.json_.client_id, /^app_/);
  assert.equal(ok.json_.token_endpoint_auth_method, 'none');
  for (const bad of [[], ['http://evil.example/cb'], ['javascript:alert(1)'], ['https://x.example/cb#frag'], ['not a url']]) {
    const r = await register({ redirect_uris: bad });
    assert.equal(r.status, 400, JSON.stringify(bad));
    assert.equal(r.json_.error, 'invalid_redirect_uri');
  }
});

test('consent then PKCE exchange gives a scoped key that appears under API keys', async () => {
  const id = (await register()).json_.client_id;
  const c = await connect(id, { scopes: ['assets:read', 'profile:read'], expires: 30 });
  const t = await exchange(id, c.code, c.verifier);
  assert.equal(t.status, 200, JSON.stringify(t.json_));
  assert.equal(t.json_.token_type, 'Bearer');
  assert.match(t.json_.access_token, /^cfx_/);
  assert.equal(t.json_.scope, 'assets:read profile:read');
  assert.equal(t.json_.expires_in, 30 * 24 * 3600);
  assert.equal((await keyGet(t.json_.access_token, '/api/me/assets')).status, 200);
  assert.equal((await keyGet(t.json_.access_token, '/api/me/saved')).status, 403);

  const keys = (await alice.get('/api/me/keys')).json_.keys;
  const k = keys.find((x) => x.prefix === t.json_.access_token.slice(0, 12));
  assert.equal(k.name, 'Claude');
  assert.equal(k.app, true);

  // Codes are single use.
  assert.equal((await exchange(id, c.code, c.verifier)).json_.error, 'invalid_grant');
});

test('wrong verifier, redirect or app are refused, and the code is burned', async () => {
  const id = (await register()).json_.client_id;
  let c = await connect(id);
  assert.equal((await exchange(id, c.code, pkce().verifier)).json_.error, 'invalid_grant');
  assert.equal((await exchange(id, c.code, c.verifier)).json_.error, 'invalid_grant', 'burned after a failed try');
  c = await connect(id);
  assert.equal((await exchange(id, c.code, c.verifier, 'http://127.0.0.1:1/other')).json_.error, 'invalid_grant');
  c = await connect(id);
  const other = (await register()).json_.client_id;
  assert.equal((await exchange(other, c.code, c.verifier)).json_.error, 'invalid_grant');
  assert.equal((await client(srv.base).post('/api/oauth/token', { grant_type: 'password' })).json_.error, 'unsupported_grant_type');
});

test('authorizing needs a website session, a registered redirect and PKCE', async () => {
  const id = (await register()).json_.client_id;
  const p = pkce();
  const body = { client_id: id, redirect_uri: REDIRECT, code_challenge: p.challenge, code_challenge_method: 'S256', scopes: 'all', expires: 90 };
  assert.equal((await client(srv.base).post('/api/oauth/authorize', body)).status, 401);
  assert.equal((await alice.post('/api/oauth/authorize', { ...body, redirect_uri: 'https://evil.example/cb' })).status, 400);
  assert.equal((await alice.post('/api/oauth/authorize', { ...body, code_challenge_method: 'plain' })).status, 400);
  assert.equal((await alice.post('/api/oauth/authorize', { ...body, scopes: ['admin'] })).status, 400, 'non-moderators can’t grant admin');
  assert.equal((await alice.post('/api/oauth/authorize', { ...body, expires: 7 })).status, 400);
  // An API key can't approve apps, even a full-access one.
  const token = (await alice.post('/api/me/keys', { name: 'k', scopes: 'all', expires: 'never' })).json_.token;
  const r = await fetch(`${srv.base}/api/oauth/authorize`, { method: 'POST', headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' }, body: JSON.stringify(body) });
  assert.equal(r.status, 403);
});

test('connecting the same app again replaces its old key; never-expiring connections have no expires_in', async () => {
  const id = (await register()).json_.client_id;
  let c = await connect(id);
  const first = (await exchange(id, c.code, c.verifier)).json_.access_token;
  c = await connect(id, { expires: 'never' });
  const second = await exchange(id, c.code, c.verifier);
  assert.equal(second.json_.expires_in, undefined);
  assert.equal((await keyGet(first, '/api/me/assets')).status, 401, 'old key revoked');
  assert.equal((await keyGet(second.json_.access_token, '/api/me/assets')).status, 200);
});
