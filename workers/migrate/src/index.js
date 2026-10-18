// One-off copy of the ClipFX database from Postgres (Supabase) into D1.
// POST /?dry=1 counts rows only; POST / replaces everything in D1 with the Postgres data.
// Postgres is reached through Hyperdrive, which keeps the connection to Supabase encrypted.
// Protected by MIGRATE_SECRET. Delete this Worker (and the Hyperdrive config) after the move.
import { Client } from 'pg';

// Parents before children, so foreign keys hold while inserting.
const TABLES = ['users', 'oauth_clients', 'assets', 'sessions', 'reset_tokens', 'daily_downloads', 'favorites',
  'reports', 'uploads', 'oauth_accounts', 'api_keys', 'oauth_codes', 'blocked_hashes'];

export default {
  async fetch(request, env) {
    if (request.method !== 'POST' || request.headers.get('authorization') !== `Bearer ${env.MIGRATE_SECRET}`) {
      return new Response('Not found', { status: 404 });
    }
    const dry = new URL(request.url).searchParams.has('dry');
    const pg = new Client({ connectionString: env.HYPERDRIVE.connectionString });
    const report = {};
    try {
      await pg.connect();
      const schema = env.DATABASE_SCHEMA || 'clipfx'; // Hyperdrive pools connections, so no SET search_path
      const data = {};
      for (const t of TABLES) {
        data[t] = (await pg.query(`SELECT * FROM ${schema}.${t}`)).rows;
        report[t] = { source: data[t].length };
      }
      if (dry) return Response.json({ dry: true, report });

      // D1 columns (the schema the API created there), so extra/unknown Postgres columns are skipped.
      const cols = {};
      for (const t of TABLES) cols[t] = (await env.DB.prepare(`PRAGMA table_info(${t})`).all()).results.map((c) => c.name);

      await env.DB.batch([...TABLES].reverse().map((t) => env.DB.prepare(`DELETE FROM ${t}`)));
      for (const t of TABLES) {
        const names = cols[t].filter((c) => data[t].length && c in data[t][0]);
        const sql = `INSERT INTO ${t} (${names.join(', ')}) VALUES (${names.map(() => '?').join(', ')})`;
        const stmts = data[t].map((row) => env.DB.prepare(sql).bind(...names.map((c) => value(row[c]))));
        for (let i = 0; i < stmts.length; i += 50) await env.DB.batch(stmts.slice(i, i + 50));
        report[t].copied = (await env.DB.prepare(`SELECT COUNT(*) AS n FROM ${t}`).first()).n;
      }
      await env.DB.prepare("INSERT INTO assets_fts(assets_fts) VALUES ('rebuild')").run();
      return Response.json({ dry: false, report });
    } catch (err) {
      return Response.json({ error: String(err.stack || err), report }, { status: 500 });
    } finally {
      await pg.end().catch(() => {});
    }
  },
};

function value(v) {
  if (v === undefined || v === null) return null;
  if (v instanceof Date) return v.getTime();
  if (typeof v === 'boolean') return Number(v);
  if (typeof v === 'bigint') return Number(v);
  if (typeof v === 'object') return JSON.stringify(v);
  return v;
}
