'use strict';
const path = require('node:path');

function bool(value, fallback) {
  if (value === undefined || value === '') return fallback;
  return /^(1|true|yes|on)$/i.test(String(value));
}

function num(value, fallback) {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

function trustProxy(value) {
  if (value === undefined || value === '' || /^(0|false|no|off)$/i.test(value)) return false;
  if (/^(true|yes|on)$/i.test(value)) return true;
  const n = Number(value);
  return Number.isInteger(n) ? n : value; // express also accepts subnet strings like "loopback"
}

function loadConfig(overrides = {}) {
  const env = process.env;
  const root = path.resolve(__dirname, '..', '..');
  const production = env.NODE_ENV === 'production';
  const dataDir = path.resolve(overrides.dataDir || env.DATA_DIR || path.join(root, 'data'));

  const config = {
    root,
    production,
    host: env.HOST || '0.0.0.0',
    port: num(env.PORT, 3000),
    siteName: env.SITE_NAME || 'ClipFX',
    tagline: env.SITE_TAGLINE || 'Free assets for editors, by editors.',
    baseUrl: (env.BASE_URL || '').replace(/\/+$/, ''),
    dataDir,
    maxUploadMB: num(env.MAX_UPLOAD_MB, 2048),
    maxPreviewMB: num(env.MAX_PREVIEW_MB, 250),
    userQuotaMB: num(env.USER_QUOTA_MB, 25600),
    donateUrl: env.DONATE_URL || '',
    contactEmail: env.CONTACT_EMAIL || '',
    sourceUrl: env.SOURCE_URL || 'https://github.com/kuyamcliff/clipfx',
    adminUsernames: (env.ADMIN_USERNAMES || '').split(',').map((s) => s.trim().toLowerCase()).filter(Boolean),
    openSignups: bool(env.OPEN_SIGNUPS, true),
    cookieSecure: bool(env.COOKIE_SECURE, production),
    trustProxy: trustProxy(env.TRUST_PROXY),
    mediaProcessing: bool(env.MEDIA_PROCESSING, true),
    ffmpegPath: env.FFMPEG_PATH || 'ffmpeg',
    ffprobePath: env.FFPROBE_PATH || 'ffprobe',
    rateLimits: bool(env.RATE_LIMITS, true),
    logRequests: bool(env.LOG_REQUESTS, !production),
    ...overrides,
  };
  config.uploadDir = overrides.uploadDir || path.join(config.dataDir, 'uploads');
  config.tmpDir = overrides.tmpDir || path.join(config.dataDir, 'tmp');
  config.dbFile = overrides.dbFile || env.DB_FILE || path.join(config.dataDir, 'clipfx.db');
  return config;
}

module.exports = { loadConfig };
