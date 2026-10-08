'use strict';
const crypto = require('node:crypto');
const { transaction } = require('./db');
const {
  CATEGORY_MAP, LICENSE_MAP, SOFTWARE_MAP, FILE_TYPES, KINDS, CATEGORIES,
} = require('./catalog');
const { formatBytes, formatDuration } = require('./html');

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

function resolutionLabel(w, h) {
  if (!w || !h) return '';
  const short = Math.min(w, h);
  const long = Math.max(w, h);
  if (short >= 4320 || long >= 7680) return '8K';
  if (short >= 2160 || long >= 3840) return '4K';
  if (short >= 1440 || long >= 2560) return '2K';
  if (short >= 1080 || long >= 1920) return '1080p';
  if (short >= 720 || long >= 1280) return '720p';
  return `${w}×${h}`;
}

const WEB_VIDEO = new Set(['mp4', 'm4v', 'webm', 'mov']);

// Turn a DB row into something views can use directly.
function decorate(row) {
  if (!row) return null;
  const type = FILE_TYPES[row.file_ext] || {};
  const base = `/a/${row.slug}`;
  const media = `/m/${row.slug}`;
  const category = CATEGORY_MAP[row.category] || CATEGORY_MAP.other;
  const a = {
    ...row,
    url: base,
    downloadUrl: `${base}/download`,
    category,
    license: LICENSE_MAP[row.license] || LICENSE_MAP.free,
    software: fieldToList(row.software).map((id) => SOFTWARE_MAP[id]).filter(Boolean),
    tags: fieldToList(row.tags),
    kind: row.file_kind,
    kindInfo: KINDS[row.file_kind] || KINDS.archive,
    sizeLabel: formatBytes(row.file_size),
    durationLabel: formatDuration(row.duration),
    resolution: resolutionLabel(row.width, row.height),
    vertical: row.width && row.height && row.height > row.width,
    thumbUrl: null,
    videoSrc: null,
    audioSrc: null,
    imageSrc: null,
  };
  if (row.thumb_key) a.thumbUrl = `${media}/thumb?v=${row.updated_at}`;
  if (row.preview_key) {
    if (['png', 'jpg', 'jpeg', 'gif', 'webp'].includes(row.preview_ext)) a.imageSrc = `${media}/preview`;
    else if (row.preview_ext === 'mp3') a.audioSrc = `${media}/preview`;
    else a.videoSrc = `${media}/preview`;
  }
  if (type.inline) {
    if (a.kind === 'video' && !a.videoSrc && WEB_VIDEO.has(row.file_ext)) a.videoSrc = `${media}/file`;
    if (a.kind === 'audio' && !a.audioSrc) a.audioSrc = `${media}/file`;
    if (a.kind === 'image' && !a.imageSrc) a.imageSrc = `${media}/file`;
  }
  if (!a.thumbUrl && a.imageSrc) a.thumbUrl = a.imageSrc;
  a.processing = row.media_status === 'pending';
  return a;
}

function buildSearch(q) {
  const words = String(q || '').toLowerCase().match(/[\p{L}\p{N}]+/gu) || [];
  return words.slice(0, 8).map((w) => `"${w}"*`).join(' ');
}

