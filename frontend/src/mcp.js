'use strict';
// MCP server for AI agents at /mcp (Streamable HTTP, stateless, JSON responses).
// Every tool is a thin wrapper over the public API, called with the agent's own API key, so
// permissions, validation and rate limits are exactly the ones the API already enforces.
// Sign-in is required for every request: an OAuth token from "Sign in with ClipFX" (see oauth.js)
// or an API key, both sent as a Bearer token. Cookies are never used here.

const express = require('express');

const PROTOCOL_VERSIONS = ['2025-11-25', '2025-06-18', '2025-03-26', '2024-11-05'];
const SERVER_VERSION = '1.0.0';
const MAX_INLINE_UPLOAD = 3 * 1024 * 1024; // Vercel caps request bodies at 4.5 MB; base64 adds a third.

const tokenFrom = (req) => {
  const auth = req.get('authorization');
  if (auth && /^bearer\s+/i.test(auth)) return auth.replace(/^bearer\s+/i, '').trim();
  const h = req.get('x-api-key');
  return h ? h.trim() : null;
};

class ToolError extends Error {}

// ---- Tool definitions -------------------------------------------------------------------

const str = (description, extra = {}) => ({ type: 'string', description, ...extra });
const int = (description, extra = {}) => ({ type: 'integer', description, ...extra });
const obj = (properties, required = []) => ({ type: 'object', properties, required, additionalProperties: false });
const SLUG = str('The file\'s slug: the part after /a/ in its link, e.g. "Ab3dEf9h".');
const READ = { readOnlyHint: true, openWorldHint: false };
const WRITE = { readOnlyHint: false, destructiveHint: false, openWorldHint: false };

const FILE_FIELDS = {
  title: str('3 to 100 characters.'),
  category: str('Category id. Call list_categories for the ids.'),
  license: str('License id, e.g. "cc0", "free", "cc-by". Call list_categories for all of them.'),
  description: str('Up to 5,000 characters. Plain text; links become clickable.'),
  tags: { type: 'array', items: { type: 'string' }, description: 'Search tags, e.g. ["light leak", "film"].' },
  software: { type: 'array', items: { type: 'string' }, description: 'Software ids it works with, e.g. ["ae", "pr", "resolve"].' },
  visibility: str('"public" (listed and searchable) or "unlisted" (only people with the link).', { enum: ['public', 'unlisted'] }),
  password: str('Lock the file behind this password (4+ characters). Locked, expiring or download-limited files are private shares: they work by link but stay out of search.'),
  expires_in_minutes: int('Make the link stop working after this many minutes (1 to 525600). 0 means never.', { minimum: 0, maximum: 525600 }),
  max_downloads: int('Stop allowing downloads after this many (1 to 1,000,000). 0 removes the limit.', { minimum: 0, maximum: 1000000 }),
};

