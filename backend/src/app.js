'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const express = require('express');
const { openDb } = require('./db');
const { createModels } = require('./models');
const { createStorage } = require('./storage');
const { createMedia } = require('./media');
const { parseCookies, safeEqual, securityHeaders, createLimiter, createSeenCache } = require('./security');
const views = require('../../frontend/views');

function createApp(config, { log = console } = {}) {
  fs.mkdirSync(config.dataDir, { recursive: true });
  fs.mkdirSync(config.tmpDir, { recursive: true });

  const db = openDb(config.dbFile);
  const models = createModels(db);
  const storage = createStorage(config.uploadDir);
  const media = createMedia({ config, models, storage, log });
  media.resume();

  const limiter = createLimiter();
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', config.trustProxy);

  const cookieBase = { httpOnly: true, sameSite: 'lax', secure: config.cookieSecure, path: '/' };

  const ctx = {
    config, models, storage, media, views, log, cookieBase,
    seenView: createSeenCache(6 * 3600 * 1000),
    seenDownload: createSeenCache(6 * 3600 * 1000),
    absolute: (req, p) => `${config.baseUrl || `${req.protocol}://${req.get('host')}`}${p}`,
    wantsJson: (req) => req.xhr || /application\/json/.test(req.get('accept') || ''),
    checkCsrf: (req) => safeEqual(req.get('x-csrf-token') || (req.body && req.body._csrf), req.cookies.csrf),
    rate(name, max, windowMs) {
      return (req, res, next) => {
        if (!config.rateLimits) return next();
        const r = limiter(`${name}:${req.ip}`, max, windowMs);
        if (r.ok) return next();
        res.setHeader('Retry-After', String(r.retryAfter));
        return res.fail(429, 'Slow down', 'You’re doing that a bit too often. Please wait a few minutes and try again.');
      };
    },
    requireUser(req, res, next) {
      if (req.user) return next();
      if (ctx.wantsJson(req)) return res.status(401).json({ ok: false, error: 'Please log in first.' });
      return res.redirect(`/login?next=${encodeURIComponent(req.originalUrl)}`);
    },
    requireAdmin(req, res, next) {
      if (req.user && req.user.role === 'admin') return next();
      return res.fail(404, 'Page not found', 'We couldn’t find that page.');
    },
    login(res, userId) {
      res.cookie('sid', models.sessions.create(userId), { ...cookieBase, maxAge: 30 * 24 * 3600 * 1000 });
    },
  };

  app.use(securityHeaders(config));

  if (config.logRequests) {
    app.use((req, res, next) => {
      const start = Date.now();
      res.on('finish', () => {
        if (!req.path.startsWith('/static')) log.log(`${req.method} ${req.originalUrl} ${res.statusCode} ${Date.now() - start}ms`);
      });
      next();
    });
  }

  app.use('/static', express.static(path.join(config.root, 'frontend', 'public'), { maxAge: config.production ? '7d' : 0, index: false }));
  app.get('/favicon.ico', (req, res) => res.redirect(301, '/static/favicon.svg'));

  // Cookies, session, CSRF token, flash messages and rendering helpers.
  app.use((req, res, next) => {
    req.cookies = parseCookies(req.headers.cookie);
    let csrf = req.cookies.csrf;
    if (!csrf || csrf.length < 20) {
      csrf = crypto.randomBytes(24).toString('base64url');
      req.cookies.csrf = '';
      res.cookie('csrf', csrf, { ...cookieBase, maxAge: 365 * 24 * 3600 * 1000 });
    }
    const user = models.sessions.user(req.cookies.sid);
    req.user = user && !user.banned ? user : null;
    if (req.cookies.sid && !req.user) res.clearCookie('sid', cookieBase);

    let flash = null;
    if (req.cookies.flash) {
      try { flash = JSON.parse(Buffer.from(req.cookies.flash, 'base64url').toString()); } catch { flash = null; }
      res.clearCookie('flash', cookieBase);
    }
    res.flash = (type, message) => {
      res.cookie('flash', Buffer.from(JSON.stringify({ type, message })).toString('base64url'), { ...cookieBase, maxAge: 60 * 1000 });
    };
    Object.assign(res.locals, {
      config, user: req.user, csrf, flash, path: req.path, query: req.query,
      openReports: req.user && req.user.role === 'admin' ? models.reports.openCount() : 0,
      absolute: (p) => ctx.absolute(req, p),
    });
    res.view = (view, data = {}, status = 200) => res.status(status).type('html').send(String(view(res.locals, data)));
    res.fail = (status, title, message) => {
      if (ctx.wantsJson(req)) return res.status(status).json({ ok: false, error: message });
      return res.view(views.error, { status, title, message }, status);
    };
    next();
  });

  app.use(express.urlencoded({ extended: false, limit: '200kb', parameterLimit: 200 }));
  app.use(express.json({ limit: '100kb' }));

  // CSRF: same-origin check + double-submit token. Multipart forms without the header
  // are verified after parsing, inside the upload handlers.
  app.use((req, res, next) => {
    if (req.method !== 'POST') return next();
    const origin = req.get('origin');
    if (origin && origin !== 'null') {
      let host = null;
      try { host = new URL(origin).host; } catch { /* invalid */ }
      const allowed = [req.get('host'), config.baseUrl && new URL(config.baseUrl).host].filter(Boolean);
      if (!allowed.includes(host)) return res.fail(403, 'Request blocked', 'That request came from another site, so we blocked it.');
    }
    if (req.is('multipart/form-data') && !req.get('x-csrf-token')) { req.csrfDeferred = true; return next(); }
    if (!ctx.checkCsrf(req)) return res.fail(403, 'Session expired', 'Your form expired. Go back, refresh the page and try again.');
    return next();
  });

  require('./routes/pages')(app, ctx);
  require('./routes/auth')(app, ctx);
  require('./routes/browse')(app, ctx);
  require('./routes/assets')(app, ctx);
  require('./routes/account')(app, ctx);
  require('./routes/admin')(app, ctx);

  app.use((req, res) => res.fail(404, 'Page not found', 'We couldn’t find that page. It may have been moved or deleted.'));

  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, next) => {
    if (err.type === 'entity.too.large') return res.fail(413, 'Too large', 'That request was too large.');
    if (err.status === 400 || err.type === 'entity.parse.failed') return res.fail(400, 'Bad request', 'We couldn’t understand that request.');
    log.error(err);
    if (res.headersSent) return res.end();
    return res.fail(500, 'Something went wrong', 'An unexpected error happened on our side. Please try again in a moment.');
  });

  const purge = setInterval(() => models.sessions.purgeExpired(), 3600 * 1000);
  purge.unref();

  return {
    app, db, models, storage, media,
    close() { clearInterval(purge); db.close(); },
  };
}

module.exports = { createApp };
