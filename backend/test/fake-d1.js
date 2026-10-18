'use strict';
// A local stand-in for the clipfx-db Worker (workers/db): same endpoints, same responses,
// backed by a SQLite file. Lets the test suite exercise the D1 driver without Cloudflare.
const http = require('node:http');
const { DatabaseSync } = require('node:sqlite');

async function startFakeD1(file, secret) {
  const db = new DatabaseSync(file);
  db.exec('PRAGMA foreign_keys = ON');
  const run = (sql, params = []) => {
    const st = db.prepare(sql);
    if (st.columns().length) return { rows: st.all(...params), changes: 0 };
    const r = st.run(...params);
    return { rows: [], changes: Number(r.changes) };
  };
  const server = http.createServer((req, res) => {
    let raw = '';
    req.on('data', (c) => { raw += c; });
    req.on('end', () => {
      const send = (status, data) => { res.writeHead(status, { 'content-type': 'application/json' }); res.end(JSON.stringify(data)); };
      if (req.headers.authorization !== `Bearer ${secret}`) return send(401, { error: 'Unauthorized.' });
      try {
        const body = JSON.parse(raw || '{}');
        if (req.url === '/v1/query') {
          const r = run(body.sql, body.params);
          if (body.op === 'get') return send(200, { row: r.rows[0] ?? null });
          if (body.op === 'all') return send(200, { rows: r.rows });
          return send(200, r);
        }
        if (req.url === '/v1/batch') {
          db.exec('BEGIN');
          try {
            const results = body.statements.map(([sql, params]) => run(sql, params));
            db.exec('COMMIT');
            return send(200, { results });
          } catch (err) { db.exec('ROLLBACK'); throw err; }
        }
        return send(404, { error: 'Not found.' });
      } catch (err) {
        return send(400, { error: err.message });
      }
    });
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  return {
    url: `http://127.0.0.1:${server.address().port}`,
    async stop() { await new Promise((r) => server.close(r)); db.close(); },
  };
}

module.exports = { startFakeD1 };
