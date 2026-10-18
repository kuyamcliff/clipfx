'use strict';
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

function bool(value, fallback) {
  if (value === undefined || value === '') return fallback;
  return /^(1|true|yes|on)$/i.test(String(value));
}

// Added to CSS and JS URLs so caches (the browser, Cloudflare) never serve old files with new
// pages. On Cloudflare it's written at build time (scripts/build.js); locally, a hash of the files.
function assetVersion(env) {
  if (env.ASSET_VERSION) return env.ASSET_VERSION;
  try { return require('./asset-version.json').version; } catch { /* not built: hash the files */ }
  try {
    const hash = crypto.createHash('sha256');
    for (const f of ['css/style.css', 'js/app.js']) hash.update(fs.readFileSync(path.join(__dirname, '..', 'public', 'static', f)));
    return hash.digest('hex').slice(0, 12);
  } catch {
    return Date.now().toString(36);
  }
}

function loadConfig(overrides = {}) {
  const env = process.env;
  const production = env.NODE_ENV === 'production';
  return {
    production,
    port: Number(env.PORT) || 3000,
    host: env.HOST || '0.0.0.0',
    // Where the ClipFX API runs (Render). No trailing slash.
    backendUrl: (env.BACKEND_URL || 'http://localhost:4000').replace(/\/+$/, ''),
    // Optional: this site's public address. Otherwise taken from the request.
    publicUrl: (env.PUBLIC_URL || '').replace(/\/+$/, ''),
    internalSecret: env.INTERNAL_SECRET || '',
    // Developer pages are served on <username>.PAGES_DOMAIN (e.g. clipfx.me). Empty = off.
    pagesDomain: (env.PAGES_DOMAIN || '').toLowerCase(),
    cookieSecure: bool(env.COOKIE_SECURE, production),
    logRequests: bool(env.LOG_REQUESTS, !production),
    assetVersion: assetVersion(env),
    ...overrides,
  };
}

module.exports = { loadConfig };
