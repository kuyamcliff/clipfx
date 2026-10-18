// ClipFX database gateway: lets the API on Render use Cloudflare D1.
// The API sends the same SQL it runs on SQLite; this Worker runs it on D1 and returns the result.
// Only the API knows DB_SECRET, so nothing else can reach the database through here.

const MAX_BODY = 2 * 1024 * 1024;

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (request.method === 'GET' && url.pathname === '/healthz') return json({ ok: true });
    if (request.method !== 'POST') return json({ error: 'Not found.' }, 404);
    if (!(await authorized(request, env))) return json({ error: 'Unauthorized.' }, 401);
    if (Number(request.headers.get('content-length') || 0) > MAX_BODY) return json({ error: 'Request too large.' }, 413);

    let body;
    try { body = await request.json(); } catch { return json({ error: 'Send JSON.' }, 400); }
    try {
      if (url.pathname === '/v1/query') return json(await query(env.DB, body));
      if (url.pathname === '/v1/batch') return json(await batch(env.DB, body));
      return json({ error: 'Not found.' }, 404);
    } catch (err) {
      // D1 messages keep SQLite's wording ("UNIQUE constraint failed: users.email"), which the API relies on.
      return json({ error: String(err && err.message || err).replace(/^D1_ERROR:\s*/, '') }, 400);
    }
  },
};

async function query(db, { op, sql, params }) {
  const stmt = bind(db, sql, params);
  if (op === 'get') return { row: (await stmt.first()) ?? null };
  if (op === 'all') return { rows: (await stmt.all()).results };
  if (op === 'run') {
    const r = await stmt.all(); // .all() so INSERT ... RETURNING gives its rows back too
    return { changes: r.meta.changes ?? 0, rows: r.results };
  }
  throw new Error(`Unknown op: ${op}`);
}

// All statements commit together or not at all (D1 runs a batch as one transaction).
async function batch(db, { statements }) {
  if (!Array.isArray(statements) || !statements.length) return { results: [] };
  const out = await db.batch(statements.map(([sql, params]) => bind(db, sql, params)));
  return { results: out.map((r) => ({ changes: r.meta.changes ?? 0, rows: r.results })) };
}

function bind(db, sql, params = []) {
  if (typeof sql !== 'string' || !sql.trim()) throw new Error('Missing SQL.');
  const values = (Array.isArray(params) ? params : []).map((v) => (v === undefined ? null : typeof v === 'boolean' ? Number(v) : v));
  return values.length ? db.prepare(sql).bind(...values) : db.prepare(sql);
}

async function authorized(request, env) {
  const got = (request.headers.get('authorization') || '').replace(/^Bearer\s+/i, '');
  if (!env.DB_SECRET || got.length !== env.DB_SECRET.length) return false;
  const enc = new TextEncoder();
  const [a, b] = await Promise.all([crypto.subtle.digest('SHA-256', enc.encode(got)), crypto.subtle.digest('SHA-256', enc.encode(env.DB_SECRET))]);
  return crypto.subtle.timingSafeEqual(a, b);
}

const json = (data, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } });
