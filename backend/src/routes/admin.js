'use strict';

const { quarantine, release } = require('../quarantine');

module.exports = function adminRoutes(app, ctx) {
  const { models, storage, requireAdmin } = ctx;

  app.get('/api/admin', requireAdmin, async (req, res) => {
    const tab = ['reports', 'assets', 'removed', 'users'].includes(req.query.tab) ? req.query.tab : 'reports';
    const q = typeof req.query.q === 'string' ? req.query.q.slice(0, 100) : '';
    const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
    const data = { tab, q, stats: await models.assets.siteStats(), openReports: await models.reports.openCount(), reasons: ctx.REPORT_REASONS };
    if (tab === 'reports') data.reports = await models.reports.open();
    if (tab === 'assets') data.result = await models.assets.list({ q, includeUnlisted: true, includeBanned: true, page, perPage: 50 });
    if (tab === 'removed') data.result = await models.assets.list({ anyStatus: true, status: 'removed', includeUnlisted: true, includeBanned: true, page, perPage: 50 });
    if (tab === 'users') {
      data.users = await Promise.all((await models.users.search(q, 100)).map(async (u) => ({ ...(await ctx.publicUser(u)), email: u.email || '', asset_count: u.asset_count })));
    }
    res.ok(data);
  });

  const asset = async (req, res) => {
    const a = await models.assets.rawById(Number(req.params.id));
    if (!a) res.fail(404, 'That asset no longer exists.');
    return a;
  };

  async function removeAsset(a, reason, block, adminId) {
    const wasActive = a.status === 'active';
    await models.assets.setStatus(a.id, 'removed', reason);
    if (block) await models.assets.blockHash(a.file_sha256, reason);
    await models.reports.resolveAllFor(a.id, 'actioned', adminId);
    if (wasActive) await quarantine(models, storage, a, ctx.log);
  }

  app.post('/api/admin/reports/:id/dismiss', requireAdmin, async (req, res) => {
    await models.reports.resolve(Number(req.params.id), 'dismissed', req.user.id);
    res.ok({ message: 'Report dismissed.' });
  });

  app.post('/api/admin/reports/:id/remove', requireAdmin, async (req, res) => {
    const r = await models.reports.byId(Number(req.params.id));
    if (!r) return res.fail(404, 'That report no longer exists.');
    const a = await models.assets.rawById(r.asset_id);
    if (a) await removeAsset(a, String(req.body.reason || r.reason).slice(0, 200), !!req.body.block, req.user.id);
    return res.ok({ message: 'Asset removed and reports resolved.' });
  });

  app.post('/api/admin/assets/:id/remove', requireAdmin, async (req, res) => {
    const a = await asset(req, res);
    if (!a) return undefined;
    await removeAsset(a, String(req.body.reason || 'guidelines').slice(0, 200), !!req.body.block, req.user.id);
    return res.ok({ message: `Removed “${a.title}”.` });
  });

  app.post('/api/admin/assets/:id/restore', requireAdmin, async (req, res) => {
    const a = await asset(req, res);
    if (!a) return undefined;
    await models.assets.setStatus(a.id, 'active', null);
    if (a.status !== 'active') await release(models, storage, a, ctx.log);
    if (a.file_sha256) await models.assets.unblockHash(a.file_sha256);
    return res.ok({ message: `Restored “${a.title}”.` });
  });

  app.post('/api/admin/assets/:id/purge', requireAdmin, async (req, res) => {
    const a = await asset(req, res);
    if (!a) return undefined;
    await models.assets.remove(a.id);
    for (const k of [a.file_key, a.preview_key, a.thumb_key]) await storage.remove(k);
    return res.ok({ message: `Permanently deleted “${a.title}”.` });
  });

  const target = async (req, res) => {
    const u = await models.users.byId(Number(req.params.id));
    if (!u) { res.fail(404, 'That user no longer exists.'); return null; }
    if (u.id === req.user.id) { res.fail(400, 'You can’t do that to your own account.'); return null; }
    if (u.is_system) { res.fail(400, 'That’s the account anonymous uploads belong to. Remove individual uploads instead.'); return null; }
    return u;
  };

  app.post('/api/admin/users/:id/ban', requireAdmin, async (req, res) => {
    const u = await target(req, res);
    if (!u) return undefined;
    await models.users.setBanned(u.id, !u.banned);
    if (!u.banned) await models.sessions.destroyAllFor(u.id);
    return res.ok({ message: u.banned ? `@${u.username} was unbanned.` : `@${u.username} was banned and their uploads hidden.` });
  });

  app.post('/api/admin/users/:id/role', requireAdmin, async (req, res) => {
    const u = await target(req, res);
    if (!u) return undefined;
    await models.users.setRole(u.id, u.role === 'admin' ? 'user' : 'admin');
    return res.ok({ message: `@${u.username} is now ${u.role === 'admin' ? 'a regular member' : 'a moderator'}.` });
  });

  app.post('/api/admin/users/:id/reset', requireAdmin, async (req, res) => {
    const u = await target(req, res);
    if (!u) return undefined;
    const link = ctx.absolute(req, `/reset/${await models.resets.create(u.id)}`);
    return res.ok({ link, message: `Password reset link for @${u.username} (valid 24 hours, share it privately): ${link}` });
  });
};
