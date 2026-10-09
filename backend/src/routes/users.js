'use strict';
const { hashPassword, verifyPassword } = require('../security');

function normalizeWebsite(input) {
  let s = String(input || '').trim();
  if (!s) return { value: '' };
  if (!/^https?:\/\//i.test(s)) s = `https://${s}`;
  try {
    const u = new URL(s);
    if (!['http:', 'https:'].includes(u.protocol) || !u.hostname.includes('.') || s.length > 200) throw new Error('bad');
    return { value: u.toString() };
  } catch {
    return { error: 'Enter a valid web address, like https://yourportfolio.com' };
  }
}

const pageOf = (q) => Math.max(parseInt(q.page, 10) || 1, 1);

module.exports = function userRoutes(app, ctx) {
  const { models, config, storage, requireUser, rate, cookieBase } = ctx;

  app.get('/api/users/:username', async (req, res) => {
    const profile = await models.users.byUsername(req.params.username);
    if (!profile || (profile.banned && !ctx.isAdmin(req))) return res.fail(404, 'There’s no creator with that username.');
    const sort = ctx.SORTS[req.query.sort] ? req.query.sort : 'new';
    res.ok({
      profile: ctx.publicUser(profile),
      stats: await models.users.stats(profile.id),
      result: await models.assets.list({ userId: profile.id, page: pageOf(req.query), sort, perPage: 24, includeBanned: true }),
      sort,
      sorts: ctx.SORTS,
    });
  });

  app.get('/api/me/saved', requireUser, async (req, res) => {
    res.ok({ result: await models.assets.list({ favoritesOf: req.user.id, includeUnlisted: true, sort: 'saved', page: pageOf(req.query), perPage: 24 }) });
  });

  app.get('/api/me/assets', requireUser, async (req, res) => {
    const result = await models.assets.list({ userId: req.user.id, includeUnlisted: true, anyStatus: true, includeBanned: true, page: pageOf(req.query), perPage: 30 });
    result.items.forEach((a) => {
      a.shareUrl = ctx.absolute(req, `/a/${a.slug}`);
      if (a.status !== 'active') ctx.hideMedia(a);
    });
    res.ok({ result, stats: await models.users.stats(req.user.id), used: await models.users.storageUsed(req.user.id), quota: config.userQuota });
  });

  app.get('/api/me/storage', requireUser, async (req, res) => {
    res.ok({ used: await models.users.storageUsed(req.user.id), quota: config.userQuota });
  });

  app.post('/api/me/profile', requireUser, async (req, res) => {
    const b = req.body;
    const values = {
      display_name: String(b.display_name || '').replace(/\s+/g, ' ').trim().slice(0, 50),
      bio: String(b.bio || '').replace(/\r\n?/g, '\n').trim().slice(0, 500),
      website: String(b.website || '').trim(),
      email: String(b.email || '').trim().toLowerCase(),
    };
    const errors = {};
    if (!values.display_name) errors.display_name = 'Display name can’t be empty.';
    const site = normalizeWebsite(values.website);
    if (site.error) errors.website = site.error; else values.website = site.value;
    if (values.email) {
      const other = await models.users.byLogin(values.email);
      if (!ctx.EMAIL_RE.test(values.email) || values.email.length > 200) errors.email = 'That email doesn’t look right.';
      else if (other && other.id !== req.user.id) errors.email = 'Another account uses that email.';
    }
    if (Object.keys(errors).length) return res.fail(400, 'Check the highlighted fields.', errors);
    await models.users.updateProfile(req.user.id, { displayName: values.display_name, bio: values.bio, website: values.website, email: values.email });
    return res.ok({ message: 'Profile updated.', user: ctx.publicUser(await models.users.byId(req.user.id), { self: true }) });
  });

  app.post('/api/me/password', requireUser, rate('password', 10, 3600 * 1000), async (req, res) => {
    const b = req.body;
    const errors = {};
    if (!(await verifyPassword(String(b.current || ''), req.user.password_hash))) errors.current = 'That’s not your current password.';
    const pwError = ctx.validatePassword(String(b.password || ''));
    if (pwError) errors.password = pwError;
    if (Object.keys(errors).length) return res.fail(400, 'Check the highlighted fields.', errors);
    await models.users.setPassword(req.user.id, await hashPassword(String(b.password)));
    await models.sessions.destroyAllFor(req.user.id);
    await ctx.login(res, req.user.id);
    return res.ok({ message: 'Password changed. Other devices were signed out.' });
  });

  app.post('/api/me/delete', requireUser, rate('delete-account', 5, 3600 * 1000), async (req, res) => {
    const b = req.body;
    const ok = String(b.confirm || '').trim().toLowerCase() === req.user.username
      && await verifyPassword(String(b.password || ''), req.user.password_hash);
    if (!ok) return res.fail(400, 'Type your username and current password to confirm.', { delete: 'Type your username and current password to confirm.' });
    const keys = await models.assets.keysForUser(req.user.id);
    const pending = await models.uploads.forUser(req.user.id);
    await models.users.remove(req.user.id);
    for (const k of keys.flatMap((r) => [r.file_key, r.preview_key, r.thumb_key])) await storage.remove(k);
    for (const u of pending) {
      if (u.multipart_id) await storage.abortMultipart(u.key, u.multipart_id);
      await storage.remove(u.key);
    }
    res.clearCookie('sid', cookieBase);
    return res.ok({ message: 'Your account and uploads were deleted.' });
  });
};

module.exports.normalizeWebsite = normalizeWebsite;
