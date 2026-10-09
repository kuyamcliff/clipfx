'use strict';
const { CATEGORY_MAP, SOFTWARE_MAP, LICENSE_MAP, KINDS } = require('../catalog');

const SORTS = { new: 'Newest', trending: 'Trending', downloads: 'Most downloaded' };

function readFilters(query) {
  const pick = (v, map) => (typeof v === 'string' && map[v] ? v : '');
  return {
    q: typeof query.q === 'string' ? query.q.trim().slice(0, 100) : '',
    category: pick(query.category, CATEGORY_MAP),
    software: pick(query.software, SOFTWARE_MAP),
    license: pick(query.license, LICENSE_MAP),
    kind: pick(query.kind, KINDS),
    tag: typeof query.tag === 'string' ? query.tag.trim().toLowerCase().slice(0, 32) : '',
    commercial: query.commercial === '1',
    noAttribution: query.noattr === '1',
    sort: pick(query.sort, SORTS) || 'new',
    page: Math.min(Math.max(parseInt(query.page, 10) || 1, 1), 1000),
  };
}

module.exports = function browseRoutes(app, ctx) {
  const { views, models, requireUser, config } = ctx;

  app.get('/', (req, res) => {
    res.view(views.home, {
      stats: models.assets.siteStats(),
      categories: models.assets.categoryCounts(),
      fresh: models.assets.list({ perPage: 12 }).items,
      trending: models.assets.list({ sort: 'trending', perPage: 8 }).items,
    });
  });

  app.get('/browse', (req, res) => {
    const filters = readFilters(req.query);
    const result = models.assets.list({ ...filters, perPage: 24 });
    res.view(views.browse, { filters, result, sorts: SORTS, categories: models.assets.categoryCounts() });
  });

  app.get('/search', (req, res) => res.redirect(301, `/browse?q=${encodeURIComponent(String(req.query.q || ''))}`));
  app.get('/c/:category', (req, res) => {
    if (!CATEGORY_MAP[req.params.category]) return res.fail(404, 'Category not found', 'That category doesn’t exist.');
    return res.redirect(`/browse?category=${req.params.category}`);
  });

  app.get('/u/:username', (req, res) => {
    const profile = models.users.byUsername(req.params.username);
    if (!profile || (profile.banned && !(req.user && req.user.role === 'admin'))) {
      return res.fail(404, 'Creator not found', 'There’s no creator with that username.');
    }
    const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
    const sort = SORTS[req.query.sort] ? req.query.sort : 'new';
    res.view(views.profile, {
      profile,
      stats: models.users.stats(profile.id),
      result: models.assets.list({ userId: profile.id, page, sort, perPage: 24, includeBanned: true }),
      sort, sorts: SORTS,
    });
  });

  app.get('/saved', requireUser, (req, res) => {
    const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
    res.view(views.saved, { result: models.assets.list({ favoritesOf: req.user.id, includeUnlisted: true, sort: 'saved', page, perPage: 24 }) });
  });

  app.get('/dashboard', requireUser, (req, res) => {
    const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
    const result = models.assets.list({ userId: req.user.id, includeUnlisted: true, anyStatus: true, includeBanned: true, page, perPage: 30 });
    result.items.forEach((a) => { a.shareUrl = ctx.absolute(req, a.url); });
    res.view(views.dashboard, {
      result,
      stats: models.users.stats(req.user.id),
      used: models.users.storageUsed(req.user.id),
      quota: config.userQuotaMB * 1024 * 1024,
    });
  });
};

module.exports.readFilters = readFilters;
