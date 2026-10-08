'use strict';
const { hashPassword, verifyPassword } = require('../security');

const USERNAME_RE = /^[a-z0-9_]{3,24}$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const RESERVED = new Set([
  'admin', 'administrator', 'root', 'support', 'help', 'moderator', 'mod', 'staff', 'system', 'clipfx', 'official',
  'upload', 'uploads', 'browse', 'login', 'logout', 'signup', 'settings', 'dashboard', 'saved', 'about', 'api', 'static',
  'null', 'undefined', 'anonymous', 'everyone', 'team',
]);

const safeNext = (n) => (typeof n === 'string' && /^\/(?![/\\])/.test(n) ? n : '');

function validatePassword(pw) {
  if (pw.length < 8) return 'Use at least 8 characters.';
  if (pw.length > 200) return 'That password is too long.';
  return null;
}

module.exports = function authRoutes(app, ctx) {
  const { views, models, config, rate, cookieBase } = ctx;

  app.get('/signup', (req, res) => {
    if (req.user) return res.redirect('/');
    return res.view(views.signup, { values: {}, errors: {}, next: safeNext(req.query.next) });
  });

  app.post('/signup', rate('signup', 10, 3600 * 1000), async (req, res) => {
    const b = req.body || {};
    const firstUser = models.users.count() === 0;
    if (!config.openSignups && !firstUser) return res.fail(403, 'Signups are closed', 'New accounts are temporarily paused. Please check back soon.');
    if (b.company) return res.redirect('/'); // honeypot

    const values = {
      username: String(b.username || '').trim().toLowerCase(),
      email: String(b.email || '').trim().toLowerCase(),
      display_name: String(b.display_name || '').replace(/\s+/g, ' ').trim().slice(0, 50),
    };
    const password = String(b.password || '');
    const errors = {};
    if (!USERNAME_RE.test(values.username)) errors.username = '3–24 characters: letters, numbers and underscores.';
    else if (RESERVED.has(values.username)) errors.username = 'That username is reserved.';
    else if (models.users.byUsername(values.username)) errors.username = 'That username is taken.';
    if (values.email) {
      if (!EMAIL_RE.test(values.email) || values.email.length > 200) errors.email = 'That email doesn’t look right.';
      else if (models.users.byLogin(values.email)) errors.email = 'An account with that email already exists.';
    }
    const pwError = validatePassword(password);
    if (pwError) errors.password = pwError;
    if (!b.agree) errors.agree = 'Please agree to the community guidelines.';

    const next = safeNext(b.next);
    if (Object.keys(errors).length) return res.view(views.signup, { values, errors, next }, 400);

    const role = firstUser || config.adminUsernames.includes(values.username) ? 'admin' : 'user';
    let id;
    try {
      id = models.users.create({
        username: values.username, email: values.email, passwordHash: await hashPassword(password),
        displayName: values.display_name || values.username, role,
      });
    } catch (err) {
      if (/UNIQUE/.test(err.message)) return res.view(views.signup, { values, errors: { username: 'That username or email is taken.' }, next }, 400);
      throw err;
    }
    ctx.login(res, id);
    res.flash('success', role === 'admin' && firstUser
      ? 'Welcome! As the first member you’re the site admin.'
      : `Welcome to ${config.siteName}! Share something great.`);
    return res.redirect(next || '/upload');
  });

  app.get('/login', (req, res) => {
    if (req.user) return res.redirect('/');
    return res.view(views.login, { values: {}, error: null, next: safeNext(req.query.next) });
  });

  app.post('/login', rate('login', 15, 15 * 60 * 1000), async (req, res) => {
    const b = req.body || {};
    const login = String(b.login || '').trim();
    const next = safeNext(b.next);
    const user = login ? models.users.byLogin(login) : null;
    const ok = user ? await verifyPassword(String(b.password || ''), user.password_hash) : false;
    if (!ok) return res.view(views.login, { values: { login }, error: 'Wrong username/email or password.', next }, 401);
    if (user.banned) return res.view(views.login, { values: { login }, error: 'This account has been suspended. Contact us if you think this is a mistake.', next }, 403);
    ctx.login(res, user.id);
    return res.redirect(next || '/');
  });

  app.post('/logout', (req, res) => {
    models.sessions.destroy(req.cookies.sid);
    res.clearCookie('sid', cookieBase);
    res.redirect('/');
  });

  app.get('/reset/:token', (req, res) => {
    const reset = models.resets.find(req.params.token);
    if (!reset) return res.fail(410, 'Link expired', 'This password reset link is invalid or has expired. Ask a moderator for a new one.');
    return res.view(views.resetPassword, { token: req.params.token, error: null, user: models.users.byId(reset.user_id) });
  });

  app.post('/reset/:token', rate('reset', 10, 3600 * 1000), async (req, res) => {
    const reset = models.resets.find(req.params.token);
    if (!reset) return res.fail(410, 'Link expired', 'This password reset link is invalid or has expired.');
    const password = String((req.body && req.body.password) || '');
    const error = validatePassword(password);
    if (error) return res.view(views.resetPassword, { token: req.params.token, error, user: models.users.byId(reset.user_id) }, 400);
    models.users.setPassword(reset.user_id, await hashPassword(password));
    models.resets.consume(req.params.token);
    models.sessions.destroyAllFor(reset.user_id);
    ctx.login(res, reset.user_id);
    res.flash('success', 'Password updated. You’re logged in.');
    return res.redirect(303, '/dashboard');
  });

  ctx.validatePassword = validatePassword;
  ctx.EMAIL_RE = EMAIL_RE;
};
