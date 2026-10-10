'use strict';
// Production database: any Postgres, e.g. Supabase. Tables live in their own "clipfx" schema,
// which Supabase does not publish through its REST API, and row-level security is switched on
// as a second safeguard: only this server's own database user can read them.
const { Pool, types } = require('pg');

// BIGINT and NUMERIC come back as strings by default; every value we store fits in a JS number.
types.setTypeParser(20, (v) => Number(v));
types.setTypeParser(1700, (v) => Number(v));

const TABLES = ['users', 'sessions', 'reset_tokens', 'assets', 'daily_downloads', 'favorites', 'reports', 'uploads', 'blocked_hashes', 'oauth_accounts'];

const schemaSql = (SCHEMA_NAME) => `
CREATE SCHEMA IF NOT EXISTS ${SCHEMA_NAME};
SET search_path TO ${SCHEMA_NAME};

CREATE TABLE IF NOT EXISTS users (
  id BIGSERIAL PRIMARY KEY,
  username TEXT NOT NULL UNIQUE,
  email TEXT UNIQUE,
  password_hash TEXT NOT NULL,
  display_name TEXT NOT NULL,
  bio TEXT NOT NULL DEFAULT '',
  website TEXT NOT NULL DEFAULT '',
  role TEXT NOT NULL DEFAULT 'user',
  banned INTEGER NOT NULL DEFAULT 0,
  created_at BIGINT NOT NULL
);

CREATE TABLE IF NOT EXISTS sessions (
  token_hash TEXT PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at BIGINT NOT NULL,
  created_at BIGINT NOT NULL
);
CREATE INDEX IF NOT EXISTS sessions_user ON sessions(user_id);

CREATE TABLE IF NOT EXISTS reset_tokens (
  token_hash TEXT PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at BIGINT NOT NULL
);

CREATE TABLE IF NOT EXISTS assets (
  id BIGSERIAL PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  category TEXT NOT NULL,
  software TEXT NOT NULL DEFAULT ',',
  tags TEXT NOT NULL DEFAULT ',',
  license TEXT NOT NULL,
  visibility TEXT NOT NULL DEFAULT 'public',
  file_name TEXT NOT NULL,
  file_key TEXT NOT NULL,
  file_size BIGINT NOT NULL,
  file_ext TEXT NOT NULL,
  file_kind TEXT NOT NULL,
  file_sha256 TEXT NOT NULL DEFAULT '',
  preview_key TEXT,
  preview_ext TEXT,
  thumb_key TEXT,
  width INTEGER,
  height INTEGER,
  duration DOUBLE PRECISION,
  media_status TEXT NOT NULL DEFAULT 'none',
  downloads INTEGER NOT NULL DEFAULT 0,
  views INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'active',
  removed_reason TEXT,
  created_at BIGINT NOT NULL,
  updated_at BIGINT NOT NULL
);
CREATE INDEX IF NOT EXISTS assets_listing ON assets(status, visibility, created_at);
CREATE INDEX IF NOT EXISTS assets_user ON assets(user_id, created_at);
CREATE INDEX IF NOT EXISTS assets_category ON assets(category, created_at);
CREATE INDEX IF NOT EXISTS assets_hash ON assets(file_sha256);
CREATE INDEX IF NOT EXISTS assets_search ON assets USING GIN (to_tsvector('simple', title || ' ' || description || ' ' || tags));

CREATE TABLE IF NOT EXISTS daily_downloads (
  asset_id BIGINT NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
  day INTEGER NOT NULL,
  count INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (asset_id, day)
);
CREATE INDEX IF NOT EXISTS daily_downloads_day ON daily_downloads(day);

CREATE TABLE IF NOT EXISTS favorites (
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  asset_id BIGINT NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
  created_at BIGINT NOT NULL,
  PRIMARY KEY (user_id, asset_id)
);
CREATE INDEX IF NOT EXISTS favorites_asset ON favorites(asset_id);

CREATE TABLE IF NOT EXISTS reports (
  id BIGSERIAL PRIMARY KEY,
  asset_id BIGINT NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
  reporter_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
  reason TEXT NOT NULL,
  details TEXT NOT NULL DEFAULT '',
  contact TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'open',
  created_at BIGINT NOT NULL,
  resolved_at BIGINT,
  resolved_by BIGINT REFERENCES users(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS reports_status ON reports(status, created_at);

CREATE TABLE IF NOT EXISTS uploads (
  id TEXT PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  key TEXT NOT NULL,
  field TEXT NOT NULL,
  file_name TEXT NOT NULL,
  ext TEXT NOT NULL,
  size BIGINT NOT NULL,
  content_type TEXT NOT NULL,
  multipart_id TEXT,
  part_size BIGINT,
  created_at BIGINT NOT NULL
);
CREATE INDEX IF NOT EXISTS uploads_user ON uploads(user_id);
CREATE INDEX IF NOT EXISTS uploads_created ON uploads(created_at);

-- Sign-in through other providers (Google). One row per linked account.
CREATE TABLE IF NOT EXISTS oauth_accounts (
  provider TEXT NOT NULL,
  subject TEXT NOT NULL,
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at BIGINT NOT NULL,
  PRIMARY KEY (provider, subject)
);
CREATE INDEX IF NOT EXISTS oauth_accounts_user ON oauth_accounts(user_id);

CREATE TABLE IF NOT EXISTS blocked_hashes (
  sha256 TEXT PRIMARY KEY,
  reason TEXT NOT NULL,
  created_at BIGINT NOT NULL
);

${TABLES.map((t) => `ALTER TABLE ${t} ENABLE ROW LEVEL SECURITY;`).join('\n')}
`;

