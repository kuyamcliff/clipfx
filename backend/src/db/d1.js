'use strict';
// Production database: Cloudflare D1, reached through the clipfx-db Worker (workers/db).
// D1 is SQLite, so the SQL is exactly what the local SQLite driver runs.
const { SCHEMA } = require('./sqlite');

// Splits the schema into single statements. Trigger bodies (BEGIN ... END;) stay in one piece.
function splitSql(sql) {
  const out = [];
  let cur = '';
  let inTrigger = false;
  for (const line of sql.split('\n')) {
    const t = line.trim();
    if (!t || t.startsWith('--')) continue;
    cur += line + '\n';
    if (/^CREATE TRIGGER/i.test(t)) inTrigger = true;
    if (inTrigger ? /^END;$/i.test(t) : t.endsWith(';')) {
      out.push(cur.trim().replace(/;$/, ''));
      cur = '';
      inTrigger = false;
    }
  }
  if (cur.trim()) out.push(cur.trim());
  return out;
}

async function openD1(url, secret, { fetchImpl = fetch } = {}) {
  const base = String(url).replace(/\/+$/, '');
  async function call(path, body) {
    let lastErr;
    for (let attempt = 0; attempt < 3; attempt++) {
      let res;
      try {
        res = await fetchImpl(base + path, {
          method: 'POST',
          headers: { authorization: `Bearer ${secret}`, 'content-type': 'application/json' },
          body: JSON.stringify(body),
          signal: AbortSignal.timeout(20000),
        });
      } catch (err) {
        lastErr = err; // network hiccup: retry reads and writes alike, D1 statements are sent whole
        await new Promise((r) => setTimeout(r, 200 * (attempt + 1)));
        continue;
      }
      const data = await res.json().catch(() => ({}));
      if (res.ok) return data;
      const err = new Error(data.error || `Database error (${res.status})`);
      err.status = res.status;
      if (res.status >= 500) { lastErr = err; await new Promise((r) => setTimeout(r, 200 * (attempt + 1))); continue; }
      throw err;
    }
    throw lastErr;
  }

  const db = {
    dialect: 'd1',
    async get(sql, params = []) { return (await call('/v1/query', { op: 'get', sql, params })).row ?? undefined; },
    async all(sql, params = []) { return (await call('/v1/query', { op: 'all', sql, params })).rows; },
    async run(sql, params = []) { const r = await call('/v1/query', { op: 'run', sql, params }); return { changes: r.changes, rows: r.rows }; },
    async batch(statements) { await call('/v1/batch', { statements: statements.map(([sql, params = []]) => [sql, params]) }); },
    isUniqueViolation: (err, column) => /UNIQUE constraint failed/.test(err.message) && (!column || err.message.includes(`.${column}`)),
    async close() {},
  };

  // Create missing tables, then add columns introduced after the first release (see columns.js).
  await db.batch(splitSql(SCHEMA).map((s) => [s, []]));
  const adds = [];
  for (const [table, cols] of Object.entries(require('./columns'))) {
    const have = new Set((await db.all(`PRAGMA table_info(${table})`)).map((c) => c.name));
    for (const [name, type] of cols) if (!have.has(name)) adds.push([`ALTER TABLE ${table} ADD COLUMN ${name} ${type.replace(/\bBIGINT\b/g, 'INTEGER')}`, []]);
  }
  if (adds.length) await db.batch(adds);
  return db;
}

module.exports = { openD1, splitSql };
