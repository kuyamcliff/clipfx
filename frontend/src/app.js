'use strict';
// ClipFX website. Renders pages server-side (so share links unfurl with thumbnails), handles
// HTML forms, and proxies the browser's /api calls to the backend. Runs on Vercel as one function.
const path = require('node:path');
const crypto = require('node:crypto');
const express = require('express');
const views = require('../views');
const { createBackend } = require('./backend');
const { buildCatalog, decorate, decorateAll, withCounts } = require('./decorate');

const STATIC_PAGES = ['about', 'guidelines', 'licenses', 'terms', 'privacy', 'copyright', 'donate'];
const META_TTL = 5 * 60 * 1000;

// Used only when the API can't be reached, so error pages still render.
const FALLBACK_META = {
  config: { siteName: 'ClipFX', sourceUrl: 'https://github.com/kuyamcliff/clipfx', donateUrl: '', contactEmail: '', storageOrigin: '' },
  catalog: { categories: [], software: [], licenses: [], kinds: {}, fileTypes: {}, previewExts: [], thumbExts: [], kindCategory: {} },
};

function parseCookies(header) {
  const out = {};
  for (const part of String(header || '').split(';')) {
    const i = part.indexOf('=');
    if (i < 0) continue;
    const k = part.slice(0, i).trim();
    if (!k || k in out) continue;
    try { out[k] = decodeURIComponent(part.slice(i + 1).trim()); } catch { /* ignore malformed */ }
  }
  return out;
}

function safeEqual(a, b) {
  const ba = Buffer.from(String(a || ''));
  const bb = Buffer.from(String(b || ''));
  return ba.length === bb.length && ba.length > 0 && crypto.timingSafeEqual(ba, bb);
}

const safeNext = (n) => (typeof n === 'string' && /^\/(?![/\\])/.test(n) ? n : '');
const checked = (v) => v === 'on' || v === 'true' || v === '1' || v === true;
const list = (v) => (Array.isArray(v) ? v : v ? [v] : []);

