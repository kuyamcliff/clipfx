'use strict';
// Logos for apps that connect through "Sign in with ClipFX" (AI agents and MCP clients).
// App names are self-declared, so a logo is only shown when the return address proves who it is:
//   hosts   - an https return address on the vendor's own domain (or a subdomain of it)
//   schemes - the vendor's own app link scheme, e.g. cursor://
//   names   - the app's name, but only when it returns to this computer (a desktop or CLI app)
// More specific entries come first (Cline runs inside VS Code, GitHub Copilot before Copilot).
// Logos: official marks via Simple Icons, LobeHub Icons and code.visualstudio.com/brand.

const APPS = [
  { id: 'claude', label: 'Claude', logo: 'claude.svg', hosts: ['claude.ai', 'claude.com'], names: /^claude\b/i },
  { id: 'chatgpt', label: 'ChatGPT', logo: 'chatgpt.svg', hosts: ['chatgpt.com', 'chat.openai.com', 'openai.com'], names: /chatgpt|openai|codex/i },
  { id: 'cline', label: 'Cline', logo: 'cline.svg', names: /\bcline\b/i, match: (u) => /^vscode(-insiders)?:$/.test(u.protocol) && /saoudrizwan\.claude-dev|cline/i.test(u.host) },
  { id: 'cursor', label: 'Cursor', logo: 'cursor.svg', schemes: ['cursor'], names: /^cursor\b/i },
  { id: 'githubcopilot', label: 'GitHub Copilot', logo: 'githubcopilot.svg', hosts: ['github.com', 'githubcopilot.com'], names: /github copilot/i },
  { id: 'vscode', label: 'Visual Studio Code', logo: 'vscode.png', hosts: ['vscode.dev'], schemes: ['vscode', 'vscode-insiders'], names: /visual studio code|^vs ?code\b/i },
  { id: 'copilot', label: 'Microsoft Copilot', logo: 'copilot.svg', hosts: ['copilot.microsoft.com', 'consent.azure-apim.net'], names: /copilot studio|microsoft copilot/i },
  { id: 'windsurf', label: 'Windsurf', logo: 'windsurf.svg', hosts: ['windsurf.com', 'codeium.com'], schemes: ['windsurf'], names: /windsurf|codeium/i },
  { id: 'gemini', label: 'Gemini', logo: 'gemini.svg', hosts: ['gemini.google.com'], names: /gemini/i },
  { id: 'mistral', label: 'Le Chat', logo: 'mistral.svg', hosts: ['mistral.ai'], names: /le chat|mistral/i },
  { id: 'perplexity', label: 'Perplexity', logo: 'perplexity.svg', hosts: ['perplexity.ai'], names: /perplexity/i },
  { id: 'grok', label: 'Grok', logo: 'grok.svg', hosts: ['grok.com', 'x.ai'], names: /\bgrok\b|\bxai\b/i },
  { id: 'deepseek', label: 'DeepSeek', logo: 'deepseek.svg', hosts: ['deepseek.com'], names: /deepseek/i },
  { id: 'qwen', label: 'Qwen', logo: 'qwen.svg', hosts: ['qwen.ai', 'qwenlm.ai'], names: /qwen/i },
  { id: 'manus', label: 'Manus', logo: 'manus.svg', hosts: ['manus.im', 'manus.ai'], names: /\bmanus\b/i },
  { id: 'goose', label: 'Goose', logo: 'goose.svg', names: /\bgoose\b/i },
  { id: 'lmstudio', label: 'LM Studio', logo: 'lmstudio.svg', schemes: ['lmstudio'], names: /lm ?studio/i },
  { id: 'trae', label: 'Trae', logo: 'trae.svg', hosts: ['trae.ai'], schemes: ['trae'], names: /\btrae\b/i },
  { id: 'zed', label: 'Zed', logo: 'zed.svg', hosts: ['zed.dev'], schemes: ['zed'], names: /^zed\b/i },
  { id: 'warp', label: 'Warp', logo: 'warp.svg', hosts: ['warp.dev'], schemes: ['warp', 'warppreview'], names: /^warp\b/i },
  { id: 'jetbrains', label: 'JetBrains', logo: 'jetbrains.svg', hosts: ['jetbrains.com'], names: /jetbrains|intellij|pycharm|webstorm|phpstorm|goland|rider|junie/i },
  { id: 'raycast', label: 'Raycast', logo: 'raycast.svg', hosts: ['raycast.com'], schemes: ['raycast'], names: /raycast/i },
  { id: 'replit', label: 'Replit', logo: 'replit.svg', hosts: ['replit.com'], names: /replit/i },
  { id: 'v0', label: 'v0', logo: 'v0.svg', hosts: ['v0.dev', 'v0.app', 'vercel.com'], names: /^v0\b/i },
  { id: 'n8n', label: 'n8n', logo: 'n8n.svg', hosts: ['n8n.cloud', 'n8n.io'], names: /\bn8n\b/i },
  { id: 'zapier', label: 'Zapier', logo: 'zapier.svg', hosts: ['zapier.com'], names: /zapier/i },
  { id: 'make', label: 'Make', logo: 'make.svg', hosts: ['make.com'], names: /^make\b/i },
  { id: 'postman', label: 'Postman', logo: 'postman.svg', hosts: ['postman.com', 'postman.co', 'oauth.pstmn.io'], names: /postman/i },
  { id: 'huggingface', label: 'Hugging Face', logo: 'huggingface.svg', hosts: ['huggingface.co'], names: /hugging ?face/i },
  { id: 'poe', label: 'Poe', logo: 'poe.svg', hosts: ['poe.com'], names: /^poe\b/i },
  { id: 'mcp', label: 'MCP Inspector', logo: 'mcp.svg', names: /mcp inspector/i },
];

const LOOPBACK = new Set(['localhost', '127.0.0.1', '[::1]']);
const onDomain = (host, domains) => (domains || []).some((d) => host === d || host.endsWith(`.${d}`));

// The known app behind an OAuth client, or null. `name` is the client's self-declared name.
function knownApp(name, redirectUri) {
  let u;
  try { u = new URL(redirectUri); } catch { return null; }
  const scheme = u.protocol.replace(/:$/, '');
  const local = u.protocol === 'http:' && LOOPBACK.has(u.hostname);
  const app = APPS.find((a) => (a.match && a.match(u))
    || (u.protocol === 'https:' && onDomain(u.hostname, a.hosts))
    || (a.schemes || []).includes(scheme)
    || (local && a.names && a.names.test(String(name || ''))));
  return app ? { id: app.id, label: app.label, logo: `/static/img/apps/${app.logo}` } : null;
}

module.exports = { APPS, knownApp };
