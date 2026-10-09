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

module.exports = function accountRoutes(app, ctx) {
  const { views, models, storage, requireUser, rate, cookieBase } = ctx;

  const settings = (req, res, extra = {}, status = 200) => res.view(views.settings, {
    values: { display_name: req.user.display_name, bio: req.user.bio, website: req.user.website, email: req.user.email || '' },
    errors: {}, section: null, ...extra,
  }, status);

  app.get('/settings', requireUser, (req, res) => settings(req, res));

  app.post('/settings/profile', requireUser, (req, res) => {
    const b = req.body || {};
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
      const other = models.users.byLogin(values.email);
      if (!ctx.EMAIL_RE.test(values.email) || values.email.length > 200) errors.email = 'That email doesn’t look right.';
      else if (other && other.id !== req.user.id) errors.email = 'Another account uses that email.';
    }
    if (Object.keys(errors).length) return settings(req, res, { values, errors, section: 'profile' }, 400);
    models.users.updateProfile(req.user.id, { displayName: values.display_name, bio: values.bio, website: values.website, email: values.email });
    res.flash('success', 'Profile updated.');
    return res.redirect(303, '/settings');
  });

  app.post('/settings/password', requireUser, rate('password', 10, 3600 * 1000), async (req, res) => {
    const b = req.body || {};
    const errors = {};
    if (!(await verifyPassword(String(b.current || ''), req.user.password_hash))) errors.current = 'That’s not your current password.';
    const pwError = ctx.validatePassword(String(b.password || ''));
    if (pwError) errors.password = pwError;
    if (Object.keys(errors).length) return settings(req, res, { errors, section: 'password' }, 400);
    models.users.setPassword(req.user.id, await hashPassword(String(b.password)));
    models.sessions.destroyAllFor(req.user.id);
    ctx.login(res, req.user.id);
    res.flash('success', 'Password changed. Other devices were signed out.');
    return res.redirect(303, '/settings');
  });

  app.post('/settings/delete', requireUser, rate('delete-account', 5, 3600 * 1000), async (req, res) => {
    const b = req.body || {};
    const ok = String(b.confirm || '').trim().toLowerCase() === req.user.username
      && await verifyPassword(String(b.password || ''), req.user.password_hash);
    if (!ok) return settings(req, res, { errors: { delete: 'Type your username and current password to confirm.' }, section: 'delete' }, 400);
    const keys = models.assets.keysForUser(req.user.id);
    models.users.remove(req.user.id);
    await Promise.all(keys.flatMap((k) => [k.file_key, k.preview_key, k.thumb_key]).map((k) => storage.remove(k)));
    res.clearCookie('sid', cookieBase);
    res.flash('success', 'Your account and uploads were deleted. Thanks for being part of the community.');
    return res.redirect(303, '/');
  });
};

module.exports.normalizeWebsite = normalizeWebsite;
