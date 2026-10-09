'use strict';
// ClipFX JSON API. The frontend (Vercel) renders pages and proxies /api/* here.
// File bytes never pass through this server: browsers upload to and download from storage directly.
const fs = require('node:fs');
const express = require('express');
const { openDatabase } = require('./db');
const { createModels } = require('./models');
const { createStorage } = require('./storage');
const { createMedia } = require('./media');
const { parseCookies, safeEqual, createLimiter, createSeenCache } = require('./security');

const UPLOAD_TTL = 24 * 3600 * 1000;

async function createApp(config, { log = console } = {}) {
  fs.mkdirSync(config.dataDir, { recursive: true });
  fs.mkdirSync(config.tmpDir, { recursive: true });

  const db = await openDatabase(config);
  const storage = createStorage(config);
  const models = createModels(db, { storage });
  const media = createMedia({ config, models, storage, log });
  media.resume().catch((err) => log.warn(`[media] resume failed: ${err.message}`));

  const limiter = createLimiter();
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', config.trustProxy);

  const cookieBase = { httpOnly: true, sameSite: 'lax', secure: config.cookieSecure, path: '/' };
  const allowedHosts = new Set([config.baseUrl, ...config.allowedOrigins].filter(Boolean).map((u) => new URL(u).host));

  const ctx = {
    config, models, storage, media, log, cookieBase,
    seenView: createSeenCache(6 * 3600 * 1000),
    seenDownload: createSeenCache(6 * 3600 * 1000),
    // Share links point at the frontend.
    absolute: (req, p) => `${config.baseUrl || `${req.protocol}://${req.get('x-forwarded-host') || req.get('host')}`}${p}`,
    rate(name, max, windowMs) {
      return async (req, res, next) => {
        if (!config.rateLimits) return next();
        const r = limiter(`${name}:${req.clientIp}`, max, windowMs);
        if (r.ok) return next();
        res.setHeader('Retry-After', String(r.retryAfter));
        return res.fail(429, 'You’re doing that too often. Wait a few minutes and try again.');
      };
    },
    requireUser(req, res, next) {
      if (req.user) return next();
      return res.fail(401, 'Please log in first.');
    },
    requireAdmin(req, res, next) {
      if (req.user && req.user.role === 'admin') return next();
      return res.fail(404, 'Not found.');
    },
    async login(res, userId) {
      res.cookie('sid', await models.sessions.create(userId), { ...cookieBase, maxAge: 30 * 24 * 3600 * 1000 });
    },
    isAdmin: (req) => !!(req.user && req.user.role === 'admin'),
  };

  app.use(async (req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Cache-Control', 'no-store');
    next();
  });

  if (config.logRequests) {
    app.use(async (req, res, next) => {
      const start = Date.now();
      res.on('finish', () => log.log(`${req.method} ${req.originalUrl.split('?')[0]} ${res.statusCode} ${Date.now() - start}ms`));
      next();
    });
  }

  app.get('/healthz', async (req, res) => {
    await db.get('SELECT 1 AS ok');
    res.json({ ok: true, storage: storage.kind, database: db.dialect, media: media.available });
  });

  // Request context: client IP, cookies, session and response helpers.
  app.use(async (req, res, next) => {
    // The frontend forwards the visitor's IP; only believe it when it proves it's our frontend.
    const trusted = config.internalSecret && safeEqual(req.get('x-internal-secret'), config.internalSecret);
    req.clientIp = (trusted && req.get('x-client-ip')) || req.ip;
    req.cookies = parseCookies(req.headers.cookie);
    const user = await models.sessions.user(req.cookies.sid);
    req.user = user && !user.banned ? user : null;
    if (req.cookies.sid && !req.user) res.clearCookie('sid', cookieBase);
    res.ok = (data = {}, status = 200) => res.status(status).json({ ok: true, ...data });
    res.fail = (status, error, errors) => res.status(status).json({ ok: false, error, ...(errors ? { errors } : {}) });
    next();
  });

  // Local storage only: the stand-in for R2's presigned URLs. Mounted before the JSON parser
  // because uploads arrive as raw bodies.
  if (storage.kind === 'local') require('./routes/blob')(app, ctx);

  app.use(express.json({ limit: '200kb' }));

  // CSRF: browsers can only reach us through the frontend, which sends the double-submit token.
  // Writes must also come from an allowed origin, and must be JSON (HTML forms can't send that cross-site).
  app.use(async (req, res, next) => {
    if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
    const origin = req.get('origin');
    if (origin && origin !== 'null') {
      let host = null;
      try { host = new URL(origin).host; } catch { /* invalid */ }
      if (!allowedHosts.has(host) && host !== req.get('host') && host !== req.get('x-forwarded-host')) {
        return res.fail(403, 'That request came from another site, so it was blocked.');
      }
    }
    if (!req.is('application/json') && Number(req.get('content-length') || 0) > 0) return res.fail(415, 'Send JSON.');
    if (!safeEqual(req.get('x-csrf-token'), req.cookies.csrf)) return res.fail(403, 'Your session expired. Refresh the page and try again.');
    req.body = req.body || {};
    return next();
  });

  require('./routes/meta')(app, ctx);
  require('./routes/auth')(app, ctx);
  require('./routes/uploads')(app, ctx);
  require('./routes/assets')(app, ctx);
  require('./routes/users')(app, ctx);
  require('./routes/admin')(app, ctx);

  app.use(async (req, res) => res.fail(404, 'Not found.'));

  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, next) => {
    if (err.type === 'entity.too.large') return res.fail(413, 'That request was too large.');
    if (err.type === 'entity.parse.failed') return res.fail(400, 'Invalid JSON.');
    if (err.status && err.status < 500) return res.fail(err.status, err.message);
    log.error(err);
    if (res.headersSent) return res.end();
    return res.fail(500, 'Something went wrong on our side. Please try again.');
  });

  // Housekeeping: expired sessions, and uploads that were never attached to an asset.
  async function sweep() {
    await models.sessions.purgeExpired();
    for (const u of await models.uploads.stale(Date.now() - UPLOAD_TTL)) {
      try {
        if (u.multipart_id) await storage.abortMultipart(u.key, u.multipart_id);
        await storage.remove(u.key);
        await models.uploads.remove(u.id);
      } catch (err) {
        log.warn(`[sweep] couldn't clean upload ${u.id}: ${err.message}`);
      }
    }
  }
  const timer = setInterval(() => sweep().catch((err) => log.warn(`[sweep] ${err.message}`)), 3600 * 1000);
  timer.unref();

  return {
    app, db, models, storage, media, sweep,
    async close() { clearInterval(timer); await db.close(); },
  };
}

module.exports = { createApp };
