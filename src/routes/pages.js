'use strict';

module.exports = function pageRoutes(app, ctx) {
  const { views, models, config } = ctx;

  for (const page of ['about', 'guidelines', 'licenses', 'terms', 'privacy', 'copyright', 'donate']) {
    app.get(`/${page}`, (req, res) => res.view(views.staticPage, { page, stats: page === 'donate' || page === 'about' ? models.assets.siteStats() : null }));
  }

  app.get('/healthz', (req, res) => {
    models.db.prepare('SELECT 1').get();
    res.json({ ok: true, media: ctx.media.available });
  });

  app.get('/robots.txt', (req, res) => {
    res.type('text/plain').send([
      'User-agent: *',
      'Disallow: /admin', 'Disallow: /dashboard', 'Disallow: /settings', 'Disallow: /saved',
      'Disallow: /upload', 'Disallow: /m/', 'Disallow: /*/download', 'Disallow: /*/report',
      `Sitemap: ${ctx.absolute(req, '/sitemap.xml')}`, '',
    ].join('\n'));
  });

  app.get('/sitemap.xml', (req, res) => {
    const rows = models.db.prepare(`SELECT a.slug, a.updated_at FROM assets a JOIN users u ON u.id = a.user_id
      WHERE a.status = 'active' AND a.visibility = 'public' AND u.banned = 0 ORDER BY a.created_at DESC LIMIT 45000`).all();
    const xmlEsc = (s) => String(s).replace(/[<>&'"]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;' }[c]));
    const urls = ['/', '/browse', '/about', '/licenses', '/guidelines'].map((p) => `<url><loc>${xmlEsc(ctx.absolute(req, p))}</loc></url>`)
      .concat(rows.map((r) => `<url><loc>${xmlEsc(ctx.absolute(req, `/a/${r.slug}`))}</loc><lastmod>${new Date(r.updated_at).toISOString()}</lastmod></url>`));
    res.type('application/xml').send(`<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls.join('')}</urlset>`);
  });

  if (config.donateUrl) app.get('/donate/go', (req, res) => res.redirect(config.donateUrl));
};