// "?" placeholders (shared with SQLite) → "$1, $2, …".
function toPg(sql) {
  let n = 0;
  return sql.replace(/\?/g, () => `$${++n}`);
}

async function openPostgres(url, { ssl, schema = 'clipfx' } = {}) {
  if (!/^[a-z_][a-z0-9_]*$/.test(schema)) throw new Error(`Invalid DATABASE_SCHEMA: ${schema}`);
  const SCHEMA_NAME = schema;
  const useSsl = ssl ?? !/localhost|127\.0\.0\.1/.test(url);
  const pool = new Pool({
    connectionString: url,
    // Supabase's pooler presents a certificate signed by its own CA; traffic is still encrypted.
    ssl: useSsl ? { rejectUnauthorized: false } : false,
    max: Number(process.env.DATABASE_POOL_SIZE) || 5,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 15000,
  });
  pool.on('error', (err) => console.error(`[db] idle client error: ${err.message}`));

  // Every connection points at our schema before its first query. With Supabase's session
  // pooler (port 5432) the setting lasts for the life of the connection.
  async function withClient(fn) {
    const client = await pool.connect();
    try {
      if (!client.clipfxSchemaSet) {
        await client.query(`SET search_path TO ${SCHEMA_NAME}`);
        client.clipfxSchemaSet = true;
      }
      return await fn(client);
    } finally {
      client.release();
    }
  }
  const query = (sql, params) => withClient((c) => c.query(toPg(sql), params));

  await pool.query(schemaSql(SCHEMA_NAME));
  const added = Object.entries(require('./columns'))
    .flatMap(([table, cols]) => cols.map(([name, type]) => `ALTER TABLE ${SCHEMA_NAME}.${table} ADD COLUMN IF NOT EXISTS ${name} ${type};`));
  await pool.query(added.join('\n'));

  return {
    dialect: 'postgres',
    async get(sql, params = []) { return (await query(sql, params)).rows[0]; },
    async all(sql, params = []) { return (await query(sql, params)).rows; },
    async run(sql, params = []) { const r = await query(sql, params); return { changes: r.rowCount, rows: r.rows }; },
    batch: (statements) => withClient(async (client) => {
      try {
        await client.query('BEGIN');
        for (const [sql, params = []] of statements) await client.query(toPg(sql), params);
        await client.query('COMMIT');
      } catch (err) {
        await client.query('ROLLBACK').catch(() => {});
        throw err;
      }
    }),
    isUniqueViolation: (err, column) => err.code === '23505' && (!column || String(err.constraint || '').includes(column)),
    async close() { await pool.end(); },
  };
}

module.exports = { openPostgres, toPg };
