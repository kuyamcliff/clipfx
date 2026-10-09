'use strict';

function bool(value, fallback) {
  if (value === undefined || value === '') return fallback;
  return /^(1|true|yes|on)$/i.test(String(value));
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
    ...overrides,
  };
}

module.exports = { loadConfig };
