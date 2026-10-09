'use strict';
const { loadConfig } = require('./config');
const { createApp } = require('./app');

async function main() {
  const config = loadConfig();
  const { app, media, storage, close, db } = await createApp(config);

  const server = app.listen(config.port, config.host, () => {
    console.log(`${config.siteName} API running at http://localhost:${config.port}`);
    console.log(db.dialect === 'postgres' ? 'Database: Postgres (DATABASE_URL)' : `Database: SQLite (${config.dbFile})`);
    console.log(storage.kind === 'r2' ? `Storage: R2 bucket "${config.r2.bucket}"` : `Storage: local disk (${config.uploadDir}). Set the R2_* variables to use Cloudflare R2.`);
    console.log(media.available ? 'ffmpeg found: thumbnails & previews will be generated.' : 'ffmpeg not found: media processing disabled (uploads still work).');
    if (!config.baseUrl) console.log('BASE_URL is not set: share links will use the request host. Set it to your frontend URL in production.');
    if (!config.uploadsEnabled) console.warn('Uploads are OFF: production needs Cloudflare R2 (set R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET).');
    if (config.production && !config.internalSecret) {
      console.warn('WARNING: INTERNAL_SECRET is not set. Visitor IPs forwarded by the website can’t be trusted, so all visitors share one rate limit. Set the same value on Render and Vercel.');
    }
  });

  // Only local-storage uploads come through this server; give slow connections time.
  server.requestTimeout = 3 * 3600 * 1000;
  server.headersTimeout = 60 * 1000;
  server.keepAliveTimeout = 65 * 1000;

  function shutdown() {
    server.close(() => { close().finally(() => process.exit(0)); });
    setTimeout(() => process.exit(0), 10 * 1000).unref();
  }
  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}

main().catch((err) => {
  console.error(`Failed to start: ${err.message}`);
  process.exit(1);
});
