'use strict';
const crypto = require('node:crypto');
const { hashPassword, verifyPassword } = require('../security');

const USERNAME_RE = /^[a-z0-9_]{3,24}$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
// Usernames double as page addresses (jane_doe -> jane-doe.clipfx.me), so infrastructure
// hostnames are reserved too.
const RESERVED = new Set([
  'admin', 'administrator', 'root', 'support', 'help', 'moderator', 'mod', 'staff', 'system', 'clipfx', 'official',
  'upload', 'uploads', 'browse', 'login', 'logout', 'signup', 'settings', 'dashboard', 'saved', 'about', 'api', 'static',
  'null', 'undefined', 'anonymous', 'everyone', 'team',
  'www', 'mail', 'email', 'smtp', 'imap', 'ftp', 'ns1', 'ns2', 'mx', 'cdn', 'assets', 'media', 'image', 'images', 'img',
  'video', 'videos', 'audio', 'download', 'downloads', 'music', 'files', 'file', 'mcp', 'autoclip', 'app', 'apps', 'docs',
  'developer', 'developers', 'dev', 'status', 'blog', 'news', 'auth', 'oauth', 'sso', 'id', 'account', 'accounts', 'billing',
  'pay', 'payments', 'shop', 'store', 'staging', 'test', 'beta', 'preview', 'internal', 'send', 'feedback', 'security',
  'legal', 'privacy', 'terms', 'abuse', 'noreply', 'no_reply', 'webmaster', 'hostmaster', 'postmaster', 'analytics', 'stats',
]);

function validatePassword(pw) {
  if (pw.length < 8) return 'Use at least 8 characters.';
  if (pw.length > 200) return 'That password is too long.';
  return null;
}

// A free username based on someone's Google/GitHub name or email, e.g. "jane_doe" or "jane_doe2".
async function pickUsername(models, ...candidates) {
  let base = '';
  for (const c of candidates) {
    base = String(c || '').normalize('NFKD').replace(/[^\x00-\x7f]/g, '').toLowerCase()
      .replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 20);
    if (base.length >= 3) break;
  }
  if (base.length < 3) base = 'maker';
  for (let i = 0; i < 50; i++) {
    const name = i ? `${base.slice(0, 20)}${i + 1}` : base;
    if (!RESERVED.has(name) && USERNAME_RE.test(name) && !(await models.users.byUsername(name))) return name;
  }
  return `${base.slice(0, 14)}_${crypto.randomBytes(4).toString('hex')}`;
}

// The ID token comes straight from Google's token endpoint over TLS, authenticated with our
// client secret, so its claims can be read without checking the signature (Google's guidance).
function readIdToken(idToken, clientId) {
  try {
    const claims = JSON.parse(Buffer.from(String(idToken).split('.')[1], 'base64url').toString());
    const issuerOk = claims.iss === 'https://accounts.google.com' || claims.iss === 'accounts.google.com';
    if (!issuerOk || claims.aud !== clientId || !claims.sub || Number(claims.exp) * 1000 < Date.now()) return null;
    return claims;
  } catch {
    return null;
  }
}

