'use strict';
// Personal API keys. A key acts as its owner, limited to the scopes picked when it was made.
// Every API route is listed below with the scope it needs. Routes that aren't listed are closed to
// keys (default deny), which keeps key management, passwords and sign-in connections behind a real login.

const SCOPES = [
  { id: 'assets:read', name: 'Read your files', description: 'List all your uploads, including unlisted and password-locked ones, see storage use, and download your own files.' },
  { id: 'assets:write', name: 'Upload and edit files', description: 'Upload new files, edit titles, tags, licenses, visibility, link expiry, download limits and passwords.' },
  { id: 'assets:delete', name: 'Delete files', description: 'Permanently delete your uploads.' },
  { id: 'saved:read', name: 'Read saved files', description: 'List the files you saved.' },
  { id: 'saved:write', name: 'Save and unsave files', description: 'Add files to, or remove them from, your saved list.' },
  { id: 'profile:read', name: 'Read your profile', description: 'Read your account details, including your email.' },
  { id: 'profile:write', name: 'Edit your profile', description: 'Change your display name, bio, website, email, social links and profile photo.' },
  { id: 'reports:write', name: 'Report files', description: 'Report files that break the rules.' },
  { id: 'account:delete', name: 'Delete your account', description: 'Delete your account and everything in it. Still needs your username (and password, if you have one).', danger: true },
  { id: 'admin', name: 'Moderation', description: 'Everything on the moderation page: reports, removing files, bans and roles.', adminOnly: true, danger: true },
];
const SCOPE_IDS = new Set(SCOPES.map((s) => s.id));
// Full access: every scope, including ones added in the future.
const FULL = '*';

// Without the scope, an OPTIONAL route still works but treats the request as logged out.
const OPTIONAL = true;
const ANY = '*';
const RULES = [
  ['GET', /^\/api\/(meta|stats|home|creators)$/, null],
  ['GET', /^\/api\/sitemap(\/[\w-]+)?$/, null],
  ['GET', /^\/api\/users\/[^/]+$/, null],
  ['GET', /^\/api\/session$/, 'profile:read', OPTIONAL],
  ['GET', /^\/api\/assets$/, 'assets:read', OPTIONAL],
  ['GET', /^\/api\/assets\/[^/]+$/, 'assets:read', OPTIONAL],
  ['GET', /^\/api\/assets\/[^/]+\/download$/, 'assets:read', OPTIONAL],
  ['POST', /^\/api\/assets\/[^/]+\/unlock$/, null],
  ['GET', /^\/api\/me\/(assets|storage)$/, 'assets:read'],
  ['GET', /^\/api\/me\/saved$/, 'saved:read'],
  ['POST', /^\/api\/uploads$/, 'assets:write'],
  ['POST', /^\/api\/uploads\/[^/]+\/(complete|abort)$/, 'assets:write'],
  ['POST', /^\/api\/assets$/, 'assets:write'],
  ['POST', /^\/api\/assets\/[^/]+\/edit$/, 'assets:write'],
  ['POST', /^\/api\/assets\/[^/]+\/delete$/, 'assets:delete'],
  ['POST', /^\/api\/assets\/[^/]+\/save$/, 'saved:write'],
  ['POST', /^\/api\/assets\/[^/]+\/report$/, 'reports:write'],
  ['POST', /^\/api\/me\/(profile|avatar|avatar\/remove)$/, 'profile:write'],
  ['POST', /^\/api\/me\/delete$/, 'account:delete'],
  [ANY, /^\/api\/admin(\/.*)?$/, 'admin'],
  // Presigned upload/download URLs for local storage carry their own signature.
  [ANY, /^\/api\/blob\//, null],
];

const MAX_KEYS = 25;
const DAY = 24 * 3600 * 1000;
const MAX_EXPIRY = 3650 * DAY;

// "Authorization: Bearer cfx_..." or "X-API-Key: cfx_...". Returns null when neither is sent.
function tokenFrom(req) {
  const auth = req.get('authorization');
  if (auth && /^bearer\s+/i.test(auth)) return auth.replace(/^bearer\s+/i, '').trim();
  const header = req.get('x-api-key');
  return header ? header.trim() : null;
}

function ruleFor(method, path) {
  const m = method === 'HEAD' ? 'GET' : method;
  return RULES.find(([rm, re]) => (rm === ANY || rm === m) && re.test(path)) || null;
}

// Checks the key's scopes against the route. Runs for every request made with a key.
function authorize(req, res, next) {
  if (!req.apiKey) return next();
  const rule = ruleFor(req.method, req.path);
  if (!rule) return res.fail(403, 'API keys can’t use this endpoint. Log in on the website to do this.');
  const [, , scope, optional] = rule;
  if (!scope || req.apiKey.scopes.includes(FULL) || req.apiKey.scopes.includes(scope)) return next();
  if (optional) { req.user = null; return next(); }
  return res.status(403).json({ ok: false, error: `This API key doesn’t have the "${scope}" permission.`, missing_scope: scope });
}

// Expiry from the create form: "never", a number of days, or a date (YYYY-MM-DD, valid to the end of that day UTC).
function parseExpiry(body, now = Date.now()) {
  const v = body.expires === undefined ? body.expiresInDays : body.expires;
  if (v === 'never' || v === null) return { at: null };
  if (body.expiresAt) {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(body.expiresAt));
    const at = m ? Date.UTC(+m[1], +m[2] - 1, +m[3], 23, 59, 59) : NaN;
    if (!Number.isFinite(at) || at <= now) return { error: 'Pick an expiry date in the future.' };
    if (at - now > MAX_EXPIRY) return { error: 'Keys can last up to 10 years. Choose "Never" for no expiry.' };
    return { at };
  }
  const days = Number(v);
  if (!Number.isInteger(days) || days < 1 || days > 3650) return { error: 'Choose when the key expires.' };
  return { at: now + days * DAY };
}

