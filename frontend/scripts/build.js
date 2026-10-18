'use strict';
// Build step for the Cloudflare Worker: writes the CSS/JS version (a hash of the files) into
// src/asset-version.json, since a Worker can't read its own files at runtime.
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const hash = crypto.createHash('sha256');
for (const f of ['css/style.css', 'js/app.js']) hash.update(fs.readFileSync(path.join(__dirname, '..', 'public', 'static', f)));
const version = hash.digest('hex').slice(0, 12);
fs.writeFileSync(path.join(__dirname, '..', 'src', 'asset-version.json'), `${JSON.stringify({ version })}\n`);
console.log(`asset version ${version}`);
