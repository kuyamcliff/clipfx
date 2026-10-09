'use strict';
const { loadConfig } = require('./config');
const { createApp } = require('./app');

const config = loadConfig();
const { app, media, close } = createApp(config);

const server = app.listen(config.port, config.host, () => {
  console.log(`${config.siteName} running at http://localhost:${config.port}`);
  console.log(`Data directory: ${config.dataDir}`);
  console.log(media.available ? 'ffmpeg found: thumbnails & previews will be generated.' : 'ffmpeg not found: media processing disabled (uploads still work).');
});

// Large uploads on slow connections can take a long time.
server.requestTimeout = 3 * 3600 * 1000;
server.headersTimeout = 60 * 1000;
server.keepAliveTimeout = 65 * 1000;

function shutdown() {
  server.close(() => { close(); process.exit(0); });
  setTimeout(() => process.exit(0), 10 * 1000).unref();
}
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
