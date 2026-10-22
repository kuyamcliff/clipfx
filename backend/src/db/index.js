'use strict';
// One async interface over two databases: Postgres in production (DATABASE_URL), SQLite otherwise.
const { openSqlite } = require('./sqlite');
const { openPostgres } = require('./postgres');

async function openDatabase(config) {
  if (config.databaseUrl) return openPostgres(config.databaseUrl, { schema: config.databaseSchema });
  return openSqlite(config.dbFile);
}

module.exports = { openDatabase };
