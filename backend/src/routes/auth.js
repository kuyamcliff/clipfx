'use strict';
const { hashPassword, verifyPassword } = require('../security');

const USERNAME_RE = /^[a-z0-9_]{3,24}$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const RESERVED = new Set([
  'admin', 'administrator', 'root', 'support', 'help', 'moderator', 'mod', 'staff', 'system', 'clipfx', 'official',
  'upload', 'uploads', 'browse', 'login', 'logout', 'signup', 'settings', 'dashboard', 'saved', 'about', 'api', 'static',
  'null', 'undefined', 'anonymous', 'everyone', 'team',
]);

function validatePassword(pw) {
  if (pw.length < 8) return 'Use at least 8 characters.';
  if (pw.length > 200) return 'That password is too long.';
  return null;
}

module.exports = function authRoutes(app, ctx) {
  const { models, config, rate, cookieBase } = ctx;

  app.post('/api/auth/signup', rate('signup', 10, 3600 * 1000), async (req, res) => {
    const b = req.body;
    const firstUser = models.users.count() === 0;
    if (!config.openSignups && !firstUser) return res.fail(403, 'New accounts are paused for now. Please check back soon.');
    if (b.company) return res.fail(400, 'Something went wrong.'); // honeypot

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
    if (!b.agree) errors.agree = 'Please agree to the guidelines.';
    if (Object.keys(errors).length) return res.fail(400, 'Check the highlighted fields.', errors);

    const role = firstUser || config.adminUsernames.includes(values.username) ? 'admin' : 'user';
    let id;
    try {
      id = models.users.create({
        username: values.username, email: values.email, passwordHash: await hashPassword(password),
        displayName: values.display_name || values.username, role,
      });
    } catch (err) {
      if (/UNIQUE/.test(err.message)) return res.fail(400, 'Check the highlighted fields.', { username: 'That username or email is taken.' });
      throw err;
    }
    ctx.login(res, id);
    return res.ok({
      user: ctx.publicUser(models.users.byId(id), { self: true }),
      message: role === 'admin' && firstUser ? 'Account created. As the first member you’re the site admin.' : 'Account created.',
    }, 201);
  });

  app.post('/api/auth/login', rate('login', 15, 15 * 60 * 1000), async (req, res) => {
    const login = String(req.body.login || '').trim();
    const user = login ? models.users.byLogin(login) : null;
    const ok = user ? await verifyPassword(String(req.body.password || ''), user.password_hash) : false;
    if (!ok) return res.fail(401, 'Wrong username/email or password.');
    if (user.banned) return res.fail(403, 'This account is suspended. Contact us if you think this is a mistake.');
    ctx.login(res, user.id);
    return res.ok({ user: ctx.publicUser(user, { self: true }) });
  });

  app.post('/api/auth/logout', (req, res) => {
    models.sessions.destroy(req.cookies.sid);
    res.clearCookie('sid', cookieBase);
    res.ok();
  });

  app.get('/api/auth/reset/:token', (req, res) => {
    const reset = models.resets.find(req.params.token);
    if (!reset) return res.fail(410, 'This reset link is invalid or has expired. Ask a moderator for a new one.');
    return res.ok({ username: models.users.byId(reset.user_id).username });
  });

  app.post('/api/auth/reset/:token', rate('reset', 10, 3600 * 1000), async (req, res) => {
    const reset = models.resets.find(req.params.token);
    if (!reset) return res.fail(410, 'This reset link is invalid or has expired.');
    const password = String(req.body.password || '');
    const error = validatePassword(password);
    if (error) return res.fail(400, error, { password: error });
    models.users.setPassword(reset.user_id, await hashPassword(password));
    models.resets.consume(req.params.token);
    models.sessions.destroyAllFor(reset.user_id);
    ctx.login(res, reset.user_id);
    return res.ok({ message: 'Password updated. You’re logged in.' });
  });

  ctx.validatePassword = validatePassword;
  ctx.EMAIL_RE = EMAIL_RE;
};
