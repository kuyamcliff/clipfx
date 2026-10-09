'use strict';
// Runs the API (port 4000) and the website (port 3000) together for local development.
// Without R2 settings the API stores files on local disk using the same signed-URL flow.
const { spawn } = require('node:child_process');
const path = require('node:path');

const secret = 'local-dev-secret';
const apps = [
  { name: 'api', dir: 'backend', color: 36, env: { PORT: '4000', BASE_URL: 'http://localhost:3000', INTERNAL_SECRET: secret } },
  { name: 'web', dir: 'frontend', color: 35, env: { PORT: '3000', BACKEND_URL: 'http://localhost:4000', INTERNAL_SECRET: secret } },
];

const children = apps.map((a) => {
  const child = spawn(process.platform === 'win32' ? 'npm.cmd' : 'npm', ['run', 'dev'], {
    cwd: path.join(__dirname, a.dir), env: { ...process.env, ...a.env }, stdio: ['ignore', 'pipe', 'pipe'],
  });
  const prefix = `\x1b[${a.color}m[${a.name}]\x1b[0m `;
  const relay = (stream, out) => stream.on('data', (d) => String(d).split('\n').filter(Boolean).forEach((l) => out.write(prefix + l + '\n')));
  relay(child.stdout, process.stdout);
  relay(child.stderr, process.stderr);
  child.on('exit', (code) => { console.log(`${prefix}exited (${code})`); children.forEach((c) => c.kill()); process.exit(code || 0); });
  return child;
});

process.on('SIGINT', () => children.forEach((c) => c.kill()));
console.log('Website: http://localhost:3000  ·  API: http://localhost:4000');
