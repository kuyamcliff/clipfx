'use strict';
// One async interface over three databases: Cloudflare D1 in production (D1_URL + D1_SECRET),
// Postgres when DATABASE_URL is set, SQLite otherwise (local development and tests).
const { openSqlite } = require('./sqlite');
const { openPostgres } = require('./postgres');
const { openD1 } = require('./d1');

async function openDatabase(config) {
  if (config.d1Url) return openD1(config.d1Url, config.d1Secret);
  if (config.databaseUrl) return openPostgres(config.databaseUrl, { schema: config.databaseSchema });
  return openSqlite(config.dbFile);
}

module.exports = { openDatabase };
