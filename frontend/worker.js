// Cloudflare Worker entry for the ClipFX website. The same Express app that runs locally
// (server.js) runs here through Workers' Node.js HTTP server support. Static files in public/
// are served by Workers Static Assets before this code runs.
import { httpServerHandler } from 'cloudflare:node';
import { env } from 'cloudflare:workers';
import configModule from './src/config.js';
import appModule from './src/app.js';

const PORT = 8080;

// Page views on developer pages go to Workers Analytics Engine (see src/analytics.js).
const track = (point) => {
  try { env.ANALYTICS?.writeDataPoint(point); } catch { /* analytics never breaks a page */ }
};

const config = configModule.loadConfig({ serveStatic: false, track, analytics: { accountId: env.CF_ACCOUNT_ID || '', token: env.ANALYTICS_TOKEN || '', dataset: 'clipfx_events' } });
appModule.createFrontend(config).listen(PORT);
const http = httpServerHandler({ port: PORT });

export default {
  fetch: http.fetch,
  // Every 10 minutes: keep the API on Render's free plan awake, so visitors never wait for a cold start.
  async scheduled(controller, environment, ctx) {
    ctx.waitUntil(fetch(`${config.backendUrl}/healthz`, { headers: { 'user-agent': 'clipfx-web-cron' } }).catch(() => {}));
  },
};
