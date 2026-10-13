'use strict';
// "Sign in with ClipFX" for MCP clients (OAuth 2.1 + PKCE, dynamic registration).
// Discovery documents, registration and the token endpoint are cookie-free and open to any origin;
// the consent page (/oauth/authorize) lives with the other pages because it needs the user's session.
const express = require('express');

// Advertised to clients, which usually request all of them. Full access (*), account deletion and
// moderation stay off the list, so they're only granted when the user ticks them on the consent page.
const SCOPES_SUPPORTED = ['assets:read', 'assets:write', 'assets:delete', 'saved:read', 'saved:write', 'profile:read', 'profile:write', 'reports:write'];

function createOAuth({ backend, config }) {
  const origin = (req) => config.publicUrl || `${req.protocol}://${req.get('host')}`;

  const resourceMetadata = (req) => ({
    resource: `${origin(req)}/mcp`,
    authorization_servers: [origin(req)],
    scopes_supported: SCOPES_SUPPORTED,
    bearer_methods_supported: ['header'],
    resource_name: 'ClipFX',
    resource_documentation: `${origin(req)}/developers/mcp`,
  });
  const serverMetadata = (req) => {
    const o = origin(req);
    return {
      issuer: o,
      authorization_endpoint: `${o}/oauth/authorize`,
      token_endpoint: `${o}/oauth/token`,
      registration_endpoint: `${o}/oauth/register`,
      response_types_supported: ['code'],
      grant_types_supported: ['authorization_code'],
      code_challenge_methods_supported: ['S256'],
      token_endpoint_auth_methods_supported: ['none'],
      scopes_supported: SCOPES_SUPPORTED,
      service_documentation: `${o}/developers/mcp`,
    };
  };

  const open = express.Router();
  open.use((req, res, next) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, Mcp-Protocol-Version');
    res.setHeader('Cache-Control', 'no-store');
    if (req.method === 'OPTIONS') return res.status(204).end();
    return next();
  });
  // RFC 9728 (both the plain and the per-resource path) and RFC 8414.
  open.get(['/.well-known/oauth-protected-resource', '/.well-known/oauth-protected-resource/mcp'], (req, res) => res.json(resourceMetadata(req)));
  open.get(['/.well-known/oauth-authorization-server', '/.well-known/oauth-authorization-server/mcp'], (req, res) => res.json(serverMetadata(req)));

  const body = [express.json({ limit: '20kb' }), express.urlencoded({ extended: false, limit: '20kb' })];
  const pass = (r, res) => {
    const d = r.data || {};
    if (r.status >= 500) return res.status(503).json({ error: 'temporarily_unavailable', error_description: 'ClipFX is unavailable right now. Try again in a minute.' });
    if (r.status === 429) return res.status(429).json({ error: 'slow_down', error_description: d.error || 'Too many requests.' });
    return res.status(r.status).json(d);
  };
  open.post('/oauth/register', body, async (req, res) => pass(await backend.callAs(req, 'POST', '/api/oauth/register', req.body || {}, null), res));
  open.post('/oauth/token', body, async (req, res) => {
    const b = req.body || {};
    const r = await backend.callAs(req, 'POST', '/api/oauth/token', {
      grant_type: b.grant_type, code: b.code, code_verifier: b.code_verifier, client_id: b.client_id, redirect_uri: b.redirect_uri,
    }, null);
    return pass(r, res);
  });

  return { open, resourceMetadata, serverMetadata };
}

module.exports = { createOAuth, SCOPES_SUPPORTED };