const TOOLS = [
  // Library: any signed-in account.
  {
    name: 'search_files', title: 'Search files', scope: null, annotations: READ,
    description: 'Search the ClipFX library of free video editing resources: stock footage, transitions, LUTs, overlays, templates, presets, sound effects, music, textures, 3D assets and software. Returns 24 results per page.',
    inputSchema: obj({
      query: str('Words to search for, e.g. "film grain" or "whoosh".'),
      category: str('Only this category id (see list_categories).'),
      software: str('Only files that work with this software id, e.g. "ae".'),
      license: str('Only this license id, e.g. "cc0".'),
      kind: str('Only this file kind: video, audio, image, lut, project, preset, model, font, archive, document or software.'),
      sort: str('"new" (default), "trending" or "downloads".', { enum: ['new', 'trending', 'downloads'] }),
      page: int('Page number, from 1.', { minimum: 1 }),
    }),
  },
  {
    name: 'get_file', title: 'Get file details', scope: null, annotations: READ,
    description: 'Everything about one file: title, description, tags, category, license terms, format, size, resolution, duration, creator and links. With an API key that has assets:read, your own files also show their link settings.',
    inputSchema: obj({ slug: SLUG }, ['slug']),
  },
  {
    name: 'get_download_link', title: 'Get a download link', scope: null, annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
    description: 'A short-lived direct download URL for a file. Counts as one download. Password-locked files need unlock_file first.',
    inputSchema: obj({ slug: SLUG, unlock_token: str('From unlock_file, for someone else\'s password-locked file.') }, ['slug']),
  },
  {
    name: 'get_creator', title: 'Get a creator', scope: null, annotations: READ,
    description: 'A creator\'s public profile, social links, totals and public uploads.',
    inputSchema: obj({ username: str('Their username, without @.'), page: int('Page of uploads, from 1.', { minimum: 1 }) }, ['username']),
  },
  {
    name: 'list_categories', title: 'List categories, licenses and formats', scope: null, annotations: READ,
    description: 'The ids you need for other tools: categories, supported software, licenses (with what each allows), accepted file extensions by kind, and size limits.',
    inputSchema: obj({}),
  },
  // Account: need an API key.
  {
    name: 'whoami', title: 'Who am I', scope: 'profile:read', annotations: READ,
    description: 'The signed-in ClipFX account: username, display name, email, bio, website, social links and role.',
    inputSchema: obj({}),
  },
  {
    name: 'list_my_files', title: 'List my files', scope: 'assets:read', annotations: READ,
    description: 'Every file you uploaded, including unlisted and password-locked ones, with their link settings, plus your totals and storage use. 30 per page.',
    inputSchema: obj({ page: int('Page number, from 1.', { minimum: 1 }) }),
  },
  {
    name: 'upload_small_file', title: 'Upload a small file', scope: 'assets:write', annotations: WRITE,
    description: `Upload a file of up to ${MAX_INLINE_UPLOAD / 1024 / 1024} MB from base64 content. Returns an upload_id to pass to publish_file or edit_file. For bigger files use start_upload.`,
    inputSchema: obj({
      file_name: str('File name with extension, e.g. "whoosh-pack.zip". The extension decides the file type.'),
      content_base64: str('The file\'s bytes, base64 encoded.'),
      field: str('"file" (the download, default), "preview" (MP4, WebM, MOV, PNG, JPG, GIF, WebP) or "thumbnail" (PNG, JPG, WebP, GIF).', { enum: ['file', 'preview', 'thumbnail'] }),
    }, ['file_name', 'content_base64']),
  },
  {
    name: 'start_upload', title: 'Start a large upload', scope: 'assets:write', annotations: WRITE,
    description: 'For files of any size: returns where to PUT the bytes. Single uploads give one url and headers; big files are split into parts, each PUT to its own url, then finished with complete_upload. Use when your environment can make HTTP requests itself.',
    inputSchema: obj({
      file_name: str('File name with extension.'),
      size: int('Exact size in bytes.', { minimum: 1 }),
      field: str('"file" (default), "preview" or "thumbnail".', { enum: ['file', 'preview', 'thumbnail'] }),
    }, ['file_name', 'size']),
  },
  {
    name: 'complete_upload', title: 'Finish a multipart upload', scope: 'assets:write', annotations: WRITE,
    description: 'Finish an upload that start_upload split into parts, with the ETag each part PUT returned.',
    inputSchema: obj({
      upload_id: str('The id from start_upload.'),
      parts: { type: 'array', items: obj({ number: int('Part number.'), etag: str('ETag header from that part\'s PUT.') }, ['number', 'etag']) },
    }, ['upload_id', 'parts']),
  },
  {
    name: 'publish_file', title: 'Publish a file', scope: 'assets:write', annotations: WRITE,
    description: 'Publish an uploaded file on ClipFX and get its share link. Set confirm_rights to true only if the user made it or may share it (no paid, leaked or ripped content).',
    inputSchema: obj({
      upload_id: str('The upload_id of the main file.'),
      preview_upload_id: str('Optional preview clip or image upload_id.'),
      thumbnail_upload_id: str('Optional thumbnail upload_id.'),
      confirm_rights: { type: 'boolean', description: 'The user confirms they have the right to share this file.' },
      ...FILE_FIELDS,
    }, ['upload_id', 'title', 'category', 'license', 'confirm_rights']),
  },
  {
    name: 'edit_file', title: 'Edit a file', scope: 'assets:write', annotations: { ...WRITE, idempotentHint: true },
    description: 'Change any of your file\'s details or link settings. Only the fields you pass change. Pass upload_id to replace the file itself; the share link stays the same.',
    inputSchema: obj({
      slug: SLUG,
      upload_id: str('Replace the main file with this upload.'),
      preview_upload_id: str('Replace the preview.'),
      thumbnail_upload_id: str('Replace the thumbnail.'),
      remove_password: { type: 'boolean', description: 'Unlock the file.' },
      ...FILE_FIELDS,
    }, ['slug']),
  },
  {
    name: 'delete_file', title: 'Delete a file', scope: 'assets:delete', annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: false },
    description: 'Permanently delete one of your files. Its link stops working. This can\'t be undone, so confirm with the user first.',
    inputSchema: obj({ slug: SLUG }, ['slug']),
  },
  {
    name: 'list_saved', title: 'List saved files', scope: 'saved:read', annotations: READ,
    description: 'Files you saved, newest first.',
    inputSchema: obj({ page: int('Page number, from 1.', { minimum: 1 }) }),
  },
  {
    name: 'toggle_save', title: 'Save or unsave a file', scope: 'saved:write', annotations: WRITE,
    description: 'Save a file to your saved list, or remove it if it\'s already saved. Returns whether it is now saved.',
    inputSchema: obj({ slug: SLUG }, ['slug']),
  },
  {
    name: 'update_profile', title: 'Update profile', scope: 'profile:write', annotations: { ...WRITE, idempotentHint: true },
    description: 'Change your display name, bio, website, email or social links. Only the fields you pass change. Also needs profile:read to keep the others.',
    inputSchema: obj({
      display_name: str('Up to 50 characters.'),
      bio: str('Up to 500 characters.'),
      website: str('A URL.'),
      email: str('Your email, or "" to remove it.'),
      socials: { type: 'object', additionalProperties: { type: 'string' }, description: 'Profile links by platform, e.g. {"youtube": "https://youtube.com/@you"}. Use "" to remove one.' },
    }),
  },
  {
    name: 'unlock_file', title: 'Unlock a password-locked file', scope: 'any', annotations: { ...READ, readOnlyHint: false },
    description: 'Unlock someone else\'s password-locked file. Returns an unlock_token for get_download_link. Works with any API key.',
    inputSchema: obj({ slug: SLUG, password: str('The file\'s password.') }, ['slug', 'password']),
  },
  {
    name: 'report_file', title: 'Report a file', scope: 'reports:write', annotations: WRITE,
    description: 'Report a file that breaks the rules to the moderators.',
    inputSchema: obj({
      slug: SLUG,
      reason: str('Why.', { enum: ['copyright', 'stolen', 'malware', 'inappropriate', 'broken', 'spam', 'other'] }),
      details: str('What\'s wrong. Copyright claims need 20+ characters describing the original work.'),
      contact: str('How to reach the reporter. Required for copyright claims.'),
    }, ['slug', 'reason']),
  },
  // Discord: uses a server-side bot token configured in Vercel. Never accept bot tokens from tool arguments.
  {
    name: 'discord_list_servers', title: 'List Discord servers', scope: null, annotations: READ,
    description: 'List Discord servers accessible to the configured ClipFX Discord bot.',
    inputSchema: obj({}),
  },
  {
    name: 'discord_list_channels', title: 'List Discord channels', scope: null, annotations: READ,
    description: 'List channels in a Discord server the configured bot can access.',
    inputSchema: obj({ guild_id: str('Discord server (guild) ID.') }, ['guild_id']),
  },
  {
    name: 'discord_read_messages', title: 'Read Discord messages', scope: null, annotations: READ,
    description: 'Read recent messages in a Discord channel. The bot must have View Channel and Read Message History. Message content access may require the Message Content privileged intent.',
    inputSchema: obj({ channel_id: str('Discord channel ID.'), limit: int('Number of messages, 1–100; defaults to 25.', { minimum: 1, maximum: 100 }) }, ['channel_id']),
  },
  {
    name: 'discord_send_message', title: 'Send a Discord message', scope: null, annotations: WRITE,
    description: 'Send a message to a Discord channel accessible to the configured bot. Confirm with the user before sending.',
    inputSchema: obj({ channel_id: str('Discord channel ID.'), content: str('Message text, 1–2000 characters.', { minLength: 1, maxLength: 2000 }) }, ['channel_id', 'content']),
  },
  {
    name: 'discord_get_server_info', title: 'Get Discord server information', scope: null, annotations: READ,
    description: 'Get basic information and member counts for a Discord server accessible to the bot.',
    inputSchema: obj({ guild_id: str('Discord server (guild) ID.') }, ['guild_id']),
  },
];
const TOOL_MAP = Object.fromEntries(TOOLS.map((t) => [t.name, t]));

