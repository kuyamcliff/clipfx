'use strict';
// /developers/api: how to use personal API keys. Scopes come from the API's own /api/meta, so the
// docs list exactly what the server enforces.
const { html, raw, formatBytes } = require('../src/html');
const { layout } = require('./layout');
const { icon, notice } = require('./components');

const REPORT_REASONS = ['copyright', 'stolen', 'malware', 'inappropriate', 'broken', 'spam', 'other'];

const SECTIONS = [
  ['quick-start', 'Quick start'], ['auth', 'Authentication'], ['permissions', 'Permissions'], ['responses', 'Responses and errors'],
  ['account', 'Your account'], ['files', 'Your files'], ['uploading', 'Uploading a file'], ['fields', 'File fields'],
  ['saved', 'Saved files'], ['locked', 'Password-locked files'], ['reports', 'Reports'], ['moderation', 'Moderation'],
  ['public', 'Public endpoints'], ['limits', 'Limits and safety'],
];

function apiDocs(ctx) {
  const origin = ctx.absolute('');
  const cat = ctx.catalog;
  const scopes = ctx.apiScopes || [];
  const limits = ctx.config;
  const ep = (method, path, scope, text, extra = '') => html`<div class="endpoint">
    <p><span class="method">${method}</span><code>${path}</code>${scope ? html`<span class="scope-pill mono">${scope}</span>` : html`<span class="scope-pill mono">no scope</span>`}</p>
    <p>${text}</p>${extra}</div>`;
  const pre = (s) => html`<pre class="code">${s}</pre>`;
  const ids = (list) => list.map((x, i) => html`${i ? ', ' : ''}<code>${x.id}</code>`);

  const body = html`
  <div class="container docs">
    <nav class="crumbs" aria-label="Breadcrumb"><a href="/developers">API and AI access</a>${icon('chevronRight')}<span>API keys</span></nav>
    <header class="pagehead doc-head"><div>
      <h1>API keys</h1>
      <p class="lede">Use your ${ctx.config.siteName} account from scripts, apps and AI agents. A key acts as you, limited to the permissions you give it.</p>
    </div>
    <div class="btnrow"><a class="btn btn-secondary btn-sm" href="/developers/mcp">${icon('zap')}<span>MCP for AI agents</span></a>
    <a class="btn btn-primary btn-sm" href="${ctx.user ? '/settings/api-keys' : '/login?next=/settings/api-keys'}">${icon('key')}<span>Manage keys</span></a></div></header>

    <div class="docs-layout">
      <nav class="docs-toc" aria-label="On this page"><p class="docs-toc-h mono">On this page</p>
        ${SECTIONS.map(([id, label]) => html`<a href="#${id}">${label}</a>`)}</nav>

      <article class="prose doc">
        <h2 id="quick-start">Quick start</h2>
        <ol>
          <li>Go to <a href="/settings/api-keys">Settings → API keys</a>.</li>
          <li>Name the key, choose when it expires (7 days to 10 years, a custom date, or never) and tick what it may do. <strong>Full access</strong> covers everything your account can do through the API, including permissions added in the future.</li>
          <li>Copy the key. It starts with <code>cfx_</code> and is shown <strong>once</strong>. Only a hash is stored, so if you lose it, revoke it and make a new one.</li>
        </ol>
        ${pre(`curl ${origin}/api/me/assets \\
  -H "Authorization: Bearer cfx_your_key_here"`)}

        <h2 id="auth">Authentication</h2>
        <p>Send the key on every request, in either header:</p>
        ${pre(`Authorization: Bearer cfx_your_key_here
X-API-Key: cfx_your_key_here`)}
        <ul>
          <li>The base URL is <code>${origin}/api</code>. Requests and responses are JSON. Send <code>Content-Type: application/json</code> with every POST body.</li>
          <li>With a key you don't need cookies or a CSRF token. If a request carries a key, cookies are ignored.</li>
          <li>A missing, wrong, expired or revoked key gets <code>401</code>: <code>{"ok": false, "error": "That API key is invalid, expired or revoked."}</code>. Keys of banned accounts stop working too.</li>
          <li>Keys are never sent to other sites and never appear in URLs. Don't put them in query strings, front-end code or public repositories.</li>
        </ul>

        <h2 id="permissions">Permissions</h2>
        <p>Each key has a set of scopes. A request that needs a scope the key doesn't have gets <code>403</code> with <code>"missing_scope"</code> set to the one it needed.</p>
        <div class="table-wrap"><table class="doc-table">
          <thead><tr><th>Scope</th><th>Allows</th></tr></thead>
          <tbody>
            <tr><td><code>*</code> <strong>Full access</strong></td><td>Every scope below, now and in the future. Moderation is included only while the account is a moderator.</td></tr>
            ${scopes.map((s) => html`<tr><td><code>${s.id}</code><br><strong>${s.name}</strong>${s.adminOnly ? html`<br><span class="dim">Moderators only</span>` : ''}</td><td>${s.description}</td></tr>`)}
          </tbody>
        </table></div>
        <p>Public reads (searching, file pages, profiles, metadata) work with any key. Without <code>assets:read</code> or <code>profile:read</code> they simply answer as if you were logged out.</p>
        ${notice('', html`<strong>Never available to keys</strong>, whatever their scopes: creating, listing or revoking keys, changing your password, connecting or removing Google and TikTok sign-in, and logging in or out. These always need you on the website, so a leaked key can't lock you out or make more keys.`, 'shield')}

        <h2 id="responses">Responses and errors</h2>
        <p>Success: <code>{"ok": true, ...}</code>. Failure: <code>{"ok": false, "error": "Readable message"}</code>, plus <code>"errors": {"field": "message"}</code> for validation problems.</p>
        <div class="table-wrap"><table class="doc-table">
          <thead><tr><th>Status</th><th>Meaning</th></tr></thead>
          <tbody>
            <tr><td><code>200</code> / <code>201</code></td><td>Done / created.</td></tr>
            <tr><td><code>302</code></td><td>Downloads redirect to storage. Follow the <code>Location</code> header (<code>curl -L</code>).</td></tr>
            <tr><td><code>400</code></td><td>Invalid input. See <code>errors</code>.</td></tr>
            <tr><td><code>401</code></td><td>Bad, expired or revoked key.</td></tr>
            <tr><td><code>403</code></td><td>The key lacks a scope (<code>missing_scope</code>), the endpoint isn't open to keys, or a file is password-locked.</td></tr>
            <tr><td><code>404</code></td><td>Not found, or not yours.</td></tr>
            <tr><td><code>410</code></td><td>The file's link expired or ran out of downloads.</td></tr>
            <tr><td><code>413</code></td><td>Over your storage quota.</td></tr>
            <tr><td><code>415</code></td><td>The body wasn't JSON.</td></tr>
            <tr><td><code>429</code></td><td>Too many requests. Wait for the seconds in <code>Retry-After</code>.</td></tr>
          </tbody>
        </table></div>

        <h2 id="account">Your account</h2>
        <div class="endpoints">
          ${ep('GET', '/api/session', 'profile:read', html`Your account: <code>user.username</code>, <code>display_name</code>, <code>email</code>, <code>bio</code>, <code>website</code>, <code>socials</code>, <code>avatar_url</code>, <code>role</code>.`)}
          ${ep('POST', '/api/me/profile', 'profile:write', html`Update your profile. Body: <code>display_name</code>, <code>bio</code>, <code>website</code>, <code>email</code>, <code>socials</code> (an object such as <code>{"youtube": "https://youtube.com/@you"}</code>). Send every field: missing ones are cleared.`)}
          ${ep('POST', '/api/me/avatar', 'profile:write', html`Set your profile photo. Upload a PNG, JPG, WebP or GIF with field <code>avatar</code> (see <a href="#uploading">Uploading</a>), then send <code>{"upload": "&lt;upload id&gt;"}</code>.`)}
          ${ep('POST', '/api/me/avatar/remove', 'profile:write', 'Remove your profile photo.')}
          ${ep('POST', '/api/me/delete', 'account:delete', html`Permanently delete your account and every upload. Body: <code>{"confirm": "your-username", "password": "..."}</code> (password only if your account has one). This can't be undone.`)}
        </div>

        <h2 id="files">Your files</h2>
        <div class="endpoints">
          ${ep('GET', '/api/me/assets?page=1', 'assets:read', html`Everything you uploaded, including unlisted and password-locked files. Returns <code>result.items</code>, <code>result.total</code>, <code>result.pages</code>, plus <code>stats</code>.`)}
          ${ep('GET', '/api/me/storage', 'assets:read', html`Storage used and your quota, in bytes.`)}
          ${ep('GET', '/api/assets/{slug}', 'assets:read', html`One file. With <code>assets:read</code> your own files include owner details (<code>isOwner</code>, <code>canEdit</code>, link settings).`)}
          ${ep('GET', '/api/assets/{slug}/download', 'assets:read', html`Download: a <code>302</code> to a short-lived storage URL. You can always download your own files, even when locked or expired.`)}
          ${ep('POST', '/api/assets', 'assets:write', html`Publish a file from finished uploads. Returns <code>slug</code>, <code>url</code> and <code>shareUrl</code>. See <a href="#fields">File fields</a>.`)}
          ${ep('POST', '/api/assets/{slug}/edit', 'assets:write', html`Edit a file. Takes the same fields as creating it (send them all). To replace the file, the preview or the thumbnail, upload the new one and pass its id in <code>uploads</code>; the share link stays the same.`)}
          ${ep('POST', '/api/assets/{slug}/delete', 'assets:delete', 'Delete a file and its storage. This can\'t be undone.')}
        </div>

        <h2 id="uploading">Uploading a file</h2>
        <p>File bytes go straight to storage, not through the API. It takes three steps:</p>
        <ol>
          <li><strong>Ask for upload tickets</strong> with <code>POST /api/uploads</code> (scope <code>assets:write</code>). Send up to three files, each with a <code>field</code>: <code>file</code> (the download), <code>preview</code> (MP4, WebM, MOV, PNG, JPG, GIF or WebP), <code>thumbnail</code> (PNG, JPG, WebP or GIF), or <code>avatar</code>.</li>
          <li><strong>Send the bytes.</strong> A ticket with <code>"method": "put"</code> has a <code>url</code> and <code>headers</code>: <code>PUT</code> the whole file there with exactly those headers (the URL is signed for them). Big files get <code>"method": "multipart"</code> with <code>parts</code>: <code>PUT</code> each byte range (<code>partSize</code> bytes each) to its <code>url</code>, keep each response's <code>ETag</code>, then call <code>POST /api/uploads/{id}/complete</code> with <code>{"parts": [{"number": 1, "etag": "..."}]}</code>.</li>
          <li><strong>Publish</strong> with <code>POST /api/assets</code>, passing the ticket ids in <code>uploads</code>.</li>
        </ol>
        <p>Unused uploads are deleted after 24 hours. Cancel one early with <code>POST /api/uploads/{id}/abort</code>.</p>
        <h3>curl (bash, needs jq)</h3>
        ${pre(`KEY=cfx_your_key_here
API=${origin}/api
FILE=light-leaks.zip

# 1. Ticket
T=$(curl -s "$API/uploads" -H "Authorization: Bearer $KEY" -H "Content-Type: application/json" \\
  -d "{\\"files\\":[{\\"field\\":\\"file\\",\\"name\\":\\"$FILE\\",\\"size\\":$(wc -c < "$FILE")}]}")
ID=$(echo "$T" | jq -r '.uploads[0].id')
URL=$(echo "$T" | jq -r '.uploads[0].url')

# 2. Bytes (files under the multipart threshold). Send every header from the ticket.
HEADERS=()
while IFS= read -r h; do HEADERS+=(-H "$h"); done < <(echo "$T" | jq -r '.uploads[0].headers | to_entries[] | "\\(.key): \\(.value)"')
curl -s -X PUT "$URL" "\${HEADERS[@]}" --data-binary @"$FILE"

# 3. Publish
curl -s "$API/assets" -H "Authorization: Bearer $KEY" -H "Content-Type: application/json" -d '{
  "title": "Organic Light Leaks", "category": "overlays", "license": "cc0",
  "tags": "light leak, film", "software": ["ae", "pr"], "visibility": "public",
  "rights": true, "uploads": { "file": "'"$ID"'" }
}'`)}
        <h3>JavaScript (Node 18+)</h3>
        ${pre(`import { readFile } from 'node:fs/promises';

const API = '${origin}/api';
const KEY = process.env.CLIPFX_KEY;
const call = async (path, body) => {
  const res = await fetch(API + path, {
    method: body ? 'POST' : 'GET',
    headers: { Authorization: \`Bearer \${KEY}\`, 'Content-Type': 'application/json' },
    body: body && JSON.stringify(body),
  });
  const data = await res.json();
  if (!data.ok) throw new Error(\`\${res.status} \${data.error}\`);
  return data;
};

const name = 'light-leaks.zip';
const bytes = await readFile(name);
const { uploads: [t] } = await call('/uploads', { files: [{ field: 'file', name, size: bytes.length }] });

if (t.method === 'put') {
  await fetch(t.url, { method: 'PUT', headers: t.headers, body: bytes });
} else {
  const parts = [];
  for (const p of t.parts) {
    const start = (p.number - 1) * t.partSize;
    const r = await fetch(p.url, { method: 'PUT', body: bytes.subarray(start, start + p.size) });
    parts.push({ number: p.number, etag: r.headers.get('etag') });
  }
  await call(\`/uploads/\${t.id}/complete\`, { parts });
}

const asset = await call('/assets', {
  title: 'Organic Light Leaks', category: 'overlays', license: 'cc0',
  tags: ['light leak', 'film'], visibility: 'public', rights: true,
  uploads: { file: t.id },
});
console.log(asset.shareUrl);`)}
        <h3>Python</h3>
        ${pre(`import os, requests

API = "${origin}/api"
H = {"Authorization": f"Bearer {os.environ['CLIPFX_KEY']}"}

mine = requests.get(f"{API}/me/assets", headers=H).json()
for a in mine["result"]["items"]:
    print(a["slug"], a["title"], a["downloads"])

# Download one of your files (follows the redirect to storage)
r = requests.get(f"{API}/assets/{mine['result']['items'][0]['slug']}/download", headers=H)
open("download.bin", "wb").write(r.content)`)}

        <h2 id="fields">File fields</h2>
        <div class="table-wrap"><table class="doc-table">
          <thead><tr><th>Field</th><th>Value</th></tr></thead>
          <tbody>
            <tr><td><code>title</code></td><td>3 to 100 characters. Required.</td></tr>
            <tr><td><code>category</code></td><td>Required. One of ${ids(cat.categories)}.</td></tr>
            <tr><td><code>license</code></td><td>Required. One of ${ids(cat.licenses)}. See <a href="/licenses">licenses</a>.</td></tr>
            <tr><td><code>visibility</code></td><td><code>public</code> (listed) or <code>unlisted</code> (only people with the link).</td></tr>
            <tr><td><code>tags</code></td><td>Comma-separated string or an array of strings.</td></tr>
            <tr><td><code>software</code></td><td>Array of ${ids(cat.software)}.</td></tr>
            <tr><td><code>description</code></td><td>Up to 5,000 characters. Links are clickable.</td></tr>
            <tr><td><code>rights</code></td><td><code>true</code>: you confirm you may share it. Required when creating.</td></tr>
            <tr><td><code>uploads</code></td><td><code>{"file": id, "preview": id, "thumbnail": id}</code>. <code>file</code> is required when creating.</td></tr>
            <tr><td><code>password</code></td><td>Lock the file (4+ characters). On edit, <code>"removePassword": true</code> unlocks it.</td></tr>
            <tr><td><code>expiresIn</code></td><td>Minutes until the link stops working (1 to 525,600), or <code>0</code> for never. On edit, <code>"expiry": "keep"</code> leaves it as it is.</td></tr>
            <tr><td><code>maxDownloads</code></td><td>Stop after this many downloads (1 to 1,000,000), or empty for no limit.</td></tr>
          </tbody>
        </table></div>
        <p>Accepted file types and size limits are in <a href="/api/meta"><code>/api/meta</code></a> (<code>catalog.fileTypes</code>${limits.maxUpload ? html`, files up to ${formatBytes(limits.maxUpload)}` : ''}). Software (<code>.exe</code>, <code>.dmg</code> and so on) goes in <code>software</code>.</p>

        <h2 id="saved">Saved files</h2>
        <div class="endpoints">
          ${ep('GET', '/api/me/saved?page=1', 'saved:read', html`Files you saved, newest first, in <code>result.items</code>.`)}
          ${ep('POST', '/api/assets/{slug}/save', 'saved:write', html`Toggle: saves the file, or unsaves it if already saved. Returns <code>{"saved": true|false, "count": n}</code>.`)}
        </div>

        <h2 id="locked">Password-locked files</h2>
        <p>Someone else's locked file needs its password before it can be downloaded. Browsers keep the unlock in a cookie; with a key you get a token back instead:</p>
        ${pre(`curl -s ${origin}/api/assets/SLUG/unlock -H "Authorization: Bearer $KEY" \\
  -H "Content-Type: application/json" -d '{"password":"the password"}'
# → {"ok": true, "unlock_token": "..."}

curl -L ${origin}/api/assets/SLUG/download -H "Authorization: Bearer $KEY" \\
  -H "X-Unlock-Token: <unlock_token>" -o file`)}
        <p>Unlocking needs no scope. Your own files never need unlocking.</p>

        <h2 id="reports">Reports</h2>
        <div class="endpoints">
          ${ep('POST', '/api/assets/{slug}/report', 'reports:write', html`Report a file. Body: <code>reason</code> (one of ${REPORT_REASONS.map((r, i) => html`${i ? ', ' : ''}<code>${r}</code>`)}), <code>details</code>, <code>contact</code>. Copyright claims need details of 20+ characters and a contact.`)}
        </div>

        <h2 id="moderation">Moderation</h2>
        <p>Scope <code>admin</code>, for moderator accounts only. These match the buttons on the moderation page.</p>
        <div class="endpoints">
          ${ep('GET', '/api/admin?tab=reports|assets|removed|users&q=&page=', 'admin', 'The moderation queue, all files, removed files or users.')}
          ${ep('POST', '/api/admin/reports/{id}/dismiss', 'admin', 'Close a report without action.')}
          ${ep('POST', '/api/admin/reports/{id}/remove', 'admin', html`Remove the reported file. Body: <code>reason</code>, <code>block</code> (also block re-uploads of the same file).`)}
          ${ep('POST', '/api/admin/assets/{id}/remove | restore | purge', 'admin', 'Remove, restore, or permanently delete a file.')}
          ${ep('POST', '/api/admin/users/{id}/ban | role | reset', 'admin', 'Ban or unban, toggle moderator, or create a password reset link.')}
        </div>

        <h2 id="public">Public endpoints</h2>
        <p>These need no key at all. See <a href="/developers">API and AI access</a>.</p>
        <div class="endpoints">
          ${ep('GET', '/api/assets?q=&category=&software=&license=&kind=&sort=new|trending|downloads&page=', null, 'Search public files, 24 per page.')}
          ${ep('GET', '/api/users/{username}', null, 'A creator\'s profile and public uploads.')}
          ${ep('GET', '/api/meta', null, 'Categories, software, licenses, file types, limits and API scopes.')}
        </div>

        <h2 id="limits">Limits and safety</h2>
        <ul>
          <li>Up to 25 keys per account. Keys last up to 10 years, or never expire if you choose.</li>
          <li>Keys share the same rate limits as the website (for example 120 upload tickets and 60 new files an hour). Back off when you see <code>429</code>.</li>
          <li>Storage quota and file size limits are the same as on the website.</li>
          <li>The key list shows when each key was last used. Revoke anything you don't recognise: it stops working instantly.</li>
          <li>Give each script its own key with only the scopes it needs, and an expiry. Store keys in environment variables or a secret manager.</li>
        </ul>
      </article>
    </div>
  </div>`;
  return layout(ctx, {
    title: 'API keys',
    description: `Use your ${ctx.config.siteName} account from scripts and apps: personal API keys with permissions and expiry.`,
    body, og: { url: ctx.absolute('/developers/api') },
  });
}

// /developers/mcp: connecting AI agents to the MCP server at /mcp. The tool table comes from the
// server's own definitions.
function mcpDocs(ctx) {
  const { TOOLS } = require('../src/mcp');
  const url = ctx.absolute('/mcp');
  const pre = (s) => html`<pre class="code">${s}</pre>`;
  const pub = TOOLS.filter((t) => !t.scope);
  const acct = TOOLS.filter((t) => t.scope);
  const row = (t) => html`<tr><td><code>${t.name}</code></td><td>${t.description}</td><td>${t.scope && t.scope !== 'any' ? html`<code>${t.scope}</code>` : html`<span class="dim">any</span>`}</td></tr>`;
  const sections = [['connect', 'Connect'], ['clients', 'Client setup'], ['auth', 'API keys instead'], ['tools', 'Tools'], ['uploads', 'Uploading from an agent'], ['protocol', 'Protocol details']];
  const body = html`
  <div class="container docs">
    <nav class="crumbs" aria-label="Breadcrumb"><a href="/developers">API and AI access</a>${icon('chevronRight')}<span>MCP server</span></nav>
    <header class="pagehead doc-head"><div>
      <h1>MCP server</h1>
      <p class="lede">Connect Claude, ChatGPT, Cursor, VS Code and other AI agents to your ${ctx.config.siteName} account with the Model Context Protocol. Sign in once, choose what the agent may do, and it can search, download, upload and manage your files.</p>
    </div>
    <a class="btn btn-secondary btn-sm" href="${ctx.user ? '/settings/api-keys' : '/login?next=/settings/api-keys'}">${icon('key')}<span>Connected apps and keys</span></a></header>

    <div class="docs-layout">
      <nav class="docs-toc" aria-label="On this page"><p class="docs-toc-h mono">On this page</p>
        ${sections.map(([id, label]) => html`<a href="#${id}">${label}</a>`)}</nav>
      <article class="prose doc">
        <h2 id="connect">Connect</h2>
        <p>Server URL:</p>
        <div class="newkey-row"><code class="newkey-token" data-select-on-focus tabindex="0">${url}</code>
          <button type="button" class="btn btn-secondary btn-sm" data-copy="${url}">${icon('copy')}<span>Copy</span></button></div>
        <p><strong>Sign-in is required.</strong> When you add the server, your app opens a ClipFX page where you log in, choose what the agent may do and how long it stays connected, then press Allow. Nothing works without that (or an API key), and you can disconnect the app any time under <a href="/settings/api-keys">Settings → API keys</a>.</p>

        <h2 id="clients">Client setup</h2>
        <h3><img class="client-logo" src="/static/img/apps/claude.svg" alt="" width="18" height="18">Claude (claude.ai, desktop and mobile)</h3>
        <p>Settings → Connectors → Add custom connector. Name it ClipFX, paste <code>${url}</code>, then press Connect and sign in.</p>
        <h3><img class="client-logo" src="/static/img/apps/claude.svg" alt="" width="18" height="18">Claude Code</h3>
        ${pre(`claude mcp add --transport http clipfx ${url}`)}
        <p>Then run <code>/mcp</code> in Claude Code, pick clipfx and choose Authenticate.</p>
        <h3>ChatGPT</h3>
        <p>Settings → Connectors → Create (developer mode), paste <code>${url}</code> and choose OAuth. Sign in when asked.</p>
        <h3>Cursor (<code>~/.cursor/mcp.json</code>)</h3>
        ${pre(`{
  "mcpServers": {
    "clipfx": { "url": "${url}" }
  }
}`)}
        <p>Cursor shows a Login button next to the server in Settings → MCP.</p>
        <h3>VS Code (<code>.vscode/mcp.json</code>)</h3>
        ${pre(`{
  "servers": {
    "clipfx": { "type": "http", "url": "${url}" }
  }
}`)}
        <p>Start the server and VS Code asks you to sign in.</p>
        <h3>Other clients</h3>
        <p>Any client that supports remote MCP servers with OAuth (Streamable HTTP) works with just the URL. Clients that only use stdio can go through <code>npx -y mcp-remote ${url}</code>, which handles the sign-in.</p>

        <h2 id="auth">API keys instead of sign-in</h2>
        <p>For scripts, servers and the model APIs, where nobody can click Allow, send an <a href="/developers/api">API key</a> from <a href="/settings/api-keys">Settings → API keys</a> as <code>Authorization: Bearer cfx_...</code>.</p>
        ${pre(`claude mcp add --transport http clipfx ${url} --header "Authorization: Bearer cfx_your_key_here"

// Anthropic Messages API (MCP connector)
"mcp_servers": [{ "type": "url", "url": "${url}", "name": "clipfx", "authorization_token": "cfx_your_key_here" }]

// OpenAI Responses API
"tools": [{ "type": "mcp", "server_label": "clipfx", "server_url": "${url}",
            "headers": { "Authorization": "Bearer cfx_your_key_here" }, "require_approval": "always" }]`)}
        <p>Give each agent its own key (or connection) with only the permissions it needs, for example <code>assets:read</code> and <code>assets:write</code> to upload, without <code>assets:delete</code>.</p>
        ${notice('', html`Agents act with your account. Many clients ask before each tool call; keep that on for <code>publish_file</code>, <code>delete_file</code> and <code>report_file</code>.`, 'shield')}

        <h2 id="tools">Tools</h2>
        <h3>The library</h3>
        <div class="table-wrap"><table class="doc-table"><thead><tr><th>Tool</th><th>What it does</th><th>Permission</th></tr></thead><tbody>${pub.map(row)}</tbody></table></div>
        <h3>Your account</h3>
        <div class="table-wrap"><table class="doc-table"><thead><tr><th>Tool</th><th>What it does</th><th>Permission</th></tr></thead><tbody>${acct.map(row)}</tbody></table></div>
        <p>All tools need a signed-in connection; the permission column is what the connection must also allow. Every tool has an input schema, read-only and destructive hints, and returns both JSON text and <code>structuredContent</code>. Moderation and account deletion are left out of MCP on purpose; use the <a href="/developers/api">REST API</a> for those.</p>

        <h2 id="uploads">Uploading from an agent</h2>
        <ol>
          <li><strong>Small files</strong> (up to 3 MB): <code>upload_small_file</code> with the file as base64. It returns an <code>upload_id</code>.</li>
          <li><strong>Any size</strong>: <code>start_upload</code> returns a URL to <code>PUT</code> the bytes to (or several parts, then <code>complete_upload</code>). Use it when the agent can run code or HTTP requests itself.</li>
          <li><code>publish_file</code> with the <code>upload_id</code>, a title, category and license. It needs <code>confirm_rights: true</code>, which the agent should only send after you confirm you may share the file.</li>
        </ol>
        <p>Example request to an agent: <em>"Upload whoosh-pack.zip to ClipFX as 'Deep Whoosh Pack', category Sound Effects, CC0, tags whoosh and transition. I made it."</em></p>

        <h2 id="protocol">Protocol details</h2>
        <ul>
          <li>Transport: Streamable HTTP, <code>POST ${url}</code>, JSON responses. Stateless: no session id, no server-sent events (<code>GET</code> answers 405).</li>
          <li>Protocol versions: ${raw(require('../src/mcp').PROTOCOL_VERSIONS.map((v) => `<code>${v}</code>`).join(', '))}. Capabilities: tools.</li>
          <li>Authorization (MCP spec): requests without a valid token get <code>401</code> with <code>WWW-Authenticate: Bearer resource_metadata="${ctx.absolute('/.well-known/oauth-protected-resource/mcp')}"</code>. The authorization server metadata is at <code>/.well-known/oauth-authorization-server</code>: OAuth 2.1 authorization code flow, PKCE (S256) required, dynamic client registration at <code>/oauth/register</code>, public clients only. The access token is an API key scoped to what the user approved.</li>
          <li>CORS is open (<code>*</code>): the server uses bearer tokens, not cookies, so browser-based clients and the MCP Inspector work.</li>
          <li>Same rate limits and rules as the website and REST API. Respect each file's license when using what you download.</li>
        </ul>
      </article>
    </div>
  </div>`;
  return layout(ctx, {
    title: 'MCP server',
    description: `Connect AI agents to ${ctx.config.siteName} with the Model Context Protocol at ${url}.`,
    body, og: { url: ctx.absolute('/developers/mcp') },
  });
}

module.exports = { apiDocs, mcpDocs };
