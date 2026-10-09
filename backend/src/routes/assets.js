'use strict';
const fsp = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const multer = require('multer');
const {
  FILE_TYPES, PREVIEW_EXTS, THUMB_EXTS, CATEGORY_MAP, SOFTWARE_MAP, LICENSE_MAP, extOf,
} = require('../catalog');
const { sha256File, sniff } = require('../storage');
const { formatBytes } = require('../html');

const MB = 1024 * 1024;
const MEDIA_MIME = { png: 'image/png', jpg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp', mp4: 'video/mp4', webm: 'video/webm', mp3: 'audio/mpeg' };
const REPORT_REASONS = {
  copyright: 'Copyright infringement / I own this',
  stolen: 'Paid or leaked asset re-uploaded',
  malware: 'Malware, cracked software or executables',
  inappropriate: 'Inappropriate or harmful content',
  broken: 'Broken or mislabeled file',
  spam: 'Spam or misleading',
  other: 'Something else',
};

class UploadError extends Error {
  constructor(field, message) { super(message); this.field = field; }
}

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
  v.tags = [...new Set(String(body.tags || '').split(/[,#\n]/)
    .map((t) => t.toLowerCase().replace(/[^\p{L}\p{N} -]/gu, '').replace(/\s+/g, ' ').trim().slice(0, 32))
    .filter((t) => t.length >= 2))].slice(0, 15);
  v.license = String(body.license || '');
  if (!LICENSE_MAP[v.license]) errors.license = 'Choose a license.';
  v.visibility = body.visibility === 'unlisted' ? 'unlisted' : 'public';
  return { values: v, errors };
}

function sanitizeFileName(name) {
  const base = path.basename(String(name || 'file')).replace(/[\u0000-\u001f\u007f"\\/<>:|?*]/g, '_').trim() || 'file';
  if (base.length <= 150) return base;
  const ext = extOf(base);
  return `${base.slice(0, 140)}${ext ? `.${ext}` : ''}`;
}

const numberHint = (n, max) => {
  const v = Number(n);
  return Number.isFinite(v) && v > 0 && v < max ? v : null;
};

module.exports = function assetRoutes(app, ctx) {
  const { views, models, config, storage, media, rate, requireUser } = ctx;
  const maxUpload = config.maxUploadMB * MB;
  const maxPreview = config.maxPreviewMB * MB;
  const quota = config.userQuotaMB * MB;
  const isAdmin = (req) => req.user && req.user.role === 'admin';

  const multipart = multer({
    storage: multer.diskStorage({
      destination: config.tmpDir,
      filename: (req, file, cb) => cb(null, `up-${crypto.randomBytes(12).toString('hex')}`),
    }),
    limits: { fileSize: maxUpload, files: 3, fields: 60, fieldSize: 64 * 1024, parts: 70 },
    fileFilter(req, file, cb) {
      const ext = extOf(file.originalname);
      if (file.fieldname === 'file') {
        if (!FILE_TYPES[ext]) {
          return cb(new UploadError('file', ext
            ? `.${ext} files aren’t accepted. Zip it up, or see the guidelines for supported formats.`
            : 'That file has no extension. Add one (e.g. .mp4, .zip) and try again.'));
        }
      } else if (file.fieldname === 'preview') {
        if (!PREVIEW_EXTS.includes(ext)) return cb(new UploadError('preview', 'Previews must be MP4, WebM, MOV, PNG, JPG, GIF or WebP.'));
      } else if (file.fieldname === 'thumbnail') {
        if (!THUMB_EXTS.includes(ext)) return cb(new UploadError('thumbnail', 'Thumbnails must be PNG, JPG, WebP or GIF.'));
      } else {
        return cb(new UploadError('file', 'Unexpected file field.'));
      }
      return cb(null, true);
    },
  }).fields([{ name: 'file', maxCount: 1 }, { name: 'preview', maxCount: 1 }, { name: 'thumbnail', maxCount: 1 }]);

  // Wraps multer so its errors become friendly form errors.
  const parseMultipart = (formView) => (req, res, next) => {
    multipart(req, res, (err) => {
      if (!err) return next();
      let field = 'file';
      let message;
      if (err instanceof UploadError) ({ field, message } = err);
      else if (err instanceof multer.MulterError) {
        field = err.field || 'file';
        message = err.code === 'LIMIT_FILE_SIZE'
          ? `That file is too large. The limit is ${formatBytes(maxUpload)} per file.`
          : 'That upload couldn’t be processed. Please try again.';
      } else return next(err);
      return formView(req, res, { [field]: message }, err.code === 'LIMIT_FILE_SIZE' ? 413 : 400);
    });
  };

  // Rejects obviously-too-large requests before reading the body.
  function precheck(req, res, next) {
    const len = Number(req.get('content-length')) || 0;
    if (len > maxUpload + maxPreview + 20 * MB) {
      return res.fail(413, 'Too large', `That upload is too large. The limit is ${formatBytes(maxUpload)} per file.`);
    }
    if (req.path === '/upload' && len && models.users.storageUsed(req.user.id) + len > quota + 20 * MB) {
      return res.fail(413, 'Storage full', `You’ve reached your ${formatBytes(quota)} storage limit. Delete old uploads to make room.`);
    }
    return next();
  }

  // Validates & stores uploaded files. Returns { stored, errors }.
  async function ingest(req, { requireMain, replacingSize = 0 }) {
    const files = req.files || {};
    const main = files.file && files.file[0];
    const preview = files.preview && files.preview[0];
    const thumb = files.thumbnail && files.thumbnail[0];
    const temps = [main, preview, thumb].filter(Boolean).map((f) => f.path);
    const cleanup = () => Promise.all(temps.map((p) => fsp.unlink(p).catch(() => {})));
    const errors = {};
    const out = {};

    if (requireMain && !main) errors.file = 'Choose a file to upload.';
    if (main && main.size === 0) errors.file = 'That file is empty.';
    if (main && !errors.file) {
      const used = models.users.storageUsed(req.user.id) - replacingSize;
      if (used + main.size > quota) errors.file = `This would exceed your ${formatBytes(quota)} storage limit.`;
    }
    if (preview) {
      if (preview.size > maxPreview) errors.preview = `Previews can be up to ${formatBytes(maxPreview)}.`;
      else {
        out.previewExt = await sniff(preview.path);
        if (!out.previewExt) errors.preview = 'That preview doesn’t look like a valid image or video file.';
      }
    }
    if (thumb) {
      const kind = thumb.size <= 15 * MB ? await sniff(thumb.path) : null;
      if (!['png', 'jpg', 'gif', 'webp'].includes(kind)) errors.thumbnail = 'Thumbnails must be a PNG, JPG, WebP or GIF under 15 MB.';
      else out.thumbExt = kind;
    }
    if (main && !errors.file) {
      out.sha256 = await sha256File(main.path);
      if (models.assets.isBlockedHash(out.sha256)) errors.file = 'This exact file was removed from the site before and can’t be uploaded again.';
    }
    if (Object.keys(errors).length) { await cleanup(); return { errors }; }

    const stored = [];
    try {
      if (main) {
        const ext = extOf(main.originalname);
        out.fileKey = await storage.moveIn(main.path, ext);
        stored.push(out.fileKey);
        Object.assign(out, { fileName: sanitizeFileName(main.originalname), fileSize: main.size, fileExt: ext, fileKind: FILE_TYPES[ext].kind });
      }
      if (preview) { out.previewKey = await storage.moveIn(preview.path, out.previewExt); stored.push(out.previewKey); }
      if (thumb) { out.thumbKey = await storage.moveIn(thumb.path, out.thumbExt); stored.push(out.thumbKey); }
    } catch (err) {
      await cleanup();
      await Promise.all(stored.map((k) => storage.remove(k)));
      throw err;
    }
    out.rollback = () => Promise.all(stored.map((k) => storage.remove(k)));
    return { stored: out, errors: null };
  }

  async function discardTemps(req) {
    const files = Object.values(req.files || {}).flat();
    await Promise.all(files.map((f) => fsp.unlink(f.path).catch(() => {})));
  }

  // ---- Upload ----------------------------------------------------------------

  const uploadForm = (req, res, errors = {}, status = 200, values = null) => {
    if (ctx.wantsJson(req) && status >= 400) return res.status(status).json({ ok: false, errors });
    const used = models.users.storageUsed(req.user.id);
    return res.view(views.upload, {
      values: values || { license: 'free', visibility: 'public', software: [] }, errors,
      limits: { maxUpload, maxPreview, quota, used },
    }, status);
  };

  app.get('/upload', requireUser, (req, res) => uploadForm(req, res));

  app.post('/upload', requireUser, rate('upload', 40, 3600 * 1000), precheck, parseMultipart(uploadForm), async (req, res) => {
    if (req.csrfDeferred && !ctx.checkCsrf(req)) {
      await discardTemps(req);
      return res.fail(403, 'Session expired', 'Your form expired. Refresh the page and try again.');
    }
    const { values, errors } = parseAssetFields(req.body);
    if (!req.body || !req.body.rights) errors.rights = 'Please confirm you have the right to share this.';
    if (Object.keys(errors).length) {
      await discardTemps(req);
      return uploadForm(req, res, errors, 400, values);
    }
    const { stored, errors: fileErrors } = await ingest(req, { requireMain: true });
    if (fileErrors) return uploadForm(req, res, fileErrors, 400, values);

    const mediaStatus = media.needsWork(stored.fileKind) ? 'pending' : 'none';
    let created;
    try {
      created = models.assets.create({
        ...values, ...stored, userId: req.user.id, mediaStatus,
        width: Math.round(numberHint(req.body.width, 100000)) || null,
        height: Math.round(numberHint(req.body.height, 100000)) || null,
        duration: numberHint(req.body.duration, 7 * 86400),
      });
    } catch (err) {
      await stored.rollback();
      throw err;
    }
    if (mediaStatus === 'pending') media.enqueue(created.id);

    const url = `/a/${created.slug}`;
    res.flash('success', values.visibility === 'unlisted'
      ? 'Uploaded! It’s unlisted, so only people with the link can find it. Copy the link below to share.'
      : 'Uploaded! Your asset is live. Copy the link below to share it.');
    if (ctx.wantsJson(req)) return res.status(201).json({ ok: true, url, shareUrl: ctx.absolute(req, url) });
    return res.redirect(303, url);
  });

  // ---- Viewing ---------------------------------------------------------------

  function loadAsset(req, res, { allowRemoved = false } = {}) {
    const a = models.assets.bySlug(req.params.slug);
    if (!a) { res.fail(404, 'Asset not found', 'This asset doesn’t exist. Double-check the link.'); return null; }
    const owner = req.user && req.user.id === a.user_id;
    const hidden = a.status !== 'active' || a.user_banned;
    if (hidden && !isAdmin(req) && !(allowRemoved && owner && !a.user_banned)) {
      res.view(views.removed, { asset: a }, 410);
      return null;
    }
    a.isOwner = owner;
    a.canEdit = owner || isAdmin(req);
    return a;
  }

  app.get('/a/:slug', (req, res) => {
    const a = loadAsset(req, res, { allowRemoved: true });
    if (!a) return;
    if (!a.isOwner && a.status === 'active' && !ctx.seenView(`${req.ip}|${a.id}`)) { models.assets.addView(a.id); a.views++; }
    const more = models.assets.list({ userId: a.user_id, excludeId: a.id, perPage: 4 }).items;
    const related = models.assets.list({ category: a.category.id, excludeId: a.id, perPage: 8, sort: 'trending' }).items
      .filter((r) => r.user_id !== a.user_id).slice(0, 4);
    if (a.visibility === 'unlisted') res.setHeader('X-Robots-Tag', 'noindex');
    res.view(views.asset, {
      asset: a, more, related,
      saved: req.user ? models.favorites.has(req.user.id, a.id) : false,
      shareUrl: ctx.absolute(req, a.url),
      reasons: REPORT_REASONS,
    });
  });

  app.get('/a/:slug/download', (req, res, next) => {
    const a = loadAsset(req, res);
    if (!a) return;
    const range = req.get('range');
    if ((!range || /^bytes=0-/.test(range)) && !ctx.seenDownload(`${req.ip}|${a.id}`)) models.assets.addDownload(a.id);
    res.download(storage.abs(a.file_key), a.file_name, {
      headers: {
        'Content-Type': 'application/octet-stream',
        'Content-Security-Policy': "default-src 'none'; sandbox",
        'Cache-Control': 'private, no-transform',
        'X-Robots-Tag': 'noindex',
      },
    }, (err) => { if (err && !res.headersSent) next(err); });
  });

  app.get('/m/:slug/:which', (req, res, next) => {
    const a = models.assets.bySlug(req.params.slug);
    const owner = a && req.user && req.user.id === a.user_id;
    if (!a || ((a.status !== 'active' || a.user_banned) && !isAdmin(req) && !owner)) return res.status(404).end();
    let key = null;
    let mime = null;
    if (req.params.which === 'thumb' && a.thumb_key) { key = a.thumb_key; mime = MEDIA_MIME[extOf(key)]; }
    else if (req.params.which === 'preview' && a.preview_key) { key = a.preview_key; mime = MEDIA_MIME[a.preview_ext]; }
    else if (req.params.which === 'file' && FILE_TYPES[a.file_ext] && FILE_TYPES[a.file_ext].inline) { key = a.file_key; mime = FILE_TYPES[a.file_ext].mime; }
    if (!key || !mime) return res.status(404).end();
    return res.sendFile(storage.abs(key), {
      headers: {
        'Content-Type': mime,
        'Content-Disposition': 'inline',
        'Content-Security-Policy': "default-src 'none'; sandbox",
        'Cache-Control': req.query.v ? 'public, max-age=31536000, immutable' : 'public, max-age=3600',
        'X-Robots-Tag': 'noindex',
      },
    }, (err) => { if (err && !res.headersSent) { if (err.code === 'ENOENT') res.status(404).end(); else next(err); } });
  });

  // ---- Editing ---------------------------------------------------------------

  const editForm = (req, res, errors = {}, status = 200, values = null) => {
    if (ctx.wantsJson(req) && status >= 400) return res.status(status).json({ ok: false, errors });
    const a = req.asset;
    return res.view(views.editAsset, {
      asset: a, errors,
      values: values || {
        title: a.title, description: a.description, category: a.category.id, software: a.software.map((s) => s.id),
        tags: a.tags.join(', '), license: a.license.id, visibility: a.visibility,
      },
      limits: { maxUpload, maxPreview },
    }, status);
  };

  const loadEditable = (req, res, next) => {
    const a = loadAsset(req, res, { allowRemoved: true });
    if (!a) return undefined;
    if (!a.canEdit) return res.fail(403, 'Not yours', 'Only the uploader can edit this asset.');
    req.asset = a;
    return next();
  };

  app.get('/a/:slug/edit', requireUser, loadEditable, (req, res) => editForm(req, res));

  app.post('/a/:slug/edit', requireUser, loadEditable, rate('edit', 120, 3600 * 1000), precheck, parseMultipart(editForm), async (req, res) => {
    if (req.csrfDeferred && !ctx.checkCsrf(req)) {
      await discardTemps(req);
      return res.fail(403, 'Session expired', 'Your form expired. Refresh the page and try again.');
    }
    const a = req.asset;
    const { values, errors } = parseAssetFields(req.body);
    if (Object.keys(errors).length) {
      await discardTemps(req);
      return editForm(req, res, errors, 400, { ...values, tags: values.tags.join(', ') });
    }
    const { stored, errors: fileErrors } = await ingest(req, { requireMain: false, replacingSize: a.file_size });
    if (fileErrors) return editForm(req, res, fileErrors, 400, { ...values, tags: values.tags.join(', ') });

    const old = models.assets.rawById(a.id);
    const garbage = [];
    const mediaFields = {};
    if (stored.fileKey) {
      Object.assign(mediaFields, {
        file_key: stored.fileKey, file_name: stored.fileName, file_size: stored.fileSize, file_ext: stored.fileExt,
        file_kind: stored.fileKind, file_sha256: stored.sha256,
        width: Math.round(numberHint(req.body.width, 100000)) || null,
        height: Math.round(numberHint(req.body.height, 100000)) || null,
        duration: numberHint(req.body.duration, 7 * 86400),
      });
      garbage.push(old.file_key);
      // Generated media belongs to the old file; drop it unless replaced explicitly below.
      if (!stored.thumbKey && old.thumb_key && req.body.keep_thumb !== 'on') { mediaFields.thumb_key = null; garbage.push(old.thumb_key); }
      if (!stored.previewKey && old.preview_key && req.body.keep_preview !== 'on') { mediaFields.preview_key = null; mediaFields.preview_ext = null; garbage.push(old.preview_key); }
    }
    if (stored.thumbKey) { mediaFields.thumb_key = stored.thumbKey; if (old.thumb_key) garbage.push(old.thumb_key); }
    if (stored.previewKey) {
      mediaFields.preview_key = stored.previewKey;
      mediaFields.preview_ext = stored.previewExt;
      if (old.preview_key) garbage.push(old.preview_key);
    } else if (req.body.remove_preview === 'on' && old.preview_key && !('preview_key' in mediaFields)) {
      mediaFields.preview_key = null; mediaFields.preview_ext = null; garbage.push(old.preview_key);
    }
    if (req.body.remove_thumb === 'on' && !stored.thumbKey && old.thumb_key && !('thumb_key' in mediaFields)) {
      mediaFields.thumb_key = null; garbage.push(old.thumb_key);
    }
    const kind = stored.fileKind || old.file_kind;
    const reprocess = media.needsWork(kind) && (stored.fileKey || mediaFields.thumb_key === null || mediaFields.preview_key === null);
    if (reprocess) mediaFields.media_status = 'pending';

    try {
      models.assets.update(a.id, values);
      models.assets.setMedia(a.id, mediaFields);
    } catch (err) {
      await stored.rollback();
      throw err;
    }
    await Promise.all([...new Set(garbage)].map((k) => storage.remove(k)));
    if (reprocess) media.enqueue(a.id);

    res.flash('success', stored.fileKey ? 'New version uploaded. Your share link stays the same.' : 'Changes saved.');
    if (ctx.wantsJson(req)) return res.json({ ok: true, url: a.url });
    return res.redirect(303, a.url);
  });

  app.post('/a/:slug/delete', requireUser, loadEditable, async (req, res) => {
    const a = models.assets.rawById(req.asset.id);
    models.assets.remove(a.id);
    await Promise.all([a.file_key, a.preview_key, a.thumb_key].map((k) => storage.remove(k)));
    res.flash('success', `“${a.title}” was deleted.`);
    return res.redirect(303, req.asset.isOwner ? '/dashboard' : '/admin?tab=assets');
  });

  // ---- Favorites & reports ------------------------------------------------------

  app.post('/a/:slug/save', requireUser, rate('save', 300, 3600 * 1000), (req, res) => {
    const a = loadAsset(req, res);
    if (!a) return undefined;
    const saved = models.favorites.toggle(req.user.id, a.id);
    if (ctx.wantsJson(req)) return res.json({ ok: true, saved, count: models.favorites.count(a.id) });
    res.flash('success', saved ? 'Saved to your collection.' : 'Removed from your saved assets.');
    return res.redirect(303, a.url);
  });

  app.get('/a/:slug/report', (req, res) => {
    const a = loadAsset(req, res);
    if (!a) return undefined;
    return res.view(views.report, { asset: a, reasons: REPORT_REASONS, values: { reason: req.query.reason }, errors: {} });
  });

  app.post('/a/:slug/report', rate('report', 15, 3600 * 1000), (req, res) => {
    const a = loadAsset(req, res);
    if (!a) return undefined;
    const b = req.body || {};
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
    if (Object.keys(errors).length) return res.view(views.report, { asset: a, reasons: REPORT_REASONS, values, errors }, 400);
    models.reports.create({ assetId: a.id, reporterId: req.user && req.user.id, ...values });
    res.flash('success', 'Thanks for the report. A moderator will review it soon.');
    return res.redirect(303, a.url);
  });

  ctx.REPORT_REASONS = REPORT_REASONS;
};

module.exports.parseAssetFields = parseAssetFields;
module.exports.sanitizeFileName = sanitizeFileName;
