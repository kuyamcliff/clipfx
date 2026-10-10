'use strict';
const crypto = require('node:crypto');
const { FILE_TYPES, CATEGORY_MAP, SOFTWARE_MAP, LICENSE_MAP, KINDS } = require('../catalog');
const { isExpired } = require('../models');
const { hashPassword, verifyPassword, safeEqual } = require('../security');

const MAX_EXPIRY_MINUTES = 365 * 24 * 60;
const sha = (s) => crypto.createHash('sha256').update(String(s)).digest('hex');

const REPORT_REASONS = {
  copyright: 'Copyright infringement / I own this',
  stolen: 'Paid or leaked asset re-uploaded',
  malware: 'Malware, cracked software or executables',
  inappropriate: 'Inappropriate or harmful content',
  broken: 'Broken or mislabeled file',
  spam: 'Spam or misleading',
  other: 'Something else',
};
const SORTS = { new: 'Newest', trending: 'Trending', downloads: 'Most downloaded' };

function parseAssetFields(body = {}) {
  const errors = {};
  const v = {};
  v.title = String(body.title || '').replace(/\s+/g, ' ').trim().slice(0, 100);
  if (v.title.length < 3) errors.title = 'Give it a title (at least 3 characters).';
  v.description = String(body.description || '').replace(/\r\n?/g, '\n').trim().slice(0, 5000);
  v.category = String(body.category || '');
  if (!CATEGORY_MAP[v.category]) errors.category = 'Pick a category.';
  const sw = Array.isArray(body.software) ? body.software : (body.software ? [body.software] : []);
  v.software = [...new Set(sw.map(String).filter((s) => SOFTWARE_MAP[s]))];
  const tags = Array.isArray(body.tags) ? body.tags.join(',') : String(body.tags || '');
  v.tags = [...new Set(tags.split(/[,#\n]/)
    .map((t) => t.toLowerCase().replace(/[^\p{L}\p{N} -]/gu, '').replace(/\s+/g, ' ').trim().slice(0, 32))
    .filter((t) => t.length >= 2))].slice(0, 15);
  v.license = String(body.license || '');
  if (!LICENSE_MAP[v.license]) errors.license = 'Choose a license.';
  v.visibility = body.visibility === 'unlisted' ? 'unlisted' : 'public';
  return { values: v, errors };
}

// Link settings: expiry, download limit and password. Shared by create and edit.
//   expiresIn     minutes from now (1 to a year); "" or 0 means the link never expires
//   maxDownloads  stop after this many downloads; "" means no limit
//   password      4 to 200 characters; empty means no password (or keep the current one when editing)
function parseLinkSettings(body = {}, { editing = false } = {}) {
  const errors = {};
  const out = {};
  const keepExpiry = editing && (body.expiry === 'keep' || (body.expiry === undefined && body.expiresIn === undefined));
  if (!keepExpiry) {
    const raw = body.expiresIn === undefined || body.expiresIn === null ? '' : String(body.expiresIn).trim();
    if (body.expiry === 'after' && (raw === '' || raw === '0')) errors.expiresIn = 'Enter how long the link should last.';
    else if (raw === '' || raw === '0' || body.expiry === 'never') out.expiresAt = null;
    else {
      const minutes = Number(raw);
      if (!Number.isInteger(minutes) || minutes < 1 || minutes > MAX_EXPIRY_MINUTES) errors.expiresIn = 'Choose an expiry between 1 minute and 365 days.';
      else out.expiresAt = Date.now() + minutes * 60 * 1000;
    }
  }
  if (body.maxDownloads !== undefined) {
    const raw = String(body.maxDownloads ?? '').trim();
    if (raw === '' || raw === '0') out.maxDownloads = null;
    else {
      const n = Number(raw);
      if (!Number.isInteger(n) || n < 1 || n > 1000000) errors.maxDownloads = 'Use a whole number from 1 to 1,000,000.';
      else out.maxDownloads = n;
    }
  }
  const password = String(body.password || '');
  if (password) {
    if (password.length < 4) errors.password = 'Use at least 4 characters.';
    else if (password.length > 200) errors.password = 'That password is too long.';
    else out.password = password;
  } else if (editing && body.removePassword) out.password = null;
  return { values: out, errors };
}

function readFilters(query) {
  const pick = (v, map) => (typeof v === 'string' && map[v] ? v : '');
  return {
    q: typeof query.q === 'string' ? query.q.trim().slice(0, 100) : '',
    category: pick(query.category, CATEGORY_MAP),
    software: pick(query.software, SOFTWARE_MAP),
    license: pick(query.license, LICENSE_MAP),
    kind: pick(query.kind, KINDS),
    tag: typeof query.tag === 'string' ? query.tag.trim().toLowerCase().slice(0, 32) : '',
    commercial: query.commercial === '1' || query.commercial === 'true',
    noAttribution: query.noattr === '1' || query.noattr === 'true',
    sort: pick(query.sort, SORTS) || 'new',
    page: Math.min(Math.max(parseInt(query.page, 10) || 1, 1), 1000),
  };
}

const numberHint = (n, max) => {
  const v = Number(n);
  return Number.isFinite(v) && v > 0 && v < max ? v : null;
};

module.exports = function assetRoutes(app, ctx) {
  const { models, storage, media, rate, requireUser, config, cookieBase } = ctx;

  // "Unlocked" proof for password-protected assets: an HMAC of the slug and the current password
  // hash, so changing the password locks everyone out again.
  const unlockCookie = (row) => `ul_${row.slug}`;
  const unlockValue = (row) => crypto.createHmac('sha256', config.storageSecret).update(`${row.slug}:${row.password_hash}`).digest('base64url');
  const isUnlocked = (req, row) => !row.password_hash || safeEqual(req.cookies[unlockCookie(row)], unlockValue(row));
  // The private manage key that anonymous uploaders (or anyone they share it with) edit and delete with.
  const manageKeyOf = (req) => String(req.get('x-manage-key') || req.query.key || (req.body && req.body.manageKey) || '');
  const hasManageKey = (req, row) => !!row.manage_hash && manageKeyOf(req).length > 10 && safeEqual(sha(manageKeyOf(req)), row.manage_hash);

  // ---- Listing ---------------------------------------------------------------------

  app.get('/api/home', async (req, res) => {
    const [fresh, trending] = await Promise.all([
      models.assets.list({ perPage: 12 }),
      models.assets.list({ sort: 'trending', perPage: 8 }),
    ]);
    const creators = await Promise.all((await models.users.topCreators(6)).map(async (u) => ({
      username: u.username, display_name: u.display_name, avatar_url: await ctx.avatarUrl(u.avatar_key),
      uploads: Number(u.uploads), downloads: Number(u.downloads),
    })));
    res.ok({ stats: await models.assets.siteStats(), categories: await models.assets.categoryCounts(), fresh: fresh.items, trending: trending.items, creators });
  });

  app.get('/api/assets', async (req, res) => {
    const filters = readFilters(req.query);
    const result = await models.assets.list({ ...filters, perPage: 24 });
    res.ok({ filters, result, sorts: SORTS, categories: await models.assets.categoryCounts() });
  });

  // ---- One asset -------------------------------------------------------------------

  // Loads an asset the current user may see. Sends the error response itself when not.
  async function load(req, res, { allowRemoved = false } = {}) {
    const row = await models.assets.rowBySlug(req.params.slug);
    if (!row) { res.fail(404, 'This asset doesn’t exist. Double-check the link.'); return null; }
    const owner = !!(req.user && req.user.id === row.user_id && !row.user_is_system) || hasManageKey(req, row);
    const canEdit = owner || ctx.isAdmin(req);
    const hidden = row.status !== 'active' || row.user_banned;
    if (hidden && !ctx.isAdmin(req) && !(allowRemoved && owner && !row.user_banned)) {
      res.status(410).json({ ok: false, removed: true, error: 'This asset was removed.', asset: { title: row.title, removed_reason: row.removed_reason } });
      return null;
    }
    const expired = isExpired(row);
    if (expired && !canEdit) {
      const error = expired === 'limit' ? 'This link has reached its download limit.' : 'This link has expired.';
      res.status(410).json({ ok: false, expired, error, asset: { title: row.title } });
      return null;
    }
    return { row, owner, canEdit, unlocked: canEdit || isUnlocked(req, row) };
  }

  app.get('/api/assets/:slug', async (req, res) => {
    const found = await load(req, res, { allowRemoved: true });
    if (!found) return;
    const { row, owner, canEdit, unlocked } = found;
    if (req.query.view === '1' && !owner && row.status === 'active' && !ctx.seenView(`${req.clientIp}|${row.id}`)) {
      await models.assets.addView(row.id);
      row.views++;
    }
    const [asset, more, related] = await Promise.all([
      models.assets.serialize(row),
      models.assets.list({ userId: row.user_id, excludeId: row.id, perPage: 4 }),
      models.assets.list({ category: row.category, excludeId: row.id, perPage: 8, sort: 'trending' }),
    ]);
    if (row.status !== 'active' && !ctx.isAdmin(req)) ctx.hideMedia(asset);
    // A locked asset shows nothing of its content until the password is entered.
    if (!unlocked) ctx.hideMedia(asset);
    res.ok({
      asset: {
        ...asset, isOwner: owner, canEdit, unlocked,
        downloads_left: row.max_downloads ? Math.max(0, Number(row.max_downloads) - Number(row.downloads)) : null,
      },
      more: more.items,
      related: related.items.filter((r) => r.user_id !== row.user_id).slice(0, 4),
      saved: req.user ? await models.favorites.has(req.user.id, row.id) : false,
      shareUrl: ctx.absolute(req, `/a/${row.slug}`),
      reasons: REPORT_REASONS,
    });
  });

  // Counts the download, then sends the browser straight to storage.
  app.get('/api/assets/:slug/download', async (req, res) => {
    const found = await load(req, res);
    if (!found) return;
    const { row, unlocked } = found;
    if (!unlocked) return res.status(403).json({ ok: false, locked: true, error: 'This file is password protected. Enter the password first.' });
    const range = req.get('range');
    if ((!range || /^bytes=0-/.test(range)) && !ctx.seenDownload(`${req.clientIp}|${row.id}`)) await models.assets.addDownload(row.id);
    const url = await storage.urlFor(row.file_key, { kind: 'download', attachment: true, filename: row.file_name, contentType: 'application/octet-stream', ttl: 6 * 3600 });
    res.redirect(302, url);
  });

  app.post('/api/assets/:slug/unlock', rate('unlock', 20, 15 * 60 * 1000), async (req, res) => {
    const found = await load(req, res);
    if (!found) return undefined;
    const { row } = found;
    if (!row.password_hash) return res.ok({ message: 'This file isn’t locked.' });
    if (!(await verifyPassword(String(req.body.password || ''), row.password_hash))) {
      return res.fail(400, 'Wrong password.', { password: 'Wrong password. Try again.' });
    }
    res.cookie(unlockCookie(row), unlockValue(row), { ...cookieBase, maxAge: 12 * 3600 * 1000 });
    return res.ok({ message: 'Unlocked. You can download it now.' });
  });

  // ---- Create & edit -----------------------------------------------------------------

  app.post('/api/assets', ctx.uploader, rate('upload', 60, 3600 * 1000), async (req, res) => {
    const b = req.body;
    const { values, errors } = parseAssetFields(b);
    const link = parseLinkSettings(b);
    Object.assign(errors, link.errors);
    if (!b.rights) errors.rights = 'Please confirm you have the right to share this.';
    const ids = b.uploads || {};
    if (!ids.file) errors.file = 'Choose a file to upload.';
    if (Object.keys(errors).length) return res.fail(400, 'Check the highlighted fields.', errors);

    const { files, errors: fileErrors } = await ctx.claimUploads(req.uploader, ids, req.anonHash);
    if (Object.keys(fileErrors).length) return res.fail(400, Object.values(fileErrors)[0], fileErrors);

    const anonymous = !req.user;
    const manageKey = anonymous ? crypto.randomBytes(18).toString('base64url') : null;
    const f = files.file.upload;
    const kind = FILE_TYPES[f.ext].kind;
    const created = await models.assets.create({
      ...values,
      userId: req.uploader.id,
      passwordHash: link.values.password ? await hashPassword(link.values.password) : null,
      expiresAt: link.values.expiresAt || null,
      maxDownloads: link.values.maxDownloads || null,
      manageHash: manageKey ? sha(manageKey) : null,
      fileName: f.file_name, fileKey: f.key, fileSize: f.size, fileExt: f.ext, fileKind: kind,
      previewKey: files.preview && files.preview.upload.key,
      previewExt: files.preview && files.preview.sniffed,
      thumbKey: files.thumbnail && files.thumbnail.upload.key,
      width: Math.round(numberHint(b.width, 100000)) || null,
      height: Math.round(numberHint(b.height, 100000)) || null,
      duration: numberHint(b.duration, 7 * 86400),
      mediaStatus: media.needsMedia(kind) ? 'pending' : 'none',
    });
    await ctx.releaseUploads(files);
    media.enqueue(created.id);
    return res.ok({
      slug: created.slug, url: `/a/${created.slug}`, shareUrl: ctx.absolute(req, `/a/${created.slug}`),
      ...(manageKey ? { manageKey, manageUrl: ctx.absolute(req, `/a/${created.slug}?key=${manageKey}`) } : {}),
    }, 201);
  });

  const editable = async (req, res) => {
    const found = await load(req, res, { allowRemoved: true });
    if (!found) return null;
    if (!found.canEdit) { res.fail(403, 'Only the uploader can change this asset.'); return null; }
    return found.row;
  };

  app.post('/api/assets/:slug/edit', ctx.uploader, rate('edit', 120, 3600 * 1000), async (req, res) => {
    const old = await editable(req, res);
    if (!old) return undefined;
    const b = req.body;
    const { values, errors } = parseAssetFields(b);
    const link = parseLinkSettings(b, { editing: true });
    Object.assign(errors, link.errors);
    if (Object.keys(errors).length) return res.fail(400, 'Check the highlighted fields.', errors);

    // New files are claimed as the asset's own account (the anonymous account for anonymous uploads).
    const owner = req.user && req.user.id === old.user_id ? req.user : await models.users.byId(old.user_id);
    const { files, errors: fileErrors } = await ctx.claimUploads(owner, b.uploads || {}, req.anonHash);
    if (Object.keys(fileErrors).length) return res.fail(400, Object.values(fileErrors)[0], fileErrors);

    const garbage = [];
    const set = {};
    if ('expiresAt' in link.values) set.expires_at = link.values.expiresAt;
    if ('maxDownloads' in link.values) set.max_downloads = link.values.maxDownloads;
    if ('password' in link.values) set.password_hash = link.values.password ? await hashPassword(link.values.password) : null;
    if (files.file) {
      const f = files.file.upload;
      Object.assign(set, {
        file_key: f.key, file_name: f.file_name, file_size: f.size, file_ext: f.ext, file_kind: FILE_TYPES[f.ext].kind, file_sha256: '',
        width: Math.round(numberHint(b.width, 100000)) || null,
        height: Math.round(numberHint(b.height, 100000)) || null,
        duration: numberHint(b.duration, 7 * 86400),
      });
      garbage.push(old.file_key);
      // Generated media belongs to the old file; drop it unless the user wants to keep it.
      if (!files.thumbnail && old.thumb_key && !b.keepThumb) { set.thumb_key = null; garbage.push(old.thumb_key); }
      if (!files.preview && old.preview_key && !b.keepPreview) { set.preview_key = null; set.preview_ext = null; garbage.push(old.preview_key); }
    }
    if (files.thumbnail) {
      set.thumb_key = files.thumbnail.upload.key;
      if (old.thumb_key) garbage.push(old.thumb_key);
    } else if (b.removeThumb && old.thumb_key && !('thumb_key' in set)) {
      set.thumb_key = null; garbage.push(old.thumb_key);
    }
    if (files.preview) {
      set.preview_key = files.preview.upload.key;
      set.preview_ext = files.preview.sniffed;
      if (old.preview_key) garbage.push(old.preview_key);
    } else if (b.removePreview && old.preview_key && !('preview_key' in set)) {
      set.preview_key = null; set.preview_ext = null; garbage.push(old.preview_key);
    }
    const kind = set.file_kind || old.file_kind;
    const reprocess = media.needsMedia(kind) && (files.file || set.thumb_key === null || set.preview_key === null);
    if (reprocess) set.media_status = 'pending';

    await models.assets.update(old.id, values);
    await models.assets.setFields(old.id, set);
    await ctx.releaseUploads(files);
    for (const k of new Set(garbage)) await storage.remove(k);
    if (files.file || reprocess) media.enqueue(old.id);

    return res.ok({
      url: `/a/${old.slug}`,
      message: files.file ? 'New version uploaded. The share link stays the same.' : 'Changes saved.',
    });
  });

  app.post('/api/assets/:slug/delete', async (req, res) => {
    const row = await editable(req, res);
    if (!row) return undefined;
    await models.assets.remove(row.id);
    for (const k of [row.file_key, row.preview_key, row.thumb_key]) await storage.remove(k);
    const own = req.user && req.user.id === row.user_id;
    const redirect = own ? '/dashboard' : ctx.isAdmin(req) ? '/admin?tab=assets' : '/';
    return res.ok({ message: `“${row.title}” was deleted.`, redirect });
  });

  // ---- Saves & reports -----------------------------------------------------------------

  app.post('/api/assets/:slug/save', requireUser, rate('save', 300, 3600 * 1000), async (req, res) => {
    const found = await load(req, res);
    if (!found) return undefined;
    const saved = await models.favorites.toggle(req.user.id, found.row.id);
    return res.ok({ saved, count: await models.favorites.count(found.row.id), message: saved ? 'Saved.' : 'Removed from your saved assets.' });
  });

  app.post('/api/assets/:slug/report', rate('report', 15, 3600 * 1000), async (req, res) => {
    const found = await load(req, res);
    if (!found) return undefined;
    const b = req.body;
    const values = {
      reason: String(b.reason || ''),
      details: String(b.details || '').trim().slice(0, 3000),
      contact: String(b.contact || '').trim().slice(0, 200),
    };
    const errors = {};
    if (!REPORT_REASONS[values.reason]) errors.reason = 'Choose a reason.';
    if (values.reason === 'copyright' && (!values.contact || values.details.length < 20)) {
      errors.details = 'For copyright claims, describe the original work (a link helps) and leave a way to contact you.';
    }
    if (Object.keys(errors).length) return res.fail(400, 'Check the highlighted fields.', errors);
    await models.reports.create({ assetId: found.row.id, reporterId: req.user && req.user.id, ...values });
    return res.ok({ message: 'Thanks for the report. A moderator will review it soon.' });
  });

  ctx.hideMedia = (a) => Object.assign(a, { thumbUrl: null, videoSrc: null, audioSrc: null, imageSrc: null });
  ctx.REPORT_REASONS = REPORT_REASONS;
  ctx.SORTS = SORTS;
};

module.exports.parseAssetFields = parseAssetFields;
module.exports.parseLinkSettings = parseLinkSettings;
module.exports.readFilters = readFilters;
module.exports.REPORT_REASONS = REPORT_REASONS;
