'use strict';
const crypto = require('node:crypto');
const { LICENSE_MAP, CATEGORIES, FILE_TYPES } = require('./catalog');

const SESSION_TTL = 30 * 24 * 3600 * 1000;
const DAY = 24 * 3600 * 1000;
const sha = (s) => crypto.createHash('sha256').update(s).digest('hex');
const today = () => Math.floor(Date.now() / DAY);

const SLUG_ALPHABET = 'abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';
function randomSlug(len = 8) {
  const bytes = crypto.randomBytes(len);
  let s = '';
  for (let i = 0; i < len; i++) s += SLUG_ALPHABET[bytes[i] % SLUG_ALPHABET.length];
  return s;
}

// What may appear in browse, search, profiles and sitemaps. Password-protected assets and links
// with an expiry or a download limit are private shares: reachable by link only, never listed.
const PUBLIC_ASSET_SQL = "a.status = 'active' AND a.visibility = 'public' AND a.password_hash IS NULL AND a.expires_at IS NULL AND a.max_downloads IS NULL";

const listToField = (arr) => (arr.length ? `,${arr.join(',')},` : ',');
const fieldToList = (s) => String(s || '').split(',').filter(Boolean);

const MEDIA_MIME = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp', mp4: 'video/mp4', webm: 'video/webm', mp3: 'audio/mpeg' };
const IMAGE_EXTS = new Set(['png', 'jpg', 'jpeg', 'gif', 'webp']);
const WEB_VIDEO = new Set(['mp4', 'm4v', 'webm', 'mov']);
const extOfKey = (key) => (/\.([a-z0-9]+)$/i.exec(key || '') || [])[1] || '';

// Signed URLs for everything a page shows inline. Download URLs are issued separately, per click.
async function mediaUrls(row, storage) {
  const out = { thumbUrl: null, videoSrc: null, audioSrc: null, imageSrc: null };
  const url = (key, contentType, kind) => storage.urlFor(key, { contentType, kind, stable: true });
  if (row.thumb_key) out.thumbUrl = await url(row.thumb_key, MEDIA_MIME[extOfKey(row.thumb_key)], 'image');
  if (row.preview_key) {
    if (IMAGE_EXTS.has(row.preview_ext)) out.imageSrc = await url(row.preview_key, MEDIA_MIME[row.preview_ext], 'image');
    else if (row.preview_ext === 'mp3') out.audioSrc = await url(row.preview_key, MEDIA_MIME.mp3, 'audio');
    else out.videoSrc = await url(row.preview_key, MEDIA_MIME[row.preview_ext], 'video');
  }
  const type = FILE_TYPES[row.file_ext] || {};
  if (type.inline) {
    if (row.file_kind === 'video' && !out.videoSrc && WEB_VIDEO.has(row.file_ext)) out.videoSrc = await url(row.file_key, type.mime, 'video');
    if (row.file_kind === 'audio' && !out.audioSrc) out.audioSrc = await url(row.file_key, type.mime, 'audio');
    if (row.file_kind === 'image' && !out.imageSrc) out.imageSrc = await url(row.file_key, type.mime, 'image');
  }
  if (!out.thumbUrl && out.imageSrc) out.thumbUrl = out.imageSrc;
  return out;
}

// A link past its expiry time, or one that has used up its downloads.
function isExpired(row, now = Date.now()) {
  if (row.expires_at && Number(row.expires_at) <= now) return 'expired';
  if (row.max_downloads && Number(row.downloads) >= Number(row.max_downloads)) return 'limit';
  return null;
}

// The public shape of an asset. Storage keys and hashes stay on the server.
async function serialize(row, storage) {
  if (!row) return null;
  return {
    id: row.id,
    slug: row.slug,
    user_id: row.user_id,
    username: row.username,
    display_name: row.display_name,
    user_banned: !!row.user_banned,
    anonymous: !!row.user_is_system,
    user_avatar_url: row.user_avatar_key ? await storage.urlFor(row.user_avatar_key, { kind: 'image', contentType: MEDIA_MIME[extOfKey(row.user_avatar_key)], stable: true }) : null,
    title: row.title,
    description: row.description,
    category: row.category,
    software: fieldToList(row.software),
    tags: fieldToList(row.tags),
    license: row.license,
    visibility: row.visibility,
    file_name: row.file_name,
    file_size: row.file_size,
    file_ext: row.file_ext,
    file_kind: row.file_kind,
    width: row.width,
    height: row.height,
    duration: row.duration,
    downloads: row.downloads,
    views: row.views,
    favorites: row.favorites || 0,
    status: row.status,
    removed_reason: row.removed_reason,
    has_thumb: !!row.thumb_key,
    has_preview: !!row.preview_key,
    processing: row.media_status === 'pending',
    locked: !!row.password_hash,
    expires_at: row.expires_at ? Number(row.expires_at) : null,
    max_downloads: row.max_downloads ? Number(row.max_downloads) : null,
    expired: isExpired(row),
    created_at: row.created_at,
    updated_at: row.updated_at,
    ...(await mediaUrls(row, storage)),
  };
}

