'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

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
  return Number.isInteger(n) ? n : value;
}

// A secret that survives restarts: from the environment, or generated once and kept in the data dir.
function persistentSecret(envValue, file) {
  if (envValue) return envValue;
  try {
    return fs.readFileSync(file, 'utf8').trim();
  } catch {
    const s = crypto.randomBytes(32).toString('hex');
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, s, { mode: 0o600 });
    return s;
  }
}

function loadConfig(overrides = {}) {
  const env = process.env;
  const root = path.resolve(__dirname, '..');
  const production = env.NODE_ENV === 'production';
  const dataDir = path.resolve(overrides.dataDir || env.DATA_DIR || path.join(root, 'data'));
  const MB = 1024 * 1024;

  const config = {
    root,
    production,
    host: env.HOST || '0.0.0.0',
    port: num(env.PORT, 4000),
    siteName: env.SITE_NAME || 'ClipFX',
    // Public address of the frontend (Vercel). Used for share links and the origin check.
    baseUrl: (env.BASE_URL || env.FRONTEND_URL || '').replace(/\/+$/, ''),
    allowedOrigins: (env.ALLOWED_ORIGINS || '').split(',').map((s) => s.trim().replace(/\/+$/, '')).filter(Boolean),
    // Shared with the frontend so the backend can trust the client IP it forwards.
    internalSecret: env.INTERNAL_SECRET || '',
    dataDir,
    maxUpload: num(env.MAX_UPLOAD_MB, 2048) * MB,
    maxPreview: num(env.MAX_PREVIEW_MB, 250) * MB,
    maxThumb: 15 * MB,
    userQuota: num(env.USER_QUOTA_MB, 25600) * MB,
    // Files above this size are uploaded to R2 in parts, so a dropped connection only retries one part.
    multipartThreshold: num(env.MULTIPART_THRESHOLD_MB, 64) * MB,
    minPartSize: num(env.MIN_PART_MB, 16) * MB,
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
    storage: (env.STORAGE || (env.R2_BUCKET ? 'r2' : 'local')).toLowerCase(),
    r2: {
      accountId: env.R2_ACCOUNT_ID || '',
      endpoint: (env.R2_ENDPOINT || (env.R2_ACCOUNT_ID ? `https://${env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com` : '')).replace(/\/+$/, ''),
      accessKeyId: env.R2_ACCESS_KEY_ID || '',
      secretAccessKey: env.R2_SECRET_ACCESS_KEY || '',
      bucket: env.R2_BUCKET || '',
      region: env.R2_REGION || 'auto',
    },
    ...overrides,
  };
  if (overrides.r2) config.r2 = { ...config.r2, ...overrides.r2 };
  config.uploadDir = overrides.uploadDir || path.join(config.dataDir, 'uploads');
  config.tmpDir = overrides.tmpDir || path.join(config.dataDir, 'tmp');
  config.dbFile = overrides.dbFile || env.DB_FILE || path.join(config.dataDir, 'clipfx.db');
  config.storageSecret = overrides.storageSecret || persistentSecret(env.STORAGE_SECRET, path.join(config.dataDir, '.storage-secret'));

  if (config.storage === 'r2') {
    // S3/R2 reject multipart parts under 5 MiB (except the last one).
    config.minPartSize = Math.max(config.minPartSize, 5 * MB);
    config.multipartThreshold = Math.max(config.multipartThreshold, config.minPartSize);
    const missing = ['endpoint', 'accessKeyId', 'secretAccessKey', 'bucket'].filter((k) => !config.r2[k]);
    if (missing.length) throw new Error(`STORAGE=r2 but missing R2 settings: ${missing.join(', ')} (see .env.example)`);
  }
  return config;
}

module.exports = { loadConfig };