module.exports = function authRoutes(app, ctx) {
  const { models, config, rate, cookieBase } = ctx;

  app.post('/api/auth/signup', rate('signup', 10, 3600 * 1000), async (req, res) => {
    const b = req.body;
    const firstUser = (await models.users.count()) === 0;
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
    else if (await models.users.byUsername(values.username)) errors.username = 'That username is taken.';
    if (values.email) {
      if (!EMAIL_RE.test(values.email) || values.email.length > 200) errors.email = 'That email doesn’t look right.';
      else if (await models.users.byLogin(values.email)) errors.email = 'An account with that email already exists.';
    }
    const pwError = validatePassword(password);
    if (pwError) errors.password = pwError;
    if (!b.agree) errors.agree = 'Please agree to the guidelines.';
    if (Object.keys(errors).length) return res.fail(400, 'Check the highlighted fields.', errors);

    const role = firstUser || config.adminUsernames.includes(values.username) ? 'admin' : 'user';
    let id;
    try {
      id = await models.users.create({
        username: values.username, email: values.email, passwordHash: await hashPassword(password),
        displayName: values.display_name || values.username, role,
      });
    } catch (err) {
      if (models.db.isUniqueViolation(err)) return res.fail(400, 'Check the highlighted fields.', { username: 'That username or email is taken.' });
      throw err;
    }
    await ctx.login(res, id);
    return res.ok({
      user: await ctx.publicUser(await models.users.byId(id), { self: true }),
      message: role === 'admin' && firstUser ? 'Account created. As the first member you’re the site admin.' : 'Account created.',
    }, 201);
  });

  app.post('/api/auth/login', rate('login', 15, 15 * 60 * 1000), async (req, res) => {
    const login = String(req.body.login || '').trim();
    const user = login ? await models.users.byLogin(login) : null;
    const ok = user ? await verifyPassword(String(req.body.password || ''), user.password_hash) : false;
    if (!ok) return res.fail(401, 'Wrong username/email or password.');
    if (user.banned) return res.fail(403, 'This account is suspended. Contact us if you think this is a mistake.');
    await ctx.login(res, user.id);
    return res.ok({ user: await ctx.publicUser(user, { self: true }) });
  });

  // ---- Sign in with Google or GitHub --------------------------------------------------
  // The website asks for a sign-in URL, keeps state (+ verifier) in a short-lived cookie, sends the
  // visitor to the provider, checks the state when they come back and hands the code to
  // POST /api/auth/:provider. Signed in already? The provider gets connected to that account.
  const callbackUri = (req, name) => `${config.baseUrl || `${req.protocol}://${req.get('x-forwarded-host') || req.get('host')}`}/auth/${name}/callback`;
  const postForm = async (url, params) => {
    const r = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded', accept: 'application/json' },
      body: new URLSearchParams(params),
      signal: AbortSignal.timeout(15000),
    });
    return { ok: r.ok, status: r.status, data: await r.json().catch(() => ({})) };
  };

  const PROVIDERS = {
    google: {
      label: 'Google',
      ready: () => !!(config.google.clientId && config.google.clientSecret),
      authorizeUrl(req, state, verifier) {
        const g = config.google;
        return `${g.authUrl}?${new URLSearchParams({
          client_id: g.clientId, redirect_uri: callbackUri(req, 'google'), response_type: 'code', scope: 'openid email profile', state,
          code_challenge: crypto.createHash('sha256').update(verifier).digest('base64url'), code_challenge_method: 'S256', prompt: 'select_account',
        })}`;
      },
      async identify(req, code, verifier) {
        const g = config.google;
        const r = await postForm(g.tokenUrl, {
          code, code_verifier: verifier, client_id: g.clientId, client_secret: g.clientSecret,
          redirect_uri: callbackUri(req, 'google'), grant_type: 'authorization_code',
        });
        if (!r.ok) throw new Error(`token ${r.status} ${r.data.error || ''} ${r.data.error_description || ''}`);
        const claims = readIdToken(r.data.id_token, g.clientId);
        if (!claims) throw new Error('unusable ID token');
        const email = claims.email && claims.email_verified === true ? String(claims.email).toLowerCase() : '';
        return { subject: claims.sub, email, name: claims.name, hints: [email.split('@')[0], claims.name] };
      },
    },
    // GitHub OAuth App. The address comes from /user/emails (primary and verified only), so a
    // GitHub sign-in can be matched to an existing account with the same address.
    github: {
      label: 'GitHub',
      ready: () => !!(config.github.clientId && config.github.clientSecret),
      authorizeUrl(req, state, verifier) {
        const g = config.github;
        return `${g.authUrl}?${new URLSearchParams({
          client_id: g.clientId, redirect_uri: callbackUri(req, 'github'), scope: 'read:user user:email', state, allow_signup: 'true',
          code_challenge: crypto.createHash('sha256').update(verifier).digest('base64url'), code_challenge_method: 'S256',
        })}`;
      },
      async identify(req, code, verifier) {
        const g = config.github;
        const r = await postForm(g.tokenUrl, {
          client_id: g.clientId, client_secret: g.clientSecret, code, code_verifier: verifier, redirect_uri: callbackUri(req, 'github'),
        });
        if (!r.ok || !r.data.access_token) throw new Error(`token ${r.status} ${r.data.error || ''} ${r.data.error_description || ''}`);
        const api = async (path) => {
          const u = await fetch(`${g.apiUrl}${path}`, {
            headers: { authorization: `Bearer ${r.data.access_token}`, accept: 'application/vnd.github+json', 'user-agent': config.siteName, 'x-github-api-version': '2022-11-28' },
            signal: AbortSignal.timeout(15000),
          });
          if (!u.ok) throw new Error(`${path} ${u.status}`);
          return u.json();
        };
        const user = await api('/user');
        if (!user || !user.id) throw new Error('no user id');
        let email = '';
        try {
          const emails = await api('/user/emails');
          const primary = (Array.isArray(emails) ? emails : []).find((e) => e.primary && e.verified);
          email = primary ? String(primary.email).toLowerCase() : '';
        } catch (err) {
          ctx.log.warn(`[github] emails failed: ${err.message}`);
        }
        if (/@users\.noreply\.github\.com$/.test(email)) email = '';
        return { subject: String(user.id), email, name: user.name || user.login, hints: [user.login, user.name, email.split('@')[0]] };
      },
    },
  };
  // Only known provider names match; anything else (logout, reset...) falls through to its own route.
  const knownProvider = (req, res, next) => (Object.hasOwn(PROVIDERS, req.params.provider) ? next() : next('route'));
  const provider = (req, res) => {
    const p = PROVIDERS[req.params.provider];
    if (!p.ready()) { res.fail(404, 'That sign-in method isn’t set up on this site.'); return null; }
    return p;
  };
  ctx.authProviders = () => Object.keys(PROVIDERS).filter((k) => PROVIDERS[k].ready());
  ctx.providerLabel = (k) => (PROVIDERS[k] ? PROVIDERS[k].label : k);

  app.get('/api/auth/:provider/start', knownProvider, (req, res) => {
    const p = provider(req, res);
    if (!p) return undefined;
    const state = crypto.randomBytes(24).toString('base64url');
    const verifier = crypto.randomBytes(48).toString('base64url');
    return res.ok({ url: p.authorizeUrl(req, state, verifier), state, verifier });
  });

  app.post('/api/auth/:provider', knownProvider, rate('login', 15, 15 * 60 * 1000), async (req, res) => {
    const name = req.params.provider;
    const p = provider(req, res);
    if (!p) return undefined;
    const code = String(req.body.code || '');
    const verifier = String(req.body.verifier || '');
    if (!code || !verifier) return res.fail(400, `${p.label} sign-in didn’t finish. Please try again.`);

    let who = null;
    try {
      who = await p.identify(req, code, verifier);
    } catch (err) {
      ctx.log.warn(`[${name}] sign-in failed: ${err.message}`);
    }
    if (!who || !who.subject) return res.fail(400, `${p.label} sign-in didn’t work. Please try again.`);

    let user = await models.oauth.user(name, who.subject);

    // Already signed in: connect this provider to the current account.
    if (req.user) {
      if (user && user.id !== req.user.id) return res.fail(409, `That ${p.label} account is already used by another ${config.siteName} account.`);
      if (!user) await models.oauth.link(name, who.subject, req.user.id);
      return res.ok({ user: await ctx.publicUser(req.user, { self: true }), linked: true, message: `${p.label} is connected. You can use it to log in.` });
    }

    let created = false;
    if (!user && who.email) {
      // An existing account with the same verified address: link it.
      const existing = await models.users.byLogin(who.email);
      if (existing && existing.email === who.email) {
        await models.oauth.link(name, who.subject, existing.id);
        user = existing;
      }
    }
    if (!user) {
      const firstUser = (await models.users.count()) === 0;
      if (!config.openSignups && !firstUser) return res.fail(403, 'New accounts are paused for now. Please check back soon.');
      const username = await pickUsername(models, ...who.hints);
      const role = firstUser || config.adminUsernames.includes(username) ? 'admin' : 'user';
      const displayName = String(who.name || '').replace(/\s+/g, ' ').trim().slice(0, 50) || username;
      const emailFree = who.email && !(await models.users.byLogin(who.email));
      const id = await models.users.create({ username, email: emailFree ? who.email : '', passwordHash: '', displayName, role });
      await models.oauth.link(name, who.subject, id);
      user = await models.users.byId(id);
      created = true;
    }
    if (user.banned) return res.fail(403, 'This account is suspended. Contact us if you think this is a mistake.');
    await ctx.login(res, user.id);
    return res.ok({
      user: await ctx.publicUser(user, { self: true }),
      created,
      message: created ? `Welcome to ${config.siteName}! Your username is @${user.username}.` : null,
    }, created ? 201 : 200);
  });

  // Disconnect a provider, as long as the account keeps another way to log in.
  app.post('/api/me/connections/:provider/remove', async (req, res) => {
    if (!req.user) return res.fail(401, 'Log in first.');
    const name = req.params.provider;
    const linked = await models.oauth.forUser(req.user.id);
    if (!linked.includes(name)) return res.fail(400, 'That sign-in method isn’t connected.');
    if (!req.user.password_hash && linked.length < 2) {
      return res.fail(400, `Set a password or connect another sign-in method before disconnecting ${ctx.providerLabel(name)}.`);
    }
    await models.oauth.unlink(name, req.user.id);
    return res.ok({ message: `${ctx.providerLabel(name)} is disconnected.` });
  });

  app.post('/api/auth/logout', async (req, res) => {
    await models.sessions.destroy(req.cookies.sid);
    res.clearCookie('sid', cookieBase);
    res.ok();
  });

  app.get('/api/auth/reset/:token', async (req, res) => {
    const reset = await models.resets.find(req.params.token);
    if (!reset) return res.fail(410, 'This reset link is invalid or has expired. Ask a moderator for a new one.');
    return res.ok({ username: (await models.users.byId(reset.user_id)).username });
  });

  app.post('/api/auth/reset/:token', rate('reset', 10, 3600 * 1000), async (req, res) => {
    const reset = await models.resets.find(req.params.token);
    if (!reset) return res.fail(410, 'This reset link is invalid or has expired.');
    const password = String(req.body.password || '');
    const error = validatePassword(password);
    if (error) return res.fail(400, error, { password: error });
    await models.users.setPassword(reset.user_id, await hashPassword(password));
    await models.resets.consume(req.params.token);
    await models.sessions.destroyAllFor(reset.user_id);
    await ctx.login(res, reset.user_id);
    return res.ok({ message: 'Password updated. You’re logged in.' });
  });

  ctx.validatePassword = validatePassword;
  ctx.EMAIL_RE = EMAIL_RE;
};
