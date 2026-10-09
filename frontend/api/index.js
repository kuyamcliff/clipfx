'use strict';
// Vercel entry point: every request that isn't a static file is rewritten here (see vercel.json).
const { loadConfig } = require('../src/config');
const { createFrontend } = require('../src/app');

module.exports = createFrontend(loadConfig());
