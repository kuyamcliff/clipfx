'use strict';
// "Sign in with ClipFX" for apps such as MCP clients: OAuth 2.1 authorization code flow with PKCE
// and dynamic client registration. The access token an app receives is an ordinary API key tied to
// that app, so it shows up (and can be revoked) under Settings > API keys, with the scopes the user
// approved. The frontend serves the OAuth URLs and the consent page; this file holds the logic.
const crypto = require('node:crypto');
const { SCOPE_IDS, scopesFor, DAY, FULL } = require('./apikeys');

const KEY_DAYS = [30, 90, 365];
const BLOCKED_SCHEMES = new Set(['javascript:', 'data:', 'file:', 'vbscript:', 'about:', 'blob:']);

// https anywhere, http only on this machine, or an app's own scheme (cursor://, vscode://).
function validRedirect(uri) {
  let u;
  try { u = new URL(uri); } catch { return false; }
  if (u.hash || u.username || u.password || String(uri).length > 500) return false;
  if (u.protocol === 'https:') return true;
  if (u.protocol === 'http:') return ['localhost', '127.0.0.1', '[::1]'].includes(u.hostname);
  return /^[a-z][a-z0-9+.-]*:$/.test(u.protocol) && !BLOCKED_SCHEMES.has(u.protocol);
}

const oauthError = (res, status, error, description) => res.status(status).json({ error, error_description: description });

function routes(app, ctx) {
  const { models, requireUser, rate } = ctx;

  // RFC 7591 dynamic client registration. Public clients only (PKCE, no secret).
  app.post('/api/oauth/register', rate('oauth-register', 30, 3600 * 1000), async (req, res) => {
    const b = req.body || {};
    const uris = Array.isArray(b.redirect_uris) ? b.redirect_uris.map(String) : [];
    if (!uris.length || uris.length > 10 || !uris.every(validRedirect)) {
      return oauthError(res, 400, 'invalid_redirect_uri', 'Send 1 to 10 redirect_uris: https, http on localhost, or an app scheme.');
    }
    const name = String(b.client_name || '').replace(/\s+/g, ' ').trim().slice(0, 60) || 'MCP client';
    const id = await models.oauthApps.register({ name, redirectUris: uris });
    return res.status(201).json({
      client_id: id, client_name: name, redirect_uris: uris, client_id_issued_at: Math.floor(Date.now() / 1000),
      token_endpoint_auth_method: 'none', grant_types: ['authorization_code'], response_types: ['code'],
    });
  });

  app.get('/api/oauth/clients/:id', async (req, res) => {
    const c = await models.oauthApps.get(req.params.id);
    if (!c) return res.fail(404, 'Unknown app.');
    return res.ok({ client: { id: c.id, name: c.name, redirect_uris: c.redirectUris } });
  });

  // The signed-in user approved the consent screen. Needs a real session: keys can't approve apps.
  app.post('/api/oauth/authorize', requireUser, rate('oauth-authorize', 60, 3600 * 1000), async (req, res) => {
    if (req.apiKey) return res.fail(403, 'Approve apps on the website.');
    const b = req.body || {};
    const client = await models.oauthApps.get(b.client_id);
    if (!client) return res.fail(400, 'Unknown app. Try connecting again.');
    if (!client.redirectUris.includes(String(b.redirect_uri))) return res.fail(400, 'That redirect address isn’t registered for this app.');
    if (b.code_challenge_method !== 'S256' || !/^[\w-]{43,128}$/.test(String(b.code_challenge || ''))) return res.fail(400, 'The app must use PKCE (S256).');
    const allowed = new Set(scopesFor(req.user).map((s) => s.id));
    const wantsFull = b.scopes === 'all' || b.scopes === FULL;
    const scopes = wantsFull ? [FULL] : [...new Set((Array.isArray(b.scopes) ? b.scopes : [b.scopes]).filter(Boolean).map(String))];
    if (!scopes.length) return res.fail(400, 'Pick at least one permission.', { scopes: 'Pick at least one permission.' });
    if (!wantsFull && scopes.some((s) => !SCOPE_IDS.has(s) || !allowed.has(s))) return res.fail(400, 'Unknown permission.', { scopes: 'Unknown permission.' });
    const days = b.expires === 'never' ? null : Number(b.expires);
    if (days !== null && !KEY_DAYS.includes(days)) return res.fail(400, 'Choose how long the connection lasts.', { expires: 'Choose how long the connection lasts.' });
    const code = await models.oauthApps.createCode({
      clientId: client.id, userId: req.user.id, redirectUri: String(b.redirect_uri), challenge: String(b.code_challenge), scopes, keyDays: days,
    });
    return res.ok({ code });
  });

  // Code + verifier → API key. Errors use the OAuth format clients expect.
  app.post('/api/oauth/token', rate('oauth-token', 60, 3600 * 1000), async (req, res) => {
    const b = req.body || {};
    if (b.grant_type !== 'authorization_code') return oauthError(res, 400, 'unsupported_grant_type', 'Only authorization_code is supported. Sign in again when the token expires.');
    const row = await models.oauthApps.takeCode(b.code);
    if (!row) return oauthError(res, 400, 'invalid_grant', 'The code is invalid, used or expired. Sign in again.');
    if (b.client_id && b.client_id !== row.client_id) return oauthError(res, 400, 'invalid_grant', 'The code was issued to a different app.');
    if (String(b.redirect_uri || '') !== row.redirect_uri) return oauthError(res, 400, 'invalid_grant', 'redirect_uri doesn’t match.');
    const verifier = String(b.code_verifier || '');
    const challenge = crypto.createHash('sha256').update(verifier).digest('base64url');
    if (!/^[\w.~-]{43,128}$/.test(verifier) || challenge !== row.challenge) return oauthError(res, 400, 'invalid_grant', 'PKCE verification failed.');
    const user = await models.users.byId(row.user_id);
    if (!user || user.banned) return oauthError(res, 400, 'invalid_grant', 'This account can’t be used.');
    const client = await models.oauthApps.get(row.client_id);
    const scopes = row.scopes.split(' ').filter(Boolean);
    const days = row.key_days === null || row.key_days === undefined ? null : Number(row.key_days);
    await models.apiKeys.revokeForClient(user.id, client.id);
    const { token } = await models.apiKeys.create(user.id, {
      name: client.name.slice(0, 60), scopes, expiresAt: days ? Date.now() + days * DAY : null, clientId: client.id,
    });
    res.setHeader('Cache-Control', 'no-store');
    return res.json({
      access_token: token, token_type: 'Bearer', scope: scopes.join(' '),
      ...(days ? { expires_in: days * 24 * 3600 } : {}),
    });
  });
}

module.exports = { routes, validRedirect, KEY_DAYS };
