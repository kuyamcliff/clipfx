'use strict';
const catalog = require('../catalog');

// Everything the frontend needs that rarely changes: site settings, limits and the taxonomy.
module.exports = function metaRoutes(app, ctx) {
  const { config, models, storage, media } = ctx;

  const meta = {
    config: {
      siteName: config.siteName,
      donateUrl: config.donateUrl,
      contactEmail: config.contactEmail,
      sourceUrl: config.sourceUrl,
      openSignups: config.openSignups,
      maxUpload: config.maxUpload,
      maxPreview: config.maxPreview,
      maxThumb: config.maxThumb,
      userQuota: config.userQuota,
      storageOrigin: storage.origin,
      storageOrigins: storage.origins,
      mediaProcessing: media.available,
      uploadsEnabled: config.uploadsEnabled,
      googleAuth: !!(config.google.clientId && config.google.clientSecret),
      tiktokAuth: !!(config.tiktok.clientKey && config.tiktok.clientSecret),
    },
    catalog: {
      categories: catalog.CATEGORIES,
      software: catalog.SOFTWARE,
      licenses: catalog.LICENSES,
      kinds: catalog.KINDS,
      fileTypes: Object.fromEntries(Object.entries(catalog.FILE_TYPES).map(([ext, t]) => [ext, t.kind])),
      previewExts: catalog.PREVIEW_EXTS,
      thumbExts: catalog.THUMB_EXTS,
      kindCategory: catalog.KIND_CATEGORY,
    },
  };

  app.get('/api/meta', async (req, res) => {
    res.setHeader('Cache-Control', 'public, max-age=300');
    res.ok(meta);
  });

  ctx.publicUser = (u, { self = false } = {}) => u && ({
    id: u.id, username: u.username, display_name: u.display_name, bio: u.bio, website: u.website,
    role: u.role, banned: !!u.banned, created_at: u.created_at, ...(self ? { email: u.email || '', has_password: !!u.password_hash } : {}),
  });

  app.get('/api/session', async (req, res) => {
    res.ok({
      user: req.user ? { ...ctx.publicUser(req.user, { self: true }), connections: await models.oauth.forUser(req.user.id) } : null,
      openReports: ctx.isAdmin(req) ? await models.reports.openCount() : 0,
    });
  });

  app.get('/api/stats', async (req, res) => res.ok({ stats: await models.assets.siteStats() }));
  // Sitemap data. The website turns it into a sitemap index with one file per SITEMAP_PAGE entries.
  const SITEMAP_PAGE = 45000;
  const summary = (r) => ({ count: Number(r.count) || 0, lastmod: r.lastmod ? Number(r.lastmod) : null });
  app.get('/api/sitemap', async (req, res) => res.ok({
    pageSize: SITEMAP_PAGE,
    assets: summary(await models.assets.sitemapSummary()),
    users: summary(await models.users.sitemapSummary()),
  }));
  const sitemapPage = (req) => Math.max(1, Math.min(10000, Math.floor(Number(req.query.page)) || 1));
  app.get('/api/sitemap/assets', async (req, res) => {
    const rows = await models.assets.sitemapPage(sitemapPage(req), SITEMAP_PAGE);
    res.ok({
      items: rows.map((a) => ({
        slug: a.slug, title: a.title, lastmod: Number(a.updated_at),
        image: a.thumb_key ? storage.publicUrl(a.thumb_key, 'image') : null,
      })),
    });
  });
  app.get('/api/sitemap/users', async (req, res) => {
    const rows = await models.users.sitemapPage(sitemapPage(req), SITEMAP_PAGE);
    res.ok({ items: rows.map((u) => ({ username: u.username, lastmod: Number(u.last_upload || u.created_at) })) });
  });
};