// ---- Shaping API data for agents --------------------------------------------------------

function createMcp({ backend, config, log = console }) {
  const origin = (req) => config.publicUrl || `${req.protocol}://${req.get('host')}`;

  const compactFile = (a, o) => a && ({
    slug: a.slug, title: a.title, url: `${o}/a/${a.slug}`, category: a.category, license: a.license,
    kind: a.file_kind, format: a.file_ext, size_bytes: a.file_size, tags: a.tags,
    ...(a.duration ? { duration_seconds: a.duration } : {}), ...(a.width ? { resolution: `${a.width}x${a.height}` } : {}),
    downloads: a.downloads, creator: a.anonymous ? null : a.username, created_at: new Date(a.created_at).toISOString(),
    ...(a.locked ? { locked: true } : {}),
  });
  const ownFile = (a, o) => ({
    ...compactFile(a, o), visibility: a.visibility, status: a.status,
    expires_at: a.expires_at ? new Date(a.expires_at).toISOString() : null, max_downloads: a.max_downloads || null, expired: a.expired || null,
  });
  const page = (r, map) => ({ page: r.page, pages: r.pages, total: r.total, items: r.items.map(map) });

  // One API call on the agent's behalf, with errors turned into messages an agent can act on.
  async function call(ctx, method, path, body, extra) {
    const r = await backend.callAs(ctx.req, method, path, body, ctx.token, extra);
    if (r.status >= 200 && r.status < 400) return r;
    const d = r.data || {};
    const keysUrl = `${ctx.origin}/settings/api-keys`;
    if (r.status === 401) throw new ToolError(`The connection to ClipFX expired or was revoked. Reconnect the ClipFX server in your app to sign in again (or create a new key at ${keysUrl}).`);
    if (r.status === 403 && d.missing_scope) throw new ToolError(`This connection doesn't have the "${d.missing_scope}" permission. Reconnect ClipFX and tick it on the sign-in screen (or create a key with it at ${keysUrl}).`);
    const fields = d.errors ? ` ${Object.entries(d.errors).map(([k, v]) => `${k}: ${v}`).join('; ')}` : '';
    throw new ToolError(`${d.error || `Request failed (${r.status}).`}${fields && !fields.includes(d.error) ? fields : ''}`);
  }

  const slugPath = (slug) => `/api/assets/${encodeURIComponent(String(slug || '').trim())}`;
  const linkFields = (a, body) => {
    if (a.password) body.password = a.password;
    if (a.expires_in_minutes !== undefined) {
      if (a.expires_in_minutes > 0) { body.expiry = 'after'; body.expiresIn = a.expires_in_minutes; } else { body.expiry = 'never'; body.expiresIn = 0; }
    }
    if (a.max_downloads !== undefined) body.maxDownloads = a.max_downloads > 0 ? a.max_downloads : '';
    return body;
  };
  const uploadsFrom = (a) => Object.fromEntries([['file', a.upload_id], ['preview', a.preview_upload_id], ['thumbnail', a.thumbnail_upload_id]].filter(([, v]) => v));

  const HANDLERS = {
    async search_files(a, ctx) {
      const qs = new URLSearchParams();
      for (const [k, v] of [['q', a.query], ['category', a.category], ['software', a.software], ['license', a.license], ['kind', a.kind], ['sort', a.sort], ['page', a.page]]) if (v) qs.set(k, v);
      const r = await call(ctx, 'GET', `/api/assets?${qs}`);
      return page(r.data.result, (x) => compactFile(x, ctx.origin));
    },
    async get_file(a, ctx) {
      const { asset: x } = (await call(ctx, 'GET', slugPath(a.slug))).data;
      return {
        ...(x.isOwner ? ownFile(x, ctx.origin) : compactFile(x, ctx.origin)),
        description: x.description, software: x.software, file_name: x.file_name, views: x.views, saves: x.favorites,
        creator_name: x.anonymous ? 'Anonymous' : x.display_name, updated_at: new Date(x.updated_at).toISOString(),
        download_page: `${ctx.origin}/a/${x.slug}`, ...(x.sha256 ? { sha256: x.sha256 } : {}), is_owner: !!x.isOwner,
        ...(x.locked && !x.unlocked ? { note: 'Password-locked: use unlock_file before get_download_link.' } : {}),
      };
    },
    async get_download_link(a, ctx) {
      const r = await call(ctx, 'GET', `${slugPath(a.slug)}/download`, undefined, a.unlock_token ? { 'x-unlock-token': a.unlock_token } : {});
      if (!r.location) throw new ToolError('No download link came back.');
      return { url: /^https?:/.test(r.location) ? r.location : ctx.origin + r.location, note: 'Short-lived link to the file. Respect its license.' };
    },
    async get_creator(a, ctx) {
      const d = (await call(ctx, 'GET', `/api/users/${encodeURIComponent(a.username.replace(/^@/, ''))}${a.page ? `?page=${a.page}` : ''}`)).data;
      const p = d.profile;
      return {
        username: p.username, display_name: p.display_name, bio: p.bio, website: p.website, socials: p.socials,
        profile_url: `${ctx.origin}/u/${p.username}`, joined: new Date(p.created_at).toISOString(), uploads: d.stats.uploads, downloads: d.stats.downloads,
        files: page(d.result, (x) => compactFile(x, ctx.origin)),
      };
    },
    async list_categories(a, ctx) {
      const m = (await call(ctx, 'GET', '/api/meta')).data;
      const byKind = {};
      for (const [ext, kind] of Object.entries(m.catalog.fileTypes)) (byKind[kind] = byKind[kind] || []).push(ext);
      return {
        categories: m.catalog.categories.map((c) => ({ id: c.id, name: c.name, description: c.blurb })),
        software: m.catalog.software.map((s) => ({ id: s.id, name: s.name })),
        licenses: m.catalog.licenses.map((l) => ({ id: l.id, name: l.name, commercial_use: l.commercial, credit_required: l.attribution, summary: l.summary })),
        file_extensions_by_kind: byKind,
        limits: { max_upload_bytes: m.config.maxUpload, max_preview_bytes: m.config.maxPreview, storage_quota_bytes: m.config.userQuota, inline_upload_bytes: MAX_INLINE_UPLOAD },
      };
    },
    async whoami(a, ctx) {
      const { user } = (await call(ctx, 'GET', '/api/session')).data;
      if (!user) throw new ToolError('This connection doesn\'t have the "profile:read" permission. Reconnect ClipFX and tick "Read your profile".');
      return { username: user.username, display_name: user.display_name, email: user.email || null, bio: user.bio, website: user.website, socials: user.socials, role: user.role, profile_url: `${ctx.origin}/u/${user.username}` };
    },
    async list_my_files(a, ctx) {
      const d = (await call(ctx, 'GET', `/api/me/assets${a.page ? `?page=${a.page}` : ''}`)).data;
      return { totals: d.stats, storage: { used_bytes: d.used, quota_bytes: d.quota }, files: page(d.result, (x) => ownFile(x, ctx.origin)) };
    },
    async upload_small_file(a, ctx) {
      const bytes = Buffer.from(String(a.content_base64 || '').replace(/^data:[^,]*,/, ''), 'base64');
      if (!bytes.length) throw new ToolError('content_base64 is empty or not valid base64.');
      if (bytes.length > MAX_INLINE_UPLOAD) throw new ToolError(`That's ${bytes.length} bytes. upload_small_file takes up to ${MAX_INLINE_UPLOAD} bytes; use start_upload for bigger files.`);
      const field = a.field || 'file';
      const t = (await call(ctx, 'POST', '/api/uploads', { files: [{ field, name: a.file_name, size: bytes.length }] })).data.uploads[0];
      const url = t.method === 'put' ? t.url : null;
      if (!url) throw new ToolError('This file needs a multipart upload. Use start_upload instead.');
      const target = url.startsWith('/') ? backend.base + url : url;
      const put = await fetch(target, { method: 'PUT', headers: t.headers, body: bytes });
      if (!put.ok) throw new ToolError(`Storage refused the file (${put.status}). Try again.`);
      return { upload_id: t.id, field, size_bytes: bytes.length, next: field === 'file' ? 'Call publish_file with this upload_id.' : `Pass it as ${field}_upload_id to publish_file or edit_file.` };
    },
    async start_upload(a, ctx) {
      const field = a.field || 'file';
      const t = (await call(ctx, 'POST', '/api/uploads', { files: [{ field, name: a.file_name, size: a.size }] })).data.uploads[0];
      const abs = (u) => (u.startsWith('/') ? ctx.origin + u : u);
      if (t.method === 'put') {
        return { upload_id: t.id, method: 'put', url: abs(t.url), headers: t.headers, next: 'PUT the whole file to url with exactly these headers, then use upload_id with publish_file.' };
      }
      return {
        upload_id: t.id, method: 'multipart', part_size: t.partSize, parts: t.parts.map((p) => ({ number: p.number, size: p.size, url: abs(p.url) })),
        next: 'PUT each byte range (part_size bytes, the last may be shorter) to its url, keep each response\'s ETag header, then call complete_upload.',
      };
    },
    async complete_upload(a, ctx) {
      await call(ctx, 'POST', `/api/uploads/${encodeURIComponent(a.upload_id)}/complete`, { parts: a.parts });
      return { upload_id: a.upload_id, complete: true, next: 'Use this upload_id with publish_file or edit_file.' };
    },
    async publish_file(a, ctx) {
      if (a.confirm_rights !== true) throw new ToolError('Set confirm_rights to true only once the user confirms they made the file or may share it.');
      const body = linkFields(a, {
        title: a.title, category: a.category, license: a.license, description: a.description || '', tags: a.tags || [],
        software: a.software || [], visibility: a.visibility || 'public', rights: true, uploads: uploadsFrom(a),
      });
      const d = (await call(ctx, 'POST', '/api/assets', body)).data;
      return { slug: d.slug, url: d.shareUrl || `${ctx.origin}${d.url}`, note: 'Published. Previews and thumbnails may take a minute to process.' };
    },
    async edit_file(a, ctx) {
      const { asset: x } = (await call(ctx, 'GET', slugPath(a.slug))).data;
      if (!x.canEdit) throw new ToolError('You can only edit your own files (the API key needs assets:read to look them up).');
      const pick = (k, cur) => (a[k] !== undefined ? a[k] : cur);
      const body = linkFields(a, {
        title: pick('title', x.title), category: pick('category', x.category), license: pick('license', x.license),
        description: pick('description', x.description), tags: pick('tags', x.tags), software: pick('software', x.software),
        visibility: pick('visibility', x.visibility), uploads: uploadsFrom(a), expiry: 'keep',
      });
      if (a.expires_in_minutes !== undefined) body.expiry = a.expires_in_minutes > 0 ? 'after' : 'never';
      if (a.remove_password) body.removePassword = true;
      const d = (await call(ctx, 'POST', `${slugPath(a.slug)}/edit`, body)).data;
      return { slug: x.slug, url: `${ctx.origin}/a/${x.slug}`, message: d.message };
    },
    async delete_file(a, ctx) {
      const d = (await call(ctx, 'POST', `${slugPath(a.slug)}/delete`, {})).data;
      return { deleted: true, message: d.message };
    },
    async list_saved(a, ctx) {
      const d = (await call(ctx, 'GET', `/api/me/saved${a.page ? `?page=${a.page}` : ''}`)).data;
      return page(d.result, (x) => compactFile(x, ctx.origin));
    },
    async toggle_save(a, ctx) {
      const d = (await call(ctx, 'POST', `${slugPath(a.slug)}/save`, {})).data;
      return { saved: d.saved, saves: d.count };
    },
    async update_profile(a, ctx) {
      const { user } = (await call(ctx, 'GET', '/api/session')).data;
      if (!user) throw new ToolError('update_profile also needs the "profile:read" permission, so it can keep the fields you didn\'t change.');
      const socials = { ...(user.socials || {}), ...(a.socials || {}) };
      for (const [k, v] of Object.entries(socials)) if (!v) delete socials[k];
      const body = {
        display_name: a.display_name ?? user.display_name, bio: a.bio ?? user.bio, website: a.website ?? user.website,
        email: a.email ?? user.email ?? '', socials,
      };
      const d = (await call(ctx, 'POST', '/api/me/profile', body)).data;
      return { message: d.message || 'Profile saved.', profile_url: `${ctx.origin}/u/${user.username}` };
    },
    async unlock_file(a, ctx) {
      const d = (await call(ctx, 'POST', `${slugPath(a.slug)}/unlock`, { password: a.password })).data;
      if (!d.unlock_token) return { unlocked: true, note: d.message };
      return { unlocked: true, unlock_token: d.unlock_token, next: 'Pass unlock_token to get_download_link.' };
    },
    async report_file(a, ctx) {
      const d = (await call(ctx, 'POST', `${slugPath(a.slug)}/report`, { reason: a.reason, details: a.details || '', contact: a.contact || '' })).data;
      return { reported: true, message: d.message };
    },
    async discord_list_servers() {
      return discordRequest('/users/@me/guilds');
    },
    async discord_list_channels(a) {
      return discordRequest(`/guilds/${encodeURIComponent(a.guild_id)}/channels`);
    },
    async discord_read_messages(a) {
      const limit = Math.min(100, Math.max(1, Number(a.limit) || 25));
      return discordRequest(`/channels/${encodeURIComponent(a.channel_id)}/messages?limit=${limit}`);
    },
    async discord_send_message(a) {
      const content = String(a.content || '').trim();
      if (!content) throw new ToolError('Message content cannot be empty.');
      if (content.length > 2000) throw new ToolError('Discord messages must be 2,000 characters or fewer.');
      return discordRequest(`/channels/${encodeURIComponent(a.channel_id)}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content, allowed_mentions: { parse: [] } }),
      });
    },
    async discord_get_server_info(a) {
      return discordRequest(`/guilds/${encodeURIComponent(a.guild_id)}?with_counts=true`);
    },
  };

  async function discordRequest(path, init = {}) {
    const token = process.env.DISCORD_BOT_TOKEN;
    if (!token) throw new ToolError('Discord is not configured yet. Add DISCORD_BOT_TOKEN to the ClipFX frontend deployment environment, redeploy, then invite the bot to your Discord server.');
    const response = await fetch(`https://discord.com/api/v10${path}`, {
      ...init,
      headers: { Authorization: `Bot ${token}`, ...(init.headers || {}) },
    });
    const raw = await response.text();
    let data;
    try { data = raw ? JSON.parse(raw) : {}; } catch { data = { message: raw }; }
    if (!response.ok) {
      if (response.status === 401) throw new ToolError('Discord rejected the configured bot token. Check DISCORD_BOT_TOKEN in the deployment environment.');
      if (response.status === 403) throw new ToolError('The Discord bot lacks permission for this server, channel, or action.');
      if (response.status === 404) throw new ToolError('Discord could not find that server or channel, or the bot cannot access it.');
      if (response.status === 429) throw new ToolError('Discord rate limited this request. Wait briefly and try again.');
      throw new ToolError(`Discord API request failed (${response.status}): ${String(data.message || 'Unknown error')}`);
    }
    return data;
  }

  // ---- JSON-RPC ---------------------------------------------------------------------------

  const rpcError = (id, code, message) => ({ jsonrpc: '2.0', id: id ?? null, error: { code, message } });

  async function runTool(params, ctx) {
    const tool = TOOL_MAP[params && params.name];
    if (!tool) return { error: [-32602, `Unknown tool: ${params && params.name}`] };
    const args = (params.arguments && typeof params.arguments === 'object') ? params.arguments : {};
    for (const k of tool.inputSchema.required) {
      if (args[k] === undefined || args[k] === null || args[k] === '') return { result: textResult(`Missing required argument: ${k}`, true) };
    }
    try {
      const data = await HANDLERS[tool.name](args, ctx);
      return { result: { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }], structuredContent: data, isError: false } };
    } catch (err) {
      if (err instanceof ToolError) return { result: textResult(err.message, true) };
      log.error(`[mcp] ${tool.name} failed: ${err.stack || err.message}`);
      return { result: textResult('Something went wrong on ClipFX\'s side. Try again.', true) };
    }
  }
  const textResult = (text, isError) => ({ content: [{ type: 'text', text }], isError });

  async function handle(msg, ctx) {
    if (!msg || msg.jsonrpc !== '2.0' || typeof msg.method !== 'string') {
      return msg && (msg.result !== undefined || msg.error !== undefined) ? null : rpcError(msg && msg.id, -32600, 'Invalid request');
    }
    const isNotification = msg.id === undefined || msg.id === null;
    const reply = (result) => (isNotification ? null : { jsonrpc: '2.0', id: msg.id, result });
    switch (msg.method) {
      case 'initialize': {
        const asked = msg.params && msg.params.protocolVersion;
        return reply({
          protocolVersion: PROTOCOL_VERSIONS.includes(asked) ? asked : PROTOCOL_VERSIONS[0],
          capabilities: { tools: { listChanged: false } },
          serverInfo: { name: 'clipfx', title: 'ClipFX', version: SERVER_VERSION, websiteUrl: ctx.origin },
          instructions: `ClipFX (${ctx.origin}) is a free library of video editing resources, and you are signed in to the user's ClipFX account. Use search_files and get_file to find assets and get_download_link to fetch them; always respect each file's license. You can also manage the user's own files (upload_small_file or start_upload, then publish_file), saved files and profile, within the permissions they approved. Confirm with the user before publishing, deleting or reporting.`,
        });
      }
      case 'ping': return reply({});
      case 'tools/list':
        return reply({ tools: TOOLS.map(({ name, title, description, inputSchema, annotations }) => ({ name, title, description, inputSchema, annotations })) });
      case 'tools/call': {
        const out = await runTool(msg.params, ctx);
        if (out.error) return isNotification ? null : rpcError(msg.id, ...out.error);
        return reply(out.result);
      }
      case 'resources/list': return reply({ resources: [] });
      case 'prompts/list': return reply({ prompts: [] });
      default:
        if (msg.method.startsWith('notifications/')) return null;
        return isNotification ? null : rpcError(msg.id, -32601, `Method not found: ${msg.method}`);
    }
  }

  const router = express.Router();
  // Bearer keys, not cookies, so any site or tool may call it.
  router.use((req, res, next) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Authorization, X-API-Key, Content-Type, Accept, Mcp-Session-Id, Mcp-Protocol-Version, Last-Event-ID');
    res.setHeader('Access-Control-Expose-Headers', 'Mcp-Session-Id, WWW-Authenticate');
    res.setHeader('Cache-Control', 'no-store');
    if (req.method === 'OPTIONS') return res.status(204).end();
    return next();
  });
  // A person opening /mcp in a browser gets the setup guide; MCP clients get 405 (no server-sent stream).
  router.get('/', (req, res) => {
    if ((req.get('accept') || '').includes('text/html')) return res.redirect(302, '/developers/mcp');
    res.setHeader('Allow', 'POST, OPTIONS');
    return res.status(405).json({ error: 'This MCP server answers POST requests (Streamable HTTP, JSON responses). Setup guide: /developers/mcp' });
  });
  router.delete('/', (req, res) => res.status(405).setHeader('Allow', 'POST, OPTIONS').end());
  // Sign-in required. A 401 carries the protected-resource metadata URL (RFC 9728), which is how MCP
  // clients discover "Sign in with ClipFX" and start the OAuth flow on their own.
  // Checked on every request (no caching), so disconnecting an app or revoking a key ends access at once.
  async function checkToken(req, token) {
    if (!token || !/^cfx_[\w-]{20,80}$/.test(token)) return false;
    const r = await backend.callAs(req, 'GET', '/api/session', undefined, token);
    if (r.status === 200) return true;
    return r.status >= 500 ? null : false;
  }
  const challenge = (req, res, error) => {
    const meta = `${origin(req)}/.well-known/oauth-protected-resource/mcp`;
    res.setHeader('WWW-Authenticate', `Bearer resource_metadata="${meta}"${error ? `, error="${error}", error_description="Sign in to ClipFX again."` : ''}`);
    return res.status(401).json({ jsonrpc: '2.0', id: null, error: { code: -32001, message: `Sign in required. Connect this server from an MCP client to sign in with ClipFX, or send an API key from ${origin(req)}/settings/api-keys.` } });
  };

  router.post('/', express.json({ limit: '4.5mb', type: () => true }), async (req, res) => {
    const token = tokenFrom(req);
    if (!token) return challenge(req, res);
    const ok = await checkToken(req, token);
    if (ok === null) return res.status(503).json({ jsonrpc: '2.0', id: null, error: { code: -32603, message: 'ClipFX is unavailable right now. Try again in a minute.' } });
    if (!ok) return challenge(req, res, 'invalid_token');
    const ctx = { req, token, origin: origin(req) };
    const body = req.body;
    const batch = Array.isArray(body);
    const msgs = batch ? body : [body];
    if (!msgs.length) return res.status(400).json(rpcError(null, -32600, 'Empty batch'));
    const replies = (await Promise.all(msgs.map((m) => handle(m, ctx)))).filter(Boolean);
    if (!replies.length) return res.status(202).end();
    return res.json(batch ? replies : replies[0]);
  });
  // Bad JSON.
  router.use((err, req, res, next) => {
    if (err.type === 'entity.parse.failed') return res.status(400).json(rpcError(null, -32700, 'Parse error'));
    if (err.type === 'entity.too.large') return res.status(413).json(rpcError(null, -32600, 'Request too large. Use start_upload for big files.'));
    return next(err);
  });

  return { router, TOOLS };
}

module.exports = { createMcp, TOOLS, PROTOCOL_VERSIONS };
