'use strict';
// Local development server. On Vercel, api/index.js serves the same app as a function.
const { loadConfig } = require('./src/config');
const { createFrontend } = require('./src/app');

const config = loadConfig();
const app = createFrontend(config);
app.listen(config.port, config.host, () => {
  console.log(`ClipFX website running at http://localhost:${config.port}`);
  console.log(`Talking to the API at ${config.backendUrl}`);
});
