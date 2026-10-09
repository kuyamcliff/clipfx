'use strict';
// Direct-to-storage uploads.
//  1. POST /api/uploads            the browser describes its files; we check type, size and quota and
//                                  answer with presigned URLs (one PUT, or one URL per part for big files).
//  2. browser → R2                 the bytes go straight to storage.
//  3. POST /api/uploads/:id/complete   (multipart only) stitch the parts together.
//  4. POST /api/assets             attach the upload IDs to a new asset (see routes/assets.js), where
//                                  each object is checked in storage before anything is saved.
const crypto = require('node:crypto');
const { FILE_TYPES, PREVIEW_EXTS, THUMB_EXTS, extOf } = require('../catalog');
const { MEDIA_MIME } = require('../models');
const { formatBytes } = require('../format');

const MAX_PARTS = 10000;

function sanitizeFileName(name) {
  const base = String(name || 'file').split(/[\\/]/).pop().replace(/[\u0000-\u001f\u007f"<>:|?*]/g, '_').trim() || 'file';
  if (base.length <= 150) return base;
  const ext = extOf(base);
  return `${base.slice(0, 140)}${ext ? `.${ext}` : ''}`;
}

module.exports = function uploadRoutes(app, ctx) {
  const { models, config, storage, rate, requireUser } = ctx;

  const FIELDS = {
    file: { prefix: 'f', max: () => config.maxUpload, allowed: (ext) => !!FILE_TYPES[ext] },
    preview: { prefix: 'p', max: () => config.maxPreview, allowed: (ext) => PREVIEW_EXTS.includes(ext) },
    thumbnail: { prefix: 't', max: () => config.maxThumb, allowed: (ext) => THUMB_EXTS.includes(ext) },
  };

  // What we tell storage the file is. Inline-safe types keep their real type; everything else is opaque.
  function contentTypeFor(field, ext) {
    if (field !== 'file') return MEDIA_MIME[ext] || (ext === 'mov' || ext === 'm4v' ? 'video/mp4' : 'application/octet-stream');
    const t = FILE_TYPES[ext];
    return t && t.inline ? t.mime : 'application/octet-stream';
  }

  app.post('/api/uploads', requireUser, rate('upload-tickets', 120, 3600 * 1000), async (req, res) => {
    const files = Array.isArray(req.body.files) ? req.body.files : [];
    if (!files.length || files.length > 3) return res.fail(400, 'Send between one and three files.');
    const errors = {};
    const seen = new Set();
    const specs = files.map((f) => {
      const field = String(f.field || '');
      const rule = FIELDS[field];
      const name = sanitizeFileName(f.name);
      const ext = extOf(name);
      const size = Number(f.size);
      if (!rule || seen.has(field)) { errors[field || 'file'] = 'Unexpected file.'; return null; }
      seen.add(field);
      if (!ext || !rule.allowed(ext)) {
        errors[field] = field === 'file'
          ? (ext ? `.${ext} files aren’t accepted. Zip it up, or check the list of formats.` : 'That file needs an extension, like .mp4 or .zip.')
          : field === 'preview' ? 'Previews must be MP4, WebM, MOV, PNG, JPG, GIF or WebP.' : 'Thumbnails must be PNG, JPG, WebP or GIF.';
        return null;
      }
      if (!Number.isInteger(size) || size <= 0) { errors[field] = 'That file is empty.'; return null; }
      if (size > rule.max()) { errors[field] = `That file is too large. The limit is ${formatBytes(rule.max())}.`; return null; }
      return { field, name, ext, size, rule };
    });
    if (Object.keys(errors).length) return res.fail(400, Object.values(errors)[0], errors);

    const total = specs.reduce((n, s) => n + s.size, 0);
    if (models.users.storageUsed(req.user.id) + total > config.userQuota) {
      return res.fail(413, `This would go over your ${formatBytes(config.userQuota)} storage limit. Delete old uploads to make room.`, { file: 'Not enough storage left.' });
    }

    const tickets = [];
    for (const s of specs) {
      const id = crypto.randomBytes(12).toString('base64url');
      const key = storage.newKey(s.rule.prefix, s.ext);
      const contentType = contentTypeFor(s.field, s.ext);
      if (s.size > config.multipartThreshold) {
        const partSize = Math.max(config.minPartSize, Math.ceil(s.size / MAX_PARTS));
        const count = Math.ceil(s.size / partSize);
        const multipartId = await storage.createMultipart(key, contentType);
        const parts = [];
        for (let n = 1; n <= count; n++) {
          const len = n < count ? partSize : s.size - partSize * (count - 1);
          parts.push({ number: n, size: len, url: await storage.presignPart(key, multipartId, n, len) });
        }
        models.uploads.create({ id, userId: req.user.id, key, field: s.field, fileName: s.name, ext: s.ext, size: s.size, contentType, multipartId, partSize });
        tickets.push({ id, field: s.field, method: 'multipart', partSize, parts });
      } else {
        const { url, headers } = await storage.presignPut(key, { contentType, contentLength: s.size });
        models.uploads.create({ id, userId: req.user.id, key, field: s.field, fileName: s.name, ext: s.ext, size: s.size, contentType });
        tickets.push({ id, field: s.field, method: 'put', url, headers });
      }
    }
    return res.ok({ uploads: tickets }, 201);
  });

  app.post('/api/uploads/:id/complete', requireUser, async (req, res) => {
    const u = models.uploads.get(req.params.id, req.user.id);
    if (!u) return res.fail(404, 'Upload not found. It may have expired; please start again.');
    if (!u.multipart_id) return res.ok();
    const parts = (Array.isArray(req.body.parts) ? req.body.parts : [])
      .map((p) => ({ number: Number(p.number), etag: String(p.etag || '') }))
      .filter((p) => Number.isInteger(p.number) && p.number > 0 && p.etag);
    const expected = Math.ceil(u.size / u.part_size);
    if (parts.length !== expected || new Set(parts.map((p) => p.number)).size !== expected) {
      return res.fail(400, 'Some parts of the upload are missing. Please try again.');
    }
    try {
      await storage.completeMultipart(u.key, u.multipart_id, parts);
    } catch (err) {
      ctx.log.warn(`[uploads] complete failed for ${u.id}: ${err.message}`);
      return res.fail(400, 'The upload couldn’t be finished. Please try again.');
    }
    models.db.prepare('UPDATE uploads SET multipart_id = NULL WHERE id = ?').run(u.id);
    return res.ok();
  });

  app.post('/api/uploads/:id/abort', requireUser, async (req, res) => {
    const u = models.uploads.get(req.params.id, req.user.id);
    if (u) {
      if (u.multipart_id) await storage.abortMultipart(u.key, u.multipart_id);
      await storage.remove(u.key);
      models.uploads.remove(u.id);
    }
    res.ok();
  });

  // Turns upload IDs into verified objects. Returns { files, errors }.
  // Every object is checked in storage: it must exist with exactly the size that was approved,
  // and inline previews/thumbnails must really be images or video (magic bytes).
  ctx.claimUploads = async function claimUploads(user, ids = {}) {
    const files = {};
    const errors = {};
    for (const field of ['file', 'preview', 'thumbnail']) {
      if (!ids[field]) continue;
      const u = models.uploads.get(ids[field], user.id);
      if (!u || u.field !== field) { errors[field] = 'That upload has expired. Please choose the file again.'; continue; }
      if (u.multipart_id) { errors[field] = 'That upload didn’t finish. Please try again.'; continue; }
      const st = await storage.stat(u.key);
      if (!st) { errors[field] = 'The file didn’t arrive. Please upload it again.'; continue; }
      if (st.size !== u.size) { errors[field] = 'The uploaded file doesn’t match what was approved. Please upload it again.'; continue; }
      let sniffed = null;
      if (field !== 'file') {
        sniffed = require('../storage').sniff(await storage.readRange(u.key, 0, 15));
        const ok = field === 'thumbnail' ? ['png', 'jpg', 'gif', 'webp'].includes(sniffed) : !!sniffed;
        if (!ok) { errors[field] = field === 'thumbnail' ? 'That thumbnail isn’t a valid image.' : 'That preview isn’t a valid image or video.'; continue; }
      }
      files[field] = { upload: u, sniffed };
    }
    return { files, errors };
  };

  // Once attached to an asset the upload row has served its purpose.
  ctx.releaseUploads = (files) => Object.values(files).forEach((f) => models.uploads.remove(f.upload.id));
  // Unused objects from a failed attempt are removed straight away.
  ctx.discardUploads = async (files) => {
    for (const f of Object.values(files)) {
      await storage.remove(f.upload.key);
      models.uploads.remove(f.upload.id);
    }
  };
};

module.exports.sanitizeFileName = sanitizeFileName;