function createFrontend(config, { log = console } = {}) {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', true);
  const backend = createBackend(config, { log });
  const cookieBase = { httpOnly: true, sameSite: 'lax', secure: config.cookieSecure, path: '/' };

  // ---- Site metadata (settings + taxonomy), cached briefly ----------------------------
  let meta = null;
  let metaAt = 0;
  async function getMeta(req) {
    if (meta && Date.now() - metaAt < META_TTL) return meta;
    const r = await backend.call(req, 'GET', '/api/meta');
    if (r.status !== 200) return meta || { ...FALLBACK_META, catalog: buildCatalog(FALLBACK_META.catalog), unavailable: true };
    meta = { config: r.data.config, catalog: buildCatalog(r.data.catalog) };
    metaAt = Date.now();
    return meta;
  }

  if (config.logRequests) {
    app.use((req, res, next) => {
      const start = Date.now();
      res.on('finish', () => { if (!req.path.startsWith('/static')) log.log(`${req.method} ${req.originalUrl.split('?')[0]} ${res.statusCode} ${Date.now() - start}ms`); });
      next();
    });
  }

  // On Vercel the CDN serves public/ directly; this covers local development.
  app.use(express.static(path.join(__dirname, '..', 'public'), { index: false, maxAge: config.production ? '1d' : 0 }));
  app.get('/favicon.ico', (req, res) => res.redirect(301, '/static/favicon.svg'));
  app.get('/healthz', (req, res) => res.json({ ok: true }));

  // Cookies & CSRF token (double-submit: the API checks the same token).
  app.use((req, res, next) => {
    req.cookies = parseCookies(req.headers.cookie);
    if (!req.cookies.csrf || req.cookies.csrf.length < 20) {
      const token = crypto.randomBytes(24).toString('base64url');
      res.cookie('csrf', token, { ...cookieBase, maxAge: 365 * 24 * 3600 * 1000 });
      req.cookies.csrf = token;
      req.freshCsrf = true;
    }
    next();
  });

  // The browser's own API calls (uploads, saves, downloads) go straight through.
  app.use('/api', (req, res) => backend.proxy(req, res));

  app.use(express.urlencoded({ extended: false, limit: '200kb', parameterLimit: 200 }));

  // Page rendering context & helpers.
  app.use((req, res, next) => {
    let flash = null;
    if (req.cookies.flash) {
      try { flash = JSON.parse(Buffer.from(req.cookies.flash, 'base64url').toString()); } catch { flash = null; }
      res.clearCookie('flash', cookieBase);
    }
    res.flash = (type, message) => {
      if (message) res.cookie('flash', Buffer.from(JSON.stringify({ type, message })).toString('base64url'), { ...cookieBase, maxAge: 60 * 1000 });
    };
    const origin = config.publicUrl || `${req.protocol}://${req.get('host')}`;

    req.api = async (method, apiPath, body) => {
      const r = await backend.call(req, method, apiPath, body);
      backend.passCookies(res, r);
      return r;
    };

    // Builds the view context: site metadata + who's logged in. Called by each page.
    req.context = async () => {
      if (req.ctx) return req.ctx;
      const [m, session] = await Promise.all([getMeta(req), req.api('GET', '/api/session')]);
      const s = session.status === 200 ? session.data : {};
      req.ctx = {
        config: m.config, catalog: m.catalog, user: s.user || null, openReports: s.openReports || 0,
        csrf: req.cookies.csrf, flash, path: req.path, query: req.query,
        absolute: (p) => (/^https?:\/\//.test(p) ? p : `${origin}${p}`),
        decorate: (a) => decorate(a, m.catalog),
        decorateAll: (items) => decorateAll(items, m.catalog),
      };
      return req.ctx;
    };

    res.view = async (view, data = {}, status = 200) => {
      const ctx = await req.context();
      const origins = (ctx.config.storageOrigins || [ctx.config.storageOrigin]).filter(Boolean);
      const storage = origins.length ? ` ${origins.join(' ')}` : '';
      res.setHeader('Content-Security-Policy', [
        "default-src 'self'", `img-src 'self' data: blob:${storage}`, `media-src 'self' blob:${storage}`, "script-src 'self'",
        "style-src 'self' 'unsafe-inline'", `connect-src 'self'${storage}`, "object-src 'none'", "base-uri 'self'",
        "form-action 'self'", "frame-ancestors 'none'",
      ].join('; '));
      res.setHeader('X-Content-Type-Options', 'nosniff');
      res.setHeader('X-Frame-Options', 'DENY');
      res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
      res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
      if (config.cookieSecure) res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
      res.setHeader('Cache-Control', 'private, no-cache');
      return res.status(status).type('html').send(String(view(ctx, data)));
    };
    res.fail = (status, title, message) => res.view(views.error, { status, title, message }, status);

    // Standard handling for API errors that aren't form validation problems.
    res.apiError = (r) => {
      if (r.status === 401) return res.redirect(`/login?next=${encodeURIComponent(req.originalUrl)}`);
      if (r.status === 404) return res.fail(404, 'Not found', r.data.error || 'We couldn’t find that page.');
      if (r.status === 403) return res.fail(403, 'Not allowed', r.data.error || 'You can’t do that.');
      if (r.status === 429) return res.fail(429, 'Slow down', r.data.error);
      if (r.status >= 500) return res.fail(503, 'Something went wrong', r.data.error || 'Please try again in a minute.');
      return res.fail(r.status, 'Something went wrong', r.data.error || 'That didn’t work.');
    };
    next();
  });

  // HTML form posts: same-origin + CSRF check here; the API checks the token again.
  app.use((req, res, next) => {
    if (req.method !== 'POST') return next();
    const origin = req.get('origin');
    if (origin && origin !== 'null') {
      let host = null;
      try { host = new URL(origin).host; } catch { /* invalid */ }
      if (host !== req.get('host')) return res.fail(403, 'Request blocked', 'That request came from another site, so it was blocked.');
    }
    if (req.freshCsrf || !safeEqual(req.body && req.body._csrf, req.cookies.csrf)) {
      return res.fail(403, 'Form expired', 'Your form expired. Go back, refresh the page and try again.');
    }
    return next();
  });

  const requireUser = async (req, res, next) => {
    const ctx = await req.context();
    if (ctx.user) return next();
    return res.redirect(`/login?next=${encodeURIComponent(req.originalUrl)}`);
  };

  // Runs a form against the API. On success: flash + redirect. On validation errors:
  // re-render the form with the messages (when a renderer is given), otherwise flash + go back.
  function formAction({ api, body = (req) => req.body, redirect, rerender }) {
    return async (req, res) => {
      const payload = { ...body(req) };
      delete payload._csrf;
      const r = await req.api('POST', typeof api === 'function' ? api(req) : api, payload);
      if (r.status >= 200 && r.status < 300) {
        res.flash('success', r.data.message);
        return res.redirect(303, (typeof redirect === 'function' ? redirect(req, r.data) : redirect) || r.data.redirect || '/');
      }
      if (r.status === 400 && rerender) return rerender(req, res, { errors: r.data.errors || {}, error: r.data.error, values: req.body });
      if (r.status === 400 || r.status === 410) {
        res.flash('error', r.data.error);
        return res.redirect(303, safeNext(req.body.back) || req.get('referer') || '/');
      }
      return res.apiError(r);
    };
  }

  // ---- Browsing -------------------------------------------------------------------------

  app.get('/', async (req, res) => {
    const [ctx, r] = await Promise.all([req.context(), req.api('GET', '/api/home')]);
    if (r.status !== 200) return res.apiError(r);
    return res.view(views.home, {
      stats: r.data.stats,
      categories: withCounts(ctx.catalog, r.data.categories),
      fresh: ctx.decorateAll(r.data.fresh),
      trending: ctx.decorateAll(r.data.trending),
    });
  });

  app.get('/browse', async (req, res) => {
    const qs = new URLSearchParams(req.query).toString();
    const [ctx, r] = await Promise.all([req.context(), req.api('GET', `/api/assets?${qs}`)]);
    if (r.status !== 200) return res.apiError(r);
    const { filters, result, sorts, categories } = r.data;
    return res.view(views.browse, { filters, sorts, categories: withCounts(ctx.catalog, categories), result: { ...result, items: ctx.decorateAll(result.items) } });
  });

  app.get('/search', (req, res) => res.redirect(301, `/browse?q=${encodeURIComponent(String(req.query.q || ''))}`));
  app.get('/c/:category', (req, res) => res.redirect(`/browse?category=${encodeURIComponent(req.params.category)}`));

  app.get('/u/:username', async (req, res) => {
    const qs = new URLSearchParams({ page: req.query.page || '', sort: req.query.sort || '' }).toString();
    const [ctx, r] = await Promise.all([req.context(), req.api('GET', `/api/users/${encodeURIComponent(req.params.username)}?${qs}`)]);
    if (r.status === 404) return res.fail(404, 'Creator not found', 'There’s no creator with that username.');
    if (r.status !== 200) return res.apiError(r);
    return res.view(views.profile, { ...r.data, result: { ...r.data.result, items: ctx.decorateAll(r.data.result.items) } });
  });

  app.get('/saved', requireUser, async (req, res) => {
    const ctx = await req.context();
    const r = await req.api('GET', `/api/me/saved?page=${Number(req.query.page) || 1}`);
    if (r.status !== 200) return res.apiError(r);
    return res.view(views.saved, { result: { ...r.data.result, items: ctx.decorateAll(r.data.result.items) } });
  });

  app.get('/dashboard', requireUser, async (req, res) => {
    const ctx = await req.context();
    const r = await req.api('GET', `/api/me/assets?page=${Number(req.query.page) || 1}`);
    if (r.status !== 200) return res.apiError(r);
    return res.view(views.dashboard, { ...r.data, result: { ...r.data.result, items: ctx.decorateAll(r.data.result.items) } });
  });

  // ---- Assets ---------------------------------------------------------------------------

  const slugPath = (req) => `/api/assets/${encodeURIComponent(req.params.slug)}`;

  async function loadAsset(req, res, { view = false } = {}) {
    const [ctx, r] = await Promise.all([req.context(), req.api('GET', `${slugPath(req)}${view ? '?view=1' : ''}`)]);
    if (r.status === 410) { await res.view(views.removed, { asset: r.data.asset }, 410); return null; }
    if (r.status === 404) { await res.fail(404, 'Asset not found', 'This asset doesn’t exist. Double-check the link.'); return null; }
    if (r.status !== 200) { await res.apiError(r); return null; }
    return {
      ...r.data,
      asset: ctx.decorate(r.data.asset),
      more: ctx.decorateAll(r.data.more),
      related: ctx.decorateAll(r.data.related),
    };
  }

  app.get('/a/:slug', async (req, res) => {
    const data = await loadAsset(req, res, { view: true });
    if (!data) return undefined;
    if (data.asset.visibility === 'unlisted') res.setHeader('X-Robots-Tag', 'noindex');
    return res.view(views.asset, { ...data, justUploaded: req.query.uploaded === '1' && data.asset.isOwner });
  });

  // The API counts the download and answers with a redirect to storage; pass it on.
  app.get('/a/:slug/download', async (req, res) => {
    const r = await req.api('GET', `${slugPath(req)}/download`);
    if (r.status === 302 && r.location) {
      res.setHeader('Cache-Control', 'no-store');
      res.setHeader('X-Robots-Tag', 'noindex');
      return res.redirect(302, r.location);
    }
    if (r.status === 410) return res.view(views.removed, { asset: r.data.asset || { title: 'This asset' } }, 410);
    return res.apiError(r);
  });

  app.get('/upload', requireUser, async (req, res) => {
    const r = await req.api('GET', '/api/me/storage');
    if (r.status !== 200) return res.apiError(r);
    const ctx = await req.context();
    return res.view(views.upload, {
      values: { license: 'free', visibility: 'public', software: [] }, errors: {},
      limits: { maxUpload: ctx.config.maxUpload, maxPreview: ctx.config.maxPreview, quota: r.data.quota, used: r.data.used },
    });
  });

  const editValues = (a) => ({
    title: a.title, description: a.description, category: a.category.id, software: a.software.map((s) => s.id),
    tags: a.tags.join(', '), license: a.license.id, visibility: a.visibility,
  });
  const renderEdit = async (req, res, { errors = {}, values = null, status = 200 } = {}) => {
    const data = await loadAsset(req, res);
    if (!data) return undefined;
    if (!data.asset.canEdit) return res.fail(403, 'Not yours', 'Only the uploader can edit this asset.');
    const ctx = await req.context();
    return res.view(views.editAsset, {
      asset: data.asset, errors,
      values: values ? { ...values, software: list(values.software) } : editValues(data.asset),
      limits: { maxUpload: ctx.config.maxUpload, maxPreview: ctx.config.maxPreview },
    }, status);
  };
  app.get('/a/:slug/edit', requireUser, (req, res) => renderEdit(req, res));

  // Without JavaScript only the details can change; replacing files needs the upload script.
  app.post('/a/:slug/edit', requireUser, formAction({
    api: (req) => `${slugPath(req)}/edit`,
    body: (req) => ({
      ...req.body, software: list(req.body.software),
      removeThumb: checked(req.body.removeThumb), removePreview: checked(req.body.removePreview),
    }),
    redirect: (req) => `/a/${req.params.slug}`,
    rerender: (req, res, { errors, values }) => renderEdit(req, res, { errors, values, status: 400 }),
  }));

  app.post('/a/:slug/delete', requireUser, formAction({ api: (req) => `${slugPath(req)}/delete`, body: () => ({}) }));
  app.post('/a/:slug/save', requireUser, formAction({ api: (req) => `${slugPath(req)}/save`, body: () => ({}), redirect: (req) => `/a/${req.params.slug}` }));

  const renderReport = async (req, res, { values = {}, errors = {}, status = 200 } = {}) => {
    const data = await loadAsset(req, res);
    if (!data) return undefined;
    return res.view(views.report, { asset: data.asset, reasons: data.reasons, values, errors }, status);
  };
  app.get('/a/:slug/report', (req, res) => renderReport(req, res, { values: { reason: req.query.reason } }));
  app.post('/a/:slug/report', formAction({
    api: (req) => `${slugPath(req)}/report`,
    redirect: (req) => `/a/${req.params.slug}`,
    rerender: (req, res, { errors, values }) => renderReport(req, res, { values, errors, status: 400 }),
  }));

  // ---- Accounts -------------------------------------------------------------------------

  app.get('/signup', async (req, res) => {
    const ctx = await req.context();
    if (ctx.user) return res.redirect('/');
    return res.view(views.signup, { values: {}, errors: {}, next: safeNext(req.query.next) });
  });
  app.post('/signup', formAction({
    api: '/api/auth/signup',
    body: (req) => ({ ...req.body, agree: checked(req.body.agree) }),
    redirect: (req) => safeNext(req.body.next) || '/upload',
    rerender: (req, res, { errors, error, values }) => res.view(views.signup, {
      values: { username: values.username, email: values.email, display_name: values.display_name },
      errors: Object.keys(errors).length ? errors : { username: error }, next: safeNext(values.next),
    }, 400),
  }));

  app.get('/login', async (req, res) => {
    const ctx = await req.context();
    if (ctx.user) return res.redirect('/');
    return res.view(views.login, { values: {}, error: null, next: safeNext(req.query.next) });
  });
  app.post('/login', async (req, res) => {
    const next = safeNext(req.body.next);
    const r = await req.api('POST', '/api/auth/login', { login: req.body.login, password: req.body.password });
    if (r.status === 200) return res.redirect(303, next || '/');
    if (r.status >= 500 || r.status === 429) return res.apiError(r);
    return res.view(views.login, { values: { login: req.body.login }, error: r.data.error, next }, r.status);
  });

  app.post('/logout', formAction({ api: '/api/auth/logout', body: () => ({}), redirect: '/' }));

  const renderReset = async (req, res, { error = null, status = 200 } = {}) => {
    const r = await req.api('GET', `/api/auth/reset/${encodeURIComponent(req.params.token)}`);
    if (r.status !== 200) return res.fail(410, 'Link expired', r.data.error || 'This reset link is invalid or has expired.');
    return res.view(views.resetPassword, { token: req.params.token, error, user: { username: r.data.username } }, status);
  };
  app.get('/reset/:token', (req, res) => renderReset(req, res));
  app.post('/reset/:token', formAction({
    api: (req) => `/api/auth/reset/${encodeURIComponent(req.params.token)}`,
    body: (req) => ({ password: req.body.password }),
    redirect: '/dashboard',
    rerender: (req, res, { error }) => renderReset(req, res, { error, status: 400 }),
  }));

  const renderSettings = async (req, res, { values = null, errors = {}, status = 200 } = {}) => {
    const ctx = await req.context();
    const u = ctx.user;
    return res.view(views.settings, {
      values: values || { display_name: u.display_name, bio: u.bio, website: u.website, email: u.email || '' }, errors,
    }, status);
  };
  app.get('/settings', requireUser, (req, res) => renderSettings(req, res));
  app.post('/settings/profile', requireUser, formAction({
    api: '/api/me/profile', redirect: '/settings',
    rerender: (req, res, { errors, values }) => renderSettings(req, res, { values, errors, status: 400 }),
  }));
  app.post('/settings/password', requireUser, formAction({
    api: '/api/me/password', redirect: '/settings',
    rerender: (req, res, { errors }) => renderSettings(req, res, { errors, status: 400 }),
  }));
  app.post('/settings/delete', requireUser, formAction({
    api: '/api/me/delete', redirect: '/',
    rerender: (req, res, { errors }) => renderSettings(req, res, { errors, status: 400 }),
  }));

  // ---- Moderation -----------------------------------------------------------------------

  app.get('/admin', requireUser, async (req, res) => {
    const ctx = await req.context();
    const qs = new URLSearchParams({ tab: req.query.tab || '', q: req.query.q || '', page: req.query.page || '' }).toString();
    const r = await req.api('GET', `/api/admin?${qs}`);
    if (r.status !== 200) return res.apiError(r);
    const data = r.data;
    if (data.result) data.result = { ...data.result, items: ctx.decorateAll(data.result.items) };
    return res.view(views.admin, data);
  });
  app.post('/admin/:type/:id/:action', requireUser, formAction({
    api: (req) => `/api/admin/${encodeURIComponent(req.params.type)}/${encodeURIComponent(req.params.id)}/${encodeURIComponent(req.params.action)}`,
    body: (req) => ({ reason: req.body.reason, block: checked(req.body.block) }),
    redirect: (req) => safeNext(req.body.back) || `/admin?tab=${req.params.type === 'reports' ? 'reports' : req.params.type}`,
  }));

  // ---- Info pages, SEO ------------------------------------------------------------------

  for (const page of STATIC_PAGES) {
    app.get(`/${page}`, async (req, res) => {
      const stats = page === 'about' || page === 'donate' ? (await req.api('GET', '/api/stats')).data.stats : null;
      return res.view(views.staticPage, { page, stats });
    });
  }
  app.get('/donate/go', async (req, res) => {
    const m = await getMeta(req);
    return m.config.donateUrl ? res.redirect(m.config.donateUrl) : res.redirect('/donate');
  });

  app.get('/robots.txt', (req, res) => {
    const origin = config.publicUrl || `${req.protocol}://${req.get('host')}`;
    res.type('text/plain').send([
      'User-agent: *', 'Disallow: /admin', 'Disallow: /dashboard', 'Disallow: /settings', 'Disallow: /saved',
      'Disallow: /upload', 'Disallow: /api/', 'Disallow: /*/download', 'Disallow: /*/report', `Sitemap: ${origin}/sitemap.xml`, '',
    ].join('\n'));
  });

  app.get('/sitemap.xml', async (req, res) => {
    const origin = config.publicUrl || `${req.protocol}://${req.get('host')}`;
    const r = await req.api('GET', '/api/sitemap');
    const xmlEsc = (s) => String(s).replace(/[<>&'"]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;' }[c]));
    const urls = ['/', '/browse', '/about', '/licenses', '/guidelines'].map((p) => `<url><loc>${xmlEsc(origin + p)}</loc></url>`)
      .concat(((r.data && r.data.assets) || []).map((a) => `<url><loc>${xmlEsc(`${origin}/a/${a.slug}`)}</loc><lastmod>${new Date(a.updated_at).toISOString()}</lastmod></url>`));
    res.type('application/xml').send(`<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls.join('')}</urlset>`);
  });

  app.use((req, res) => res.fail(404, 'Page not found', 'We couldn’t find that page. It may have been moved or deleted.'));

  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, next) => {
    if (err.type === 'entity.too.large') return res.status(413).send('Too large');
    log.error(err);
    if (res.headersSent) return res.end();
    return res.fail(500, 'Something went wrong', 'An unexpected error happened. Please try again in a moment.')
      .catch(() => res.status(500).send('Something went wrong.'));
  });

  return app;
}

module.exports = { createFrontend };