function createModels(db) {
  const cache = new Map();
  const st = (sql) => {
    let s = cache.get(sql);
    if (!s) { s = db.prepare(sql); cache.set(sql, s); }
    return s;
  };

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
      return st(`SELECT COUNT(*) AS uploads, COALESCE(SUM(downloads), 0) AS downloads, COALESCE(SUM(file_size), 0) AS bytes
        FROM assets WHERE user_id = ? AND status = 'active'`).get(id);
    },
    storageUsed: (id) => st('SELECT COALESCE(SUM(file_size), 0) AS n FROM assets WHERE user_id = ?').get(id).n,
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

  const SELECT_ASSET = `SELECT a.*, u.username, u.display_name, u.banned AS user_banned,
    (SELECT COUNT(*) FROM favorites f WHERE f.asset_id = a.id) AS favorites FROM assets a JOIN users u ON u.id = a.user_id`;

  const assets = {
    decorate,
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
            v.fileName, v.fileKey, v.fileSize, v.fileExt, v.fileKind, v.sha256, v.previewKey || null, v.previewExt || null,
            v.thumbKey || null, v.width || null, v.height || null, v.duration || null, v.mediaStatus || 'none', now, now,
          );
          return { id: Number(r.lastInsertRowid), slug };
        } catch (err) {
          if (!/UNIQUE constraint failed: assets.slug/.test(err.message) || attempt > 6) throw err;
        }
      }
    },
    bySlug: (slug) => decorate(st(`${SELECT_ASSET} WHERE a.slug = ?`).get(String(slug))),
    rawById: (id) => st('SELECT * FROM assets WHERE id = ?').get(id),
    update(id, v) {
      st(`UPDATE assets SET title = ?, description = ?, category = ?, software = ?, tags = ?, license = ?, visibility = ?, updated_at = ?
        WHERE id = ?`).run(v.title, v.description, v.category, listToField(v.software), listToField(v.tags), v.license, v.visibility, Date.now(), id);
    },
    setMedia(id, fields) {
      const keys = Object.keys(fields);
      if (!keys.length) return;
      const sets = keys.map((k) => `${k} = ?`).join(', ');
      st(`UPDATE assets SET ${sets}, updated_at = ? WHERE id = ?`).run(...keys.map((k) => fields[k] ?? null), Date.now(), id);
    },
    setStatus: (id, status, reason) => st('UPDATE assets SET status = ?, removed_reason = ?, updated_at = ? WHERE id = ?').run(status, reason || null, Date.now(), id),
    remove: (id) => st('DELETE FROM assets WHERE id = ?').run(id),
    keysForUser: (userId) => st('SELECT file_key, preview_key, thumb_key FROM assets WHERE user_id = ?').all(userId),
    addView: (id) => st('UPDATE assets SET views = views + 1 WHERE id = ?').run(id),
    addDownload(id) {
      transaction(db, () => {
        st('UPDATE assets SET downloads = downloads + 1 WHERE id = ?').run(id);
        st(`INSERT INTO daily_downloads (asset_id, day, count) VALUES (?, ?, 1)
          ON CONFLICT(asset_id, day) DO UPDATE SET count = count + 1`).run(id, today());
      });
    },
    isBlockedHash: (h) => !!st('SELECT 1 FROM blocked_hashes WHERE sha256 = ?').get(h),
    blockHash: (h, reason) => st('INSERT OR IGNORE INTO blocked_hashes (sha256, reason, created_at) VALUES (?, ?, ?)').run(h, reason, Date.now()),

    // Flexible listing used by browse, profiles, dashboard, favorites and admin.
    list(opts = {}) {
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
      return { items: rows.map(decorate), total, page, perPage, pages: Math.max(1, Math.ceil(total / perPage)) };
    },

    categoryCounts() {
      const rows = st(`SELECT a.category, COUNT(*) AS n FROM assets a JOIN users u ON u.id = a.user_id
        WHERE a.status = 'active' AND a.visibility = 'public' AND u.banned = 0 GROUP BY a.category`).all();
      const map = Object.fromEntries(rows.map((r) => [r.category, r.n]));
      return CATEGORIES.map((c) => ({ ...c, count: map[c.id] || 0 }));
    },

    siteStats() {
      return st(`SELECT
        (SELECT COUNT(*) FROM assets WHERE status = 'active' AND visibility = 'public') AS assets,
        (SELECT COALESCE(SUM(downloads), 0) FROM assets) AS downloads,
        (SELECT COUNT(DISTINCT user_id) FROM assets WHERE status = 'active') AS creators,
        (SELECT COUNT(*) FROM users) AS users,
        (SELECT COALESCE(SUM(file_size), 0) FROM assets) AS bytes`).get();
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

  return { db, users, sessions, resets, assets, favorites, reports };
}

module.exports = { createModels, decorate, resolutionLabel, buildSearch, randomSlug };