const publicKey = (row) => ({
  id: row.id, name: row.name, prefix: row.prefix, scopes: row.scopes.split(' ').filter(Boolean),
  expires_at: row.expires_at ? Number(row.expires_at) : null, last_used_at: row.last_used_at ? Number(row.last_used_at) : null,
  created_at: Number(row.created_at), expired: !!(row.expires_at && Number(row.expires_at) <= Date.now()),
  app: !!row.client_id,
});

const scopesFor = (user) => SCOPES.filter((s) => !s.adminOnly || user.role === 'admin');

// Managing keys always needs a real login: these routes aren't in RULES, so keys are refused.
function routes(app, ctx) {
  const { models, requireUser, rate } = ctx;

  app.get('/api/me/keys', requireUser, async (req, res) => {
    const rows = await models.apiKeys.list(req.user.id);
    res.ok({ keys: rows.map(publicKey), scopes: scopesFor(req.user), max: MAX_KEYS });
  });

  app.post('/api/me/keys', requireUser, rate('api-keys', 30, 3600 * 1000), async (req, res) => {
    const b = req.body;
    const errors = {};
    const name = String(b.name || '').trim().replace(/\s+/g, ' ');
    if (!name) errors.name = 'Give the key a name, like "Upload script".';
    else if (name.length > 60) errors.name = 'Keep the name under 60 characters.';
    const allowed = new Set(scopesFor(req.user).map((s) => s.id));
    const wantsFull = b.scopes === 'all' || b.scopes === FULL || b.full === true;
    let scopes = wantsFull ? [FULL] : (Array.isArray(b.scopes) ? b.scopes : [b.scopes]).filter(Boolean).map(String);
    scopes = [...new Set(scopes)];
    if (!scopes.length) errors.scopes = 'Pick at least one permission.';
    else if (!wantsFull && scopes.some((s) => !SCOPE_IDS.has(s))) errors.scopes = 'Unknown permission.';
    else if (!wantsFull && scopes.some((s) => !allowed.has(s))) errors.scopes = 'Only moderators can give keys moderation access.';
    const expiry = parseExpiry(b);
    if (expiry.error) errors.expires = expiry.error;
    if (!errors.name && await models.apiKeys.count(req.user.id) >= MAX_KEYS) errors.name = `You can have up to ${MAX_KEYS} keys. Revoke one you don’t use.`;
    if (Object.keys(errors).length) return res.fail(400, Object.values(errors)[0], errors);
    const order = SCOPES.map((s) => s.id);
    scopes.sort((x, y) => order.indexOf(x) - order.indexOf(y));
    const { id, token } = await models.apiKeys.create(req.user.id, { name, scopes, expiresAt: expiry.at });
    const row = (await models.apiKeys.list(req.user.id)).find((k) => k.id === id);
    return res.ok({ key: publicKey(row), token, message: 'API key created. Copy it now: it won’t be shown again.' }, 201);
  });

  app.post('/api/me/keys/:id/revoke', requireUser, async (req, res) => {
    const r = await models.apiKeys.revoke(req.params.id, req.user.id);
    if (!r.changes) return res.fail(404, 'That key doesn’t exist.');
    return res.ok({ message: 'API key revoked. Anything using it stops working right away.' });
  });
}

module.exports = { SCOPES, SCOPE_IDS, scopesFor, DAY, FULL, RULES, MAX_KEYS, tokenFrom, authorize, parseExpiry, routes };
