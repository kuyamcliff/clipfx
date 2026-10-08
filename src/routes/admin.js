'use strict';

module.exports = function adminRoutes(app, ctx) {
  const { views, models, storage, requireAdmin } = ctx;
  const back = (res, tab, msg) => { if (msg) res.flash('success', msg); res.redirect(303, `/admin${tab ? `?tab=${tab}` : ''}`); };

  app.get('/admin', requireAdmin, (req, res) => {
    const tab = ['reports', 'assets', 'removed', 'users'].includes(req.query.tab) ? req.query.tab : 'reports';
    const q = typeof req.query.q === 'string' ? req.query.q.slice(0, 100) : '';
    const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
    const data = { tab, q, stats: models.assets.siteStats(), openReports: models.reports.openCount(), reasons: ctx.REPORT_REASONS };
    if (tab === 'reports') data.reports = models.reports.open();
    if (tab === 'assets') data.result = models.assets.list({ q, includeUnlisted: true, includeBanned: true, page, perPage: 50 });
    if (tab === 'removed') data.result = models.assets.list({ anyStatus: true, status: 'removed', includeUnlisted: true, includeBanned: true, page, perPage: 50 });
    if (tab === 'users') data.users = models.users.search(q, 100);
    res.view(views.admin, data);
  });

  const asset = (req, res) => {
    const a = models.assets.rawById(Number(req.params.id));
    if (!a) res.fail(404, 'Not found', 'That asset no longer exists.');
    return a;
  };

  function removeAsset(a, reason, block, adminId) {
    models.assets.setStatus(a.id, 'removed', reason);
    if (block) models.assets.blockHash(a.file_sha256, reason);
    models.reports.resolveAllFor(a.id, 'actioned', adminId);
  }

  app.post('/admin/reports/:id/dismiss', requireAdmin, (req, res) => {
    models.reports.resolve(Number(req.params.id), 'dismissed', req.user.id);
    back(res, 'reports', 'Report dismissed.');
  });

  app.post('/admin/reports/:id/remove', requireAdmin, (req, res) => {
    const r = models.reports.byId(Number(req.params.id));
    if (!r) return back(res, 'reports');
    const a = models.assets.rawById(r.asset_id);
    if (a) removeAsset(a, String(req.body.reason || r.reason).slice(0, 200), req.body.block === 'on', req.user.id);
    return back(res, 'reports', 'Asset removed and reports resolved.');
  });

  app.post('/admin/assets/:id/remove', requireAdmin, (req, res) => {
    const a = asset(req, res);
    if (!a) return undefined;
    removeAsset(a, String(req.body.reason || 'guidelines').slice(0, 200), req.body.block === 'on', req.user.id);
    return back(res, req.body.tab || 'assets', `Removed “${a.title}”.`);
  });

  app.post('/admin/assets/:id/restore', requireAdmin, (req, res) => {
    const a = asset(req, res);
    if (!a) return undefined;
    models.assets.setStatus(a.id, 'active', null);
    models.db.prepare('DELETE FROM blocked_hashes WHERE sha256 = ?').run(a.file_sha256);
    return back(res, 'removed', `Restored “${a.title}”.`);
  });

  app.post('/admin/assets/:id/purge', requireAdmin, async (req, res) => {
    const a = asset(req, res);
    if (!a) return undefined;
    models.assets.remove(a.id);
    await Promise.all([a.file_key, a.preview_key, a.thumb_key].map((k) => storage.remove(k)));
    return back(res, 'removed', `Permanently deleted “${a.title}”.`);
  });

  const target = (req, res) => {
    const u = models.users.byId(Number(req.params.id));
    if (!u) { res.fail(404, 'Not found', 'That user no longer exists.'); return null; }
    if (u.id === req.user.id) { res.fail(400, 'Not allowed', 'You can’t do that to your own account.'); return null; }
    return u;
  };

  app.post('/admin/users/:id/ban', requireAdmin, (req, res) => {
    const u = target(req, res);
    if (!u) return undefined;
    models.users.setBanned(u.id, !u.banned);
    if (!u.banned) models.sessions.destroyAllFor(u.id);
    return back(res, 'users', u.banned ? `@${u.username} was unbanned.` : `@${u.username} was banned and their uploads hidden.`);
  });

  app.post('/admin/users/:id/role', requireAdmin, (req, res) => {
    const u = target(req, res);
    if (!u) return undefined;
    models.users.setRole(u.id, u.role === 'admin' ? 'user' : 'admin');
    return back(res, 'users', `@${u.username} is now ${u.role === 'admin' ? 'a regular member' : 'a moderator'}.`);
  });

  app.post('/admin/users/:id/reset', requireAdmin, (req, res) => {
    const u = target(req, res);
    if (!u) return undefined;
    const token = models.resets.create(u.id);
    return back(res, 'users', `Password reset link for @${u.username} (valid 24h, share it privately): ${ctx.absolute(req, `/reset/${token}`)}`);
  });
};