function buildSearch(q) {
  const words = String(q || '').toLowerCase().match(/[\p{L}\p{N}]+/gu) || [];
  return words.slice(0, 8).map((w) => `"${w}"*`).join(' ');
}

function createModels(db, { storage }) {
  const serializeAll = (rows) => Promise.all(rows.map((r) => serialize(r, storage)));
  const one = (sql, ...p) => db.get(sql, p);
  const many = (sql, ...p) => db.all(sql, p);
  const run = (sql, ...p) => db.run(sql, p);
  const num = async (sql, ...p) => Number(((await db.get(sql, p)) || {}).n || 0);

  // Full-text search: FTS5 on SQLite, tsvector on Postgres. Both match every word as a prefix.
  function searchClause(q) {
    const words = (String(q || '').toLowerCase().match(/[\p{L}\p{N}]+/gu) || []).slice(0, 8);
    if (!words.length) return null;
    if (db.dialect === 'postgres') {
      return { sql: "to_tsvector('simple', a.title || ' ' || a.description || ' ' || a.tags) @@ to_tsquery('simple', ?)", param: words.map((w) => `${w}:*`).join(' & ') };
    }
    return { sql: 'a.id IN (SELECT rowid FROM assets_fts WHERE assets_fts MATCH ?)', param: buildSearch(q) };
  }

  const users = {
    byId: (id) => one('SELECT * FROM users WHERE id = ?', id),
    byUsername: (u) => one('SELECT * FROM users WHERE username = ?', String(u).toLowerCase()),
    byLogin: (login) => {
      const v = String(login).trim().toLowerCase();
      return one('SELECT * FROM users WHERE username = ? OR email = ?', v, v);
    },
    // Real accounts only; the system account that owns anonymous uploads doesn't count.
    count: () => num('SELECT COUNT(*) AS n FROM users WHERE is_system = 0'),
    // The account anonymous uploads belong to. Made on first use; it can't log in (no password).
    async anonymous() {
      const existing = await one("SELECT * FROM users WHERE username = 'anonymous'");
      if (existing) return existing;
      try {
        await run(`INSERT INTO users (username, email, password_hash, display_name, role, is_system, created_at)
          VALUES ('anonymous', NULL, '', 'Anonymous', 'user', 1, ?)`, Date.now());
      } catch (err) {
        if (!db.isUniqueViolation(err)) throw err;
      }
      return one("SELECT * FROM users WHERE username = 'anonymous'");
    },
    setAvatar: (id, key) => run('UPDATE users SET avatar_key = ? WHERE id = ?', key || null, id),
    setSocials: (id, socials) => run('UPDATE users SET socials = ? WHERE id = ?', JSON.stringify(socials || {}), id),
    // Most downloaded creators, for the home page.
    topCreators: (limit = 8) => many(`SELECT u.id, u.username, u.display_name, u.avatar_key,
        COUNT(a.id) AS uploads, COALESCE(SUM(a.downloads), 0) AS downloads
      FROM users u JOIN assets a ON a.user_id = u.id
      WHERE u.banned = 0 AND u.is_system = 0 AND ${PUBLIC_ASSET_SQL}
      GROUP BY u.id, u.username, u.display_name, u.avatar_key
      ORDER BY downloads DESC, uploads DESC LIMIT ?`, limit),
    async create({ username, email, passwordHash, displayName, role }) {
      const row = await one(`INSERT INTO users (username, email, password_hash, display_name, role, created_at)
        VALUES (?, ?, ?, ?, ?, ?) RETURNING id`, username.toLowerCase(), email || null, passwordHash, displayName, role || 'user', Date.now());
      return Number(row.id);
    },
    updateProfile: (id, { displayName, bio, website, email }) => run('UPDATE users SET display_name = ?, bio = ?, website = ?, email = ? WHERE id = ?', displayName, bio, website, email || null, id),
    setPassword: (id, hash) => run('UPDATE users SET password_hash = ? WHERE id = ?', hash, id),
    setRole: (id, role) => run('UPDATE users SET role = ? WHERE id = ?', role, id),
    setBanned: (id, banned) => run('UPDATE users SET banned = ? WHERE id = ?', banned ? 1 : 0, id),
    remove: (id) => run('DELETE FROM users WHERE id = ?', id),
    // Profiles count public files only; a creator's own dashboard counts everything.
    async stats(id, { publicOnly = false } = {}) {
      const r = await one(`SELECT COUNT(*) AS uploads, COALESCE(SUM(downloads), 0) AS downloads
        FROM assets a WHERE a.user_id = ? AND ${publicOnly ? PUBLIC_ASSET_SQL : "a.status = 'active'"}`, id);
      return { uploads: Number(r.uploads), downloads: Number(r.downloads) };
    },
    // Includes uploads in flight, so quota can't be dodged by starting many uploads at once.
    storageUsed: (id) => num(`SELECT (SELECT COALESCE(SUM(file_size), 0) FROM assets WHERE user_id = ?)
      + (SELECT COALESCE(SUM(size), 0) FROM uploads WHERE user_id = ?) AS n`, id, id),
    sitemapSummary: () => one('SELECT COUNT(*) AS count, MAX(created_at) AS lastmod FROM users WHERE banned = 0 AND is_system = 0'),
    // Last change for a profile: its newest public upload, or when the account was made.
    sitemapPage: (page, size) => many(`SELECT u.username, u.created_at,
        (SELECT MAX(a.updated_at) FROM assets a WHERE a.user_id = u.id AND ${PUBLIC_ASSET_SQL}) AS last_upload
      FROM users u WHERE u.banned = 0 AND u.is_system = 0 ORDER BY u.id LIMIT ? OFFSET ?`, size, (page - 1) * size),
    search(q, limit = 50) {
      const like = `%${String(q || '').toLowerCase().replace(/[%_]/g, '')}%`;
      return many(`SELECT u.*, (SELECT COUNT(*) FROM assets a WHERE a.user_id = u.id) AS asset_count
        FROM users u WHERE u.username LIKE ? OR LOWER(u.display_name) LIKE ? OR COALESCE(u.email, '') LIKE ?
        ORDER BY u.created_at DESC LIMIT ?`, like, like, like, limit);
    },
  };

  const sessions = {
    async create(userId) {
      const token = crypto.randomBytes(32).toString('base64url');
      await run('INSERT INTO sessions (token_hash, user_id, expires_at, created_at) VALUES (?, ?, ?, ?)', sha(token), userId, Date.now() + SESSION_TTL, Date.now());
      return token;
    },
    async user(token) {
      if (!token) return null;
      return (await one(`SELECT u.* FROM sessions s JOIN users u ON u.id = s.user_id
        WHERE s.token_hash = ? AND s.expires_at > ?`, sha(token), Date.now())) || null;
    },
    destroy: (token) => token && run('DELETE FROM sessions WHERE token_hash = ?', sha(token)),
    destroyAllFor: (userId) => run('DELETE FROM sessions WHERE user_id = ?', userId),
    async purgeExpired() {
      await run('DELETE FROM sessions WHERE expires_at < ?', Date.now());
      await run('DELETE FROM reset_tokens WHERE expires_at < ?', Date.now());
    },
  };

  const resets = {
    async create(userId, ttl = 24 * 3600 * 1000) {
      const token = crypto.randomBytes(24).toString('base64url');
      await run('INSERT INTO reset_tokens (token_hash, user_id, expires_at) VALUES (?, ?, ?)', sha(token), userId, Date.now() + ttl);
      return token;
    },
    find: (token) => one('SELECT * FROM reset_tokens WHERE token_hash = ? AND expires_at > ?', sha(String(token)), Date.now()),
    consume: (token) => run('DELETE FROM reset_tokens WHERE token_hash = ?', sha(String(token))),
  };

  const oauth = {
    user: (provider, subject) => one(`SELECT u.* FROM oauth_accounts o JOIN users u ON u.id = o.user_id
      WHERE o.provider = ? AND o.subject = ?`, provider, String(subject)),
    link: (provider, subject, userId) => run('INSERT INTO oauth_accounts (provider, subject, user_id, created_at) VALUES (?, ?, ?, ?)',
      provider, String(subject), userId, Date.now()),
    forUser: async (userId) => (await many('SELECT provider FROM oauth_accounts WHERE user_id = ? ORDER BY provider', userId)).map((r) => r.provider),
    unlink: (provider, userId) => run('DELETE FROM oauth_accounts WHERE provider = ? AND user_id = ?', provider, userId),
  };

  const uploads = {
    create: (v) => run(`INSERT INTO uploads (id, user_id, key, field, file_name, ext, size, content_type, multipart_id, part_size, anon_hash, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, v.id, v.userId, v.key, v.field, v.fileName, v.ext, v.size, v.contentType,
    v.multipartId || null, v.partSize || null, v.anonHash || null, Date.now()),
    // Anonymous uploads share one account, so they also have to match the browser that started them.
    async get(id, userId, anonHash) {
      const u = await one('SELECT * FROM uploads WHERE id = ? AND user_id = ?', String(id), userId);
      if (u && u.anon_hash && u.anon_hash !== anonHash) return null;
      return u;
    },
    markComplete: (id) => run('UPDATE uploads SET multipart_id = NULL WHERE id = ?', id),
    forUser: (userId) => many('SELECT key, multipart_id FROM uploads WHERE user_id = ?', userId),
    remove: (id) => run('DELETE FROM uploads WHERE id = ?', id),
    stale: (olderThan) => many('SELECT * FROM uploads WHERE created_at < ?', olderThan),
  };

  const SELECT_ASSET = `SELECT a.*, u.username, u.display_name, u.banned AS user_banned, u.avatar_key AS user_avatar_key, u.is_system AS user_is_system,
    (SELECT COUNT(*) FROM favorites f WHERE f.asset_id = a.id) AS favorites FROM assets a JOIN users u ON u.id = a.user_id`;

  const assets = {
    serialize: (row) => serialize(row, storage),
    async create(v) {
      for (let attempt = 0; ; attempt++) {
        const slug = randomSlug(attempt > 3 ? 10 : 8);
        try {
          const now = Date.now();
          const row = await one(`INSERT INTO assets (slug, user_id, title, description, category, software, tags, license, visibility,
            file_name, file_key, file_size, file_ext, file_kind, file_sha256, preview_key, preview_ext, thumb_key,
            width, height, duration, media_status, password_hash, expires_at, max_downloads, manage_hash, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING id`,
          slug, v.userId, v.title, v.description, v.category, listToField(v.software), listToField(v.tags), v.license, v.visibility,
          v.fileName, v.fileKey, v.fileSize, v.fileExt, v.fileKind, v.sha256 || '', v.previewKey || null, v.previewExt || null,
          v.thumbKey || null, v.width || null, v.height || null, v.duration || null, v.mediaStatus || 'none',
          v.passwordHash || null, v.expiresAt || null, v.maxDownloads || null, v.manageHash || null, now, now);
          return { id: Number(row.id), slug };
        } catch (err) {
          if (!db.isUniqueViolation(err, 'slug') || attempt > 6) throw err;
        }
      }
    },
    rowBySlug: (slug) => one(`${SELECT_ASSET} WHERE a.slug = ?`, String(slug)),
    rawById: (id) => one('SELECT * FROM assets WHERE id = ?', id),
    update: (id, v) => run(`UPDATE assets SET title = ?, description = ?, category = ?, software = ?, tags = ?, license = ?, visibility = ?, updated_at = ?
      WHERE id = ?`, v.title, v.description, v.category, listToField(v.software), listToField(v.tags), v.license, v.visibility, Date.now(), id),
    async setFields(id, fields) {
      const keys = Object.keys(fields);
      if (!keys.length) return;
      const sets = keys.map((k) => `${k} = ?`).join(', ');
      await run(`UPDATE assets SET ${sets}, updated_at = ? WHERE id = ?`, ...keys.map((k) => fields[k] ?? null), Date.now(), id);
    },
    setStatus: (id, status, reason) => run('UPDATE assets SET status = ?, removed_reason = ?, updated_at = ? WHERE id = ?', status, reason || null, Date.now(), id),
    remove: (id) => run('DELETE FROM assets WHERE id = ?', id),
    keysForUser: (userId) => many('SELECT file_key, preview_key, thumb_key FROM assets WHERE user_id = ?', userId),
    needingWork: () => many("SELECT id FROM assets WHERE media_status = 'pending' OR file_sha256 = ''"),
    addView: (id) => run('UPDATE assets SET views = views + 1 WHERE id = ?', id),
    addDownload: (id) => db.batch([
      ['UPDATE assets SET downloads = downloads + 1 WHERE id = ?', [id]],
      [`INSERT INTO daily_downloads (asset_id, day, count) VALUES (?, ?, 1)
        ON CONFLICT (asset_id, day) DO UPDATE SET count = daily_downloads.count + 1`, [id, today()]],
    ]),
    isBlockedHash: async (h) => !!h && !!(await one('SELECT 1 AS x FROM blocked_hashes WHERE sha256 = ?', h)),
    blockHash: (h, reason) => h && run('INSERT INTO blocked_hashes (sha256, reason, created_at) VALUES (?, ?, ?) ON CONFLICT (sha256) DO NOTHING', h, reason, Date.now()),
    unblockHash: (h) => run('DELETE FROM blocked_hashes WHERE sha256 = ?', h),
    // Demo data only (seed script).
    setCounts: (id, downloads, views) => run('UPDATE assets SET downloads = ?, views = ? WHERE id = ?', downloads, views, id),

    // Flexible listing used by browse, profiles, dashboard, favorites and admin.
    async list(opts = {}) {
      const where = [];
      const params = [];
      if (!opts.anyStatus) where.push("a.status = 'active'");
      if (opts.status) { where.push('a.status = ?'); params.push(opts.status); }
      if (!opts.includeUnlisted) where.push(PUBLIC_ASSET_SQL);
      if (opts.excludeSystem) where.push('u.is_system = 0');
      if (!opts.includeBanned) where.push('u.banned = 0');
      if (opts.userId) { where.push('a.user_id = ?'); params.push(opts.userId); }
      if (opts.category) { where.push('a.category = ?'); params.push(opts.category); }
      if (opts.license) { where.push('a.license = ?'); params.push(opts.license); }
      if (opts.kind) { where.push('a.file_kind = ?'); params.push(opts.kind); }
      if (opts.software) { where.push('a.software LIKE ?'); params.push(`%,${opts.software},%`); }
      if (opts.tag) { where.push('a.tags LIKE ?'); params.push(`%,${String(opts.tag).replace(/[%_,]/g, '')},%`); }
      if (opts.excludeId) { where.push('a.id != ?'); params.push(opts.excludeId); }
      if (opts.commercial) where.push(`a.license IN (${Object.values(LICENSE_MAP).filter((l) => l.commercial).map((l) => `'${l.id}'`).join(',')})`);
      if (opts.noAttribution) where.push(`a.license IN (${Object.values(LICENSE_MAP).filter((l) => !l.attribution).map((l) => `'${l.id}'`).join(',')})`);
      if (opts.favoritesOf) { where.push('a.id IN (SELECT asset_id FROM favorites WHERE user_id = ?)'); params.push(opts.favoritesOf); }
      const search = searchClause(opts.q);
      if (search) { where.push(search.sql); params.push(search.param); }

      const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
      const from = 'FROM assets a JOIN users u ON u.id = a.user_id';
      let order = 'a.created_at DESC';
      const extraParams = [];
      if (opts.sort === 'downloads') order = 'a.downloads DESC, a.created_at DESC';
      else if (opts.sort === 'trending') {
        order = '(SELECT COALESCE(SUM(count), 0) FROM daily_downloads d WHERE d.asset_id = a.id AND d.day >= ?) DESC, a.downloads DESC, a.created_at DESC';
        extraParams.push(today() - 14);
      } else if (opts.sort === 'saved' && opts.favoritesOf) {
        order = '(SELECT created_at FROM favorites f WHERE f.asset_id = a.id AND f.user_id = ?) DESC';
        extraParams.push(opts.favoritesOf);
      } else if (opts.sort === 'oldest') order = 'a.created_at ASC';

      const perPage = Math.min(Math.max(Number(opts.perPage) || 24, 1), 100);
      const page = Math.max(Number(opts.page) || 1, 1);
      const [total, rows] = await Promise.all([
        num(`SELECT COUNT(*) AS n ${from} ${whereSql}`, ...params),
        many(`SELECT a.*, u.username, u.display_name, u.banned AS user_banned, u.avatar_key AS user_avatar_key, u.is_system AS user_is_system,
          (SELECT COUNT(*) FROM favorites f WHERE f.asset_id = a.id) AS favorites
          ${from} ${whereSql} ORDER BY ${order} LIMIT ? OFFSET ?`, ...params, ...extraParams, perPage, (page - 1) * perPage),
      ]);
      return { items: await serializeAll(rows), total, page, perPage, pages: Math.max(1, Math.ceil(total / perPage)) };
    },

    async categoryCounts() {
      const rows = await many(`SELECT a.category, COUNT(*) AS n FROM assets a JOIN users u ON u.id = a.user_id
        WHERE ${PUBLIC_ASSET_SQL} AND u.banned = 0 GROUP BY a.category`);
      const map = Object.fromEntries(rows.map((r) => [r.category, Number(r.n)]));
      return CATEGORIES.map((c) => ({ id: c.id, count: map[c.id] || 0 }));
    },

    async siteStats() {
      const r = await one(`SELECT
        (SELECT COUNT(*) FROM assets a WHERE ${PUBLIC_ASSET_SQL}) AS assets,
        (SELECT COALESCE(SUM(downloads), 0) FROM assets) AS downloads,
        (SELECT COUNT(DISTINCT a.user_id) FROM assets a JOIN users u ON u.id = a.user_id WHERE a.status = 'active' AND u.is_system = 0) AS creators,
        (SELECT COUNT(*) FROM users WHERE is_system = 0) AS users,
        (SELECT COALESCE(SUM(file_size), 0) FROM assets) AS bytes`);
      return Object.fromEntries(Object.entries(r).map(([k, v]) => [k, Number(v)]));
    },

    // Sitemap pages are ordered by id, so a page's contents only change at the end as uploads arrive.
    sitemapSummary: () => one(`SELECT COUNT(*) AS count, MAX(a.updated_at) AS lastmod FROM assets a JOIN users u ON u.id = a.user_id
      WHERE ${PUBLIC_ASSET_SQL} AND u.banned = 0`),
    sitemapPage: (page, size) => many(`SELECT a.slug, a.title, a.updated_at, a.thumb_key FROM assets a JOIN users u ON u.id = a.user_id
      WHERE ${PUBLIC_ASSET_SQL} AND u.banned = 0 ORDER BY a.id LIMIT ? OFFSET ?`, size, (page - 1) * size),
  };

  const favorites = {
    has: async (userId, assetId) => !!(await one('SELECT 1 AS x FROM favorites WHERE user_id = ? AND asset_id = ?', userId, assetId)),
    async toggle(userId, assetId) {
      const removed = await run('DELETE FROM favorites WHERE user_id = ? AND asset_id = ?', userId, assetId);
      if (removed.changes) return false;
      await run('INSERT INTO favorites (user_id, asset_id, created_at) VALUES (?, ?, ?) ON CONFLICT (user_id, asset_id) DO NOTHING', userId, assetId, Date.now());
      return true;
    },
    count: (assetId) => num('SELECT COUNT(*) AS n FROM favorites WHERE asset_id = ?', assetId),
  };

  const reports = {
    create: (v) => run('INSERT INTO reports (asset_id, reporter_id, reason, details, contact, created_at) VALUES (?, ?, ?, ?, ?, ?)',
      v.assetId, v.reporterId || null, v.reason, v.details, v.contact, Date.now()),
    open: () => many(`SELECT r.*, a.slug, a.title, a.status AS asset_status, ru.username AS reporter
      FROM reports r JOIN assets a ON a.id = r.asset_id LEFT JOIN users ru ON ru.id = r.reporter_id
      WHERE r.status = 'open' ORDER BY r.created_at ASC`),
    openCount: () => num("SELECT COUNT(*) AS n FROM reports WHERE status = 'open'"),
    byId: (id) => one('SELECT * FROM reports WHERE id = ?', id),
    resolve: (id, status, by) => run('UPDATE reports SET status = ?, resolved_at = ?, resolved_by = ? WHERE id = ?', status, Date.now(), by, id),
    resolveAllFor: (assetId, status, by) => run("UPDATE reports SET status = ?, resolved_at = ?, resolved_by = ? WHERE asset_id = ? AND status = 'open'", status, Date.now(), by, assetId),
  };

  return { db, users, sessions, resets, oauth, uploads, assets, favorites, reports };
}

module.exports = { createModels, serialize, buildSearch, randomSlug, isExpired, MEDIA_MIME, extOfKey, PUBLIC_ASSET_SQL };
