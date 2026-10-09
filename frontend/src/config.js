'use strict';
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

function bool(value, fallback) {
  if (value === undefined || value === '') return fallback;
  return /^(1|true|yes|on)$/i.test(String(value));
}

// Added to CSS and JS URLs so caches (the browser, Cloudflare, Vercel) never serve old files
// with new pages. On Vercel it's the deployed commit; locally, a hash of the files.
function assetVersion(env) {
  if (env.VERCEL_GIT_COMMIT_SHA) return env.VERCEL_GIT_COMMIT_SHA.slice(0, 12);
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
  const production = env.NODE_ENV === 'production' || !!env.VERCEL;
  return {
    production,
    port: Number(env.PORT) || 3000,
    host: env.HOST || '0.0.0.0',
    // Where the ClipFX API runs (Render). No trailing slash.
    backendUrl: (env.BACKEND_URL || 'http://localhost:4000').replace(/\/+$/, ''),
    // Optional: this site's public address. Otherwise taken from the request.
    publicUrl: (env.PUBLIC_URL || '').replace(/\/+$/, ''),
    internalSecret: env.INTERNAL_SECRET || '',
    cookieSecure: bool(env.COOKIE_SECURE, production),
    logRequests: bool(env.LOG_REQUESTS, !production),
    assetVersion: assetVersion(env),
    ...overrides,
  };
}

module.exports = { loadConfig };
