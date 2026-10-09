'use strict';
const crypto = require('node:crypto');
const { transaction } = require('./db');
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

const listToField = (arr) => (arr.length ? `,${arr.join(',')},` : ',');
const fieldToList = (s) => String(s || '').split(',').filter(Boolean);

const MEDIA_MIME = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp', mp4: 'video/mp4', webm: 'video/webm', mp3: 'audio/mpeg' };
const IMAGE_EXTS = new Set(['png', 'jpg', 'jpeg', 'gif', 'webp']);
const WEB_VIDEO = new Set(['mp4', 'm4v', 'webm', 'mov']);
const extOfKey = (key) => (/\.([a-z0-9]+)$/i.exec(key || '') || [])[1] || '';

// Signed URLs for everything a page shows inline. Download URLs are issued separately, per click.
async function mediaUrls(row, storage) {
  const out = { thumbUrl: null, videoSrc: null, audioSrc: null, imageSrc: null };
  const url = (key, contentType) => storage.urlFor(key, { contentType, stable: true });
  if (row.thumb_key) out.thumbUrl = await url(row.thumb_key, MEDIA_MIME[extOfKey(row.thumb_key)]);
  if (row.preview_key) {
    const src = await url(row.preview_key, MEDIA_MIME[row.preview_ext]);
    if (IMAGE_EXTS.has(row.preview_ext)) out.imageSrc = src;
    else if (row.preview_ext === 'mp3') out.audioSrc = src;
    else out.videoSrc = src;
  }
  const type = FILE_TYPES[row.file_ext] || {};
  if (type.inline) {
    if (row.file_kind === 'video' && !out.videoSrc && WEB_VIDEO.has(row.file_ext)) out.videoSrc = await url(row.file_key, type.mime);
    if (row.file_kind === 'audio' && !out.audioSrc) out.audioSrc = await url(row.file_key, type.mime);
    if (row.file_kind === 'image' && !out.imageSrc) out.imageSrc = await url(row.file_key, type.mime);
  }
  if (!out.thumbUrl && out.imageSrc) out.thumbUrl = out.imageSrc;
  return out;
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
  const cache = new Map();
  const st = (sql) => {
    let s = cache.get(sql);
    if (!s) { s = db.prepare(sql); cache.set(sql, s); }
    return s;
  };
  const serializeAll = (rows) => Promise.all(rows.map((r) => serialize(r, storage)));

  const users = {
    byId: (id) => st('SELECT * FROM users WHERE id = ?').get(id),
    byUsername: (u) => st('SELECT * FROM users WHERE username = ?').get(String(u).toLowerCase()),
    byLogin: (login) => {
      const v = String(login).trim().toLowerCase();
      return st('SELECT * FROM users WHERE username = ? OR email = ?').get(v, v);
    },
    count: () => st('SELECT COUNT(*) AS n FROM users').get().n,
    create({ username, email, passwordHash, displayName, role }) {
      const r = st(`INSERT INTO users (username, email, password_hash, display_name, role, created_at)
        VALUES (?, ?, ?, ?, ?, ?)`).run(username.toLowerCase(), email || null, passwordHash, displayName, role || 'user', Date.now());
      return Number(r.lastInsertRowid);
    },
    updateProfile(id, { displayName, bio, website, email }) {
      st('UPDATE users SET display_name = ?, bio = ?, website = ?, email = ? WHERE id = ?').run(displayName, bio, website, email || null, id);
    },
    setPassword: (id, hash) => st('UPDATE users SET password_hash = ? WHERE id = ?').run(hash, id),
    setRole: (id, role) => st('UPDATE users SET role = ? WHERE id = ?').run(role, id),
    setBanned: (id, banned) => st('UPDATE users SET banned = ? WHERE id = ?').run(banned ? 1 : 0, id),
    remove: (id) => st('DELETE FROM users WHERE id = ?').run(id),
    stats(id) {
      return st(`SELECT COUNT(*) AS uploads, COALESCE(SUM(downloads), 0) AS downloads
        FROM assets WHERE user_id = ? AND status = 'active'`).get(id);
    },
    // Includes uploads in flight, so quota can't be dodged by starting many uploads at once.
    storageUsed(id) {
      return st(`SELECT (SELECT COALESCE(SUM(file_size), 0) FROM assets WHERE user_id = ?)
        + (SELECT COALESCE(SUM(size), 0) FROM uploads WHERE user_id = ?) AS n`).get(id, id).n;
    },
    search(q, limit = 50) {
      const like = `%${String(q || '').toLowerCase().replace(/[%_]/g, '')}%`;
      return st(`SELECT u.*, (SELECT COUNT(*) FROM assets a WHERE a.user_id = u.id) AS asset_count
        FROM users u WHERE u.username LIKE ? OR u.display_name LIKE ? OR IFNULL(u.email, '') LIKE ?
        ORDER BY u.created_at DESC LIMIT ?`).all(like, like, like, limit);
    },
  };

  const sessions = {
    create(userId) {
      const token = crypto.randomBytes(32).toString('base64url');
      st('INSERT INTO sessions (token_hash, user_id, expires_at, created_at) VALUES (?, ?, ?, ?)')
        .run(sha(token), userId, Date.now() + SESSION_TTL, Date.now());
      return token;
    },
    user(token) {
      if (!token) return null;
      return st(`SELECT u.* FROM sessions s JOIN users u ON u.id = s.user_id
        WHERE s.token_hash = ? AND s.expires_at > ?`).get(sha(token), Date.now()) || null;
    },
    destroy: (token) => token && st('DELETE FROM sessions WHERE token_hash = ?').run(sha(token)),
    destroyAllFor: (userId) => st('DELETE FROM sessions WHERE user_id = ?').run(userId),
    purgeExpired: () => {
      st('DELETE FROM sessions WHERE expires_at < ?').run(Date.now());
      st('DELETE FROM reset_tokens WHERE expires_at < ?').run(Date.now());
    },
  };

  const resets = {
    create(userId, ttl = 24 * 3600 * 1000) {
      const token = crypto.randomBytes(24).toString('base64url');
      st('INSERT INTO reset_tokens (token_hash, user_id, expires_at) VALUES (?, ?, ?)').run(sha(token), userId, Date.now() + ttl);
      return token;
    },
    find: (token) => st('SELECT * FROM reset_tokens WHERE token_hash = ? AND expires_at > ?').get(sha(String(token)), Date.now()),
    consume: (token) => st('DELETE FROM reset_tokens WHERE token_hash = ?').run(sha(String(token))),
  };

  const uploads = {
    create(v) {
      st(`INSERT INTO uploads (id, user_id, key, field, file_name, ext, size, content_type, multipart_id, part_size, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(v.id, v.userId, v.key, v.field, v.fileName, v.ext, v.size, v.contentType,
        v.multipartId || null, v.partSize || null, Date.now());
    },
    get: (id, userId) => st('SELECT * FROM uploads WHERE id = ? AND user_id = ?').get(String(id), userId),
    remove: (id) => st('DELETE FROM uploads WHERE id = ?').run(id),
    stale: (olderThan) => st('SELECT * FROM uploads WHERE created_at < ?').all(olderThan),
  };

  const SELECT_ASSET = `SELECT a.*, u.username, u.display_name, u.banned AS user_banned,
    (SELECT COUNT(*) FROM favorites f WHERE f.asset_id = a.id) AS favorites FROM assets a JOIN users u ON u.id = a.user_id`;

  const assets = {
    serialize: (row) => serialize(row, storage),
    create(v) {
      for (let attempt = 0; ; attempt++) {
        const slug = randomSlug(attempt > 3 ? 10 : 8);
        try {
          const now = Date.now();
          const r = st(`INSERT INTO assets (slug, user_id, title, description, category, software, tags, license, visibility,
            file_name, file_key, file_size, file_ext, file_kind, file_sha256, preview_key, preview_ext, thumb_key,
            width, height, duration, media_status, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
            slug, v.userId, v.title, v.description, v.category, listToField(v.software), listToField(v.tags), v.license, v.visibility,
            v.fileName, v.fileKey, v.fileSize, v.fileExt, v.fileKind, v.sha256 || '', v.previewKey || null, v.previewExt || null,
            v.thumbKey || null, v.width || null, v.height || null, v.duration || null, v.mediaStatus || 'none', now, now,
          );
          return { id: Number(r.lastInsertRowid), slug };
        } catch (err) {
          if (!/UNIQUE constraint failed: assets.slug/.test(err.message) || attempt > 6) throw err;
        }
      }
    },
    rowBySlug: (slug) => st(`${SELECT_ASSET} WHERE a.slug = ?`).get(String(slug)),
    rawById: (id) => st('SELECT * FROM assets WHERE id = ?').get(id),
    update(id, v) {
      st(`UPDATE assets SET title = ?, description = ?, category = ?, software = ?, tags = ?, license = ?, visibility = ?, updated_at = ?
        WHERE id = ?`).run(v.title, v.description, v.category, listToField(v.software), listToField(v.tags), v.license, v.visibility, Date.now(), id);
    },
    setFields(id, fields) {
      const keys = Object.keys(fields);
      if (!keys.length) return;
      const sets = keys.map((k) => `${k} = ?`).join(', ');
      st(`UPDATE assets SET ${sets}, updated_at = ? WHERE id = ?`).run(...keys.map((k) => fields[k] ?? null), Date.now(), id);
    },
    setStatus: (id, status, reason) => st('UPDATE assets SET status = ?, removed_reason = ?, updated_at = ? WHERE id = ?').run(status, reason || null, Date.now(), id),
    remove: (id) => st('DELETE FROM assets WHERE id = ?').run(id),
    keysForUser: (userId) => st('SELECT file_key, preview_key, thumb_key FROM assets WHERE user_id = ?').all(userId),
    needingWork: () => st("SELECT id FROM assets WHERE media_status = 'pending' OR file_sha256 = ''").all(),
    addView: (id) => st('UPDATE assets SET views = views + 1 WHERE id = ?').run(id),
    addDownload(id) {
      transaction(db, () => {
        st('UPDATE assets SET downloads = downloads + 1 WHERE id = ?').run(id);
        st(`INSERT INTO daily_downloads (asset_id, day, count) VALUES (?, ?, 1)
          ON CONFLICT(asset_id, day) DO UPDATE SET count = count + 1`).run(id, today());
      });
    },
    isBlockedHash: (h) => !!h && !!st('SELECT 1 FROM blocked_hashes WHERE sha256 = ?').get(h),
    blockHash: (h, reason) => h && st('INSERT OR IGNORE INTO blocked_hashes (sha256, reason, created_at) VALUES (?, ?, ?)').run(h, reason, Date.now()),
    unblockHash: (h) => st('DELETE FROM blocked_hashes WHERE sha256 = ?').run(h),

    // Flexible listing used by browse, profiles, dashboard, favorites and admin.
    async list(opts = {}) {
      const where = [];
      const params = [];
      if (!opts.anyStatus) where.push("a.status = 'active'");
      if (opts.status) { where.push('a.status = ?'); params.push(opts.status); }
      if (!opts.includeUnlisted) where.push("a.visibility = 'public'");
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
      const match = buildSearch(opts.q);
      if (match) { where.push('a.id IN (SELECT rowid FROM assets_fts WHERE assets_fts MATCH ?)'); params.push(match); }

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
      const total = st(`SELECT COUNT(*) AS n ${from} ${whereSql}`).get(...params).n;
      const rows = st(`SELECT a.*, u.username, u.display_name, u.banned AS user_banned,
        (SELECT COUNT(*) FROM favorites f WHERE f.asset_id = a.id) AS favorites
        ${from} ${whereSql} ORDER BY ${order} LIMIT ? OFFSET ?`).all(...params, ...extraParams, perPage, (page - 1) * perPage);
      return { items: await serializeAll(rows), total, page, perPage, pages: Math.max(1, Math.ceil(total / perPage)) };
    },

    categoryCounts() {
      const rows = st(`SELECT a.category, COUNT(*) AS n FROM assets a JOIN users u ON u.id = a.user_id
        WHERE a.status = 'active' AND a.visibility = 'public' AND u.banned = 0 GROUP BY a.category`).all();
      const map = Object.fromEntries(rows.map((r) => [r.category, r.n]));
      return CATEGORIES.map((c) => ({ id: c.id, count: map[c.id] || 0 }));
    },

    siteStats() {
      return st(`SELECT
        (SELECT COUNT(*) FROM assets WHERE status = 'active' AND visibility = 'public') AS assets,
        (SELECT COALESCE(SUM(downloads), 0) FROM assets) AS downloads,
        (SELECT COUNT(DISTINCT user_id) FROM assets WHERE status = 'active') AS creators,
        (SELECT COUNT(*) FROM users) AS users,
        (SELECT COALESCE(SUM(file_size), 0) FROM assets) AS bytes`).get();
    },

    sitemap() {
      return st(`SELECT a.slug, a.updated_at FROM assets a JOIN users u ON u.id = a.user_id
        WHERE a.status = 'active' AND a.visibility = 'public' AND u.banned = 0 ORDER BY a.created_at DESC LIMIT 45000`).all();
    },
  };

  const favorites = {
    has: (userId, assetId) => !!st('SELECT 1 FROM favorites WHERE user_id = ? AND asset_id = ?').get(userId, assetId),
    toggle(userId, assetId) {
      if (favorites.has(userId, assetId)) {
        st('DELETE FROM favorites WHERE user_id = ? AND asset_id = ?').run(userId, assetId);
        return false;
      }
      st('INSERT INTO favorites (user_id, asset_id, created_at) VALUES (?, ?, ?)').run(userId, assetId, Date.now());
      return true;
    },
    count: (assetId) => st('SELECT COUNT(*) AS n FROM favorites WHERE asset_id = ?').get(assetId).n,
  };

  const reports = {
    create: (v) => st(`INSERT INTO reports (asset_id, reporter_id, reason, details, contact, created_at) VALUES (?, ?, ?, ?, ?, ?)`)
      .run(v.assetId, v.reporterId || null, v.reason, v.details, v.contact, Date.now()),
    open: () => st(`SELECT r.*, a.slug, a.title, a.status AS asset_status, ru.username AS reporter
      FROM reports r JOIN assets a ON a.id = r.asset_id LEFT JOIN users ru ON ru.id = r.reporter_id
      WHERE r.status = 'open' ORDER BY r.created_at ASC`).all(),
    openCount: () => st("SELECT COUNT(*) AS n FROM reports WHERE status = 'open'").get().n,
    byId: (id) => st('SELECT * FROM reports WHERE id = ?').get(id),
    resolve: (id, status, by) => st('UPDATE reports SET status = ?, resolved_at = ?, resolved_by = ? WHERE id = ?').run(status, Date.now(), by, id),
    resolveAllFor: (assetId, status, by) => st("UPDATE reports SET status = ?, resolved_at = ?, resolved_by = ? WHERE asset_id = ? AND status = 'open'").run(status, Date.now(), by, assetId),
  };

  return { db, users, sessions, resets, uploads, assets, favorites, reports };
}

module.exports = { createModels, serialize, buildSearch, randomSlug, MEDIA_MIME, extOfKey };
