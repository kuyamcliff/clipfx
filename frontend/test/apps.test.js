'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { APPS, knownApp } = require('../src/apps');

const id = (name, redirect) => (knownApp(name, redirect) || {}).id || null;

test('known apps are recognized by their own return addresses', () => {
  assert.equal(id('Claude', 'https://claude.ai/api/mcp/auth_callback'), 'claude');
  assert.equal(id('Claude Code', 'http://localhost:51234/callback'), 'claude');
  assert.equal(id('ChatGPT', 'https://chatgpt.com/connector_platform_oauth_redirect'), 'chatgpt');
  assert.equal(id('Codex', 'http://127.0.0.1:1455/auth/callback'), 'chatgpt');
  assert.equal(id('Cursor', 'cursor://anysphere.cursor-retrieval/oauth/user-clipfx/callback'), 'cursor');
  assert.equal(id('Visual Studio Code', 'http://127.0.0.1:33418/'), 'vscode');
  assert.equal(id('Visual Studio Code', 'https://vscode.dev/redirect'), 'vscode');
  assert.equal(id('Cline', 'vscode://saoudrizwan.claude-dev/mcp-auth'), 'cline');
  assert.equal(id('Windsurf', 'windsurf://codeium.windsurf/mcp'), 'windsurf');
  assert.equal(id('Gemini CLI MCP Client', 'http://localhost:7777/oauth/callback'), 'gemini');
  assert.equal(id('GitHub Copilot', 'https://github.com/login/oauth/callback'), 'githubcopilot');
  assert.equal(id('Le Chat', 'https://chat.mistral.ai/oauth/callback'), 'mistral');
  assert.equal(id('MCP Inspector', 'http://localhost:6274/oauth/callback'), 'mcp');
  assert.equal(id('Zed', 'http://127.0.0.1:9000/cb'), 'zed');
  assert.equal(id('Postman', 'https://oauth.pstmn.io/v1/callback'), 'postman');
});

test('names alone never earn a logo, and lookalike domains are refused', () => {
  assert.equal(id('Claude', 'https://evil.example/cb'), null);
  assert.equal(id('ChatGPT', 'https://chatgpt.com.evil.example/cb'), null);
  assert.equal(id('Cursor', 'https://notcursor.example/cb'), null);
  assert.equal(id('Visual Studio Code', 'https://vscode.dev.attacker.io/cb'), null);
  assert.equal(id('Something', 'http://127.0.0.1:5000/cb'), null);
  assert.equal(id('Claude', 'http://evil.example/cb'), null, 'http to a public host is not "this computer"');
  assert.equal(id('Claude', 'not a url'), null);
});

test('every logo file exists', () => {
  for (const a of APPS) assert.ok(fs.existsSync(path.join(__dirname, '..', 'public', 'static', 'img', 'apps', a.logo)), a.logo);
});
