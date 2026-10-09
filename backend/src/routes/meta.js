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
      user: ctx.publicUser(req.user, { self: true }),
      openReports: ctx.isAdmin(req) ? await models.reports.openCount() : 0,
    });
  });

  app.get('/api/stats', async (req, res) => res.ok({ stats: await models.assets.siteStats() }));
  app.get('/api/sitemap', async (req, res) => res.ok({ assets: await models.assets.sitemap() }));
};
