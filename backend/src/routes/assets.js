'use strict';
const { FILE_TYPES, CATEGORY_MAP, SOFTWARE_MAP, LICENSE_MAP, KINDS } = require('../catalog');

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
  const { models, storage, media, rate, requireUser } = ctx;

  // ---- Listing ---------------------------------------------------------------------

  app.get('/api/home', async (req, res) => {
    const [fresh, trending] = await Promise.all([
      models.assets.list({ perPage: 12 }),
      models.assets.list({ sort: 'trending', perPage: 8 }),
    ]);
    res.ok({ stats: models.assets.siteStats(), categories: models.assets.categoryCounts(), fresh: fresh.items, trending: trending.items });
  });

  app.get('/api/assets', async (req, res) => {
    const filters = readFilters(req.query);
    const result = await models.assets.list({ ...filters, perPage: 24 });
    res.ok({ filters, result, sorts: SORTS, categories: models.assets.categoryCounts() });
  });

  // ---- One asset -------------------------------------------------------------------

  // Loads an asset the current user may see. Sends the error response itself when not.
  async function load(req, res, { allowRemoved = false } = {}) {
    const row = models.assets.rowBySlug(req.params.slug);
    if (!row) { res.fail(404, 'This asset doesn’t exist. Double-check the link.'); return null; }
    const owner = !!(req.user && req.user.id === row.user_id);
    const hidden = row.status !== 'active' || row.user_banned;
    if (hidden && !ctx.isAdmin(req) && !(allowRemoved && owner && !row.user_banned)) {
      res.status(410).json({ ok: false, removed: true, error: 'This asset was removed.', asset: { title: row.title, removed_reason: row.removed_reason } });
      return null;
    }
    return { row, owner, canEdit: owner || ctx.isAdmin(req) };
  }

  app.get('/api/assets/:slug', async (req, res) => {
    const found = await load(req, res, { allowRemoved: true });
    if (!found) return;
    const { row, owner, canEdit } = found;
    if (req.query.view === '1' && !owner && row.status === 'active' && !ctx.seenView(`${req.clientIp}|${row.id}`)) {
      models.assets.addView(row.id);
      row.views++;
    }
    const [asset, more, related] = await Promise.all([
      models.assets.serialize(row),
      models.assets.list({ userId: row.user_id, excludeId: row.id, perPage: 4 }),
      models.assets.list({ category: row.category, excludeId: row.id, perPage: 8, sort: 'trending' }),
    ]);
    res.ok({
      asset: { ...asset, isOwner: owner, canEdit },
      more: more.items,
      related: related.items.filter((r) => r.user_id !== row.user_id).slice(0, 4),
      saved: req.user ? models.favorites.has(req.user.id, row.id) : false,
      shareUrl: ctx.absolute(req, `/a/${row.slug}`),
      reasons: REPORT_REASONS,
    });
  });

  // Counts the download, then sends the browser straight to storage.
  app.get('/api/assets/:slug/download', async (req, res) => {
    const found = await load(req, res);
    if (!found) return;
    const { row } = found;
    const range = req.get('range');
    if ((!range || /^bytes=0-/.test(range)) && !ctx.seenDownload(`${req.clientIp}|${row.id}`)) models.assets.addDownload(row.id);
    const url = await storage.urlFor(row.file_key, { attachment: true, filename: row.file_name, contentType: 'application/octet-stream', ttl: 6 * 3600 });
    res.redirect(302, url);
  });

  // ---- Create & edit -----------------------------------------------------------------

  app.post('/api/assets', requireUser, rate('upload', 60, 3600 * 1000), async (req, res) => {
    const b = req.body;
    const { values, errors } = parseAssetFields(b);
    if (!b.rights) errors.rights = 'Please confirm you have the right to share this.';
    const ids = b.uploads || {};
    if (!ids.file) errors.file = 'Choose a file to upload.';
    if (Object.keys(errors).length) return res.fail(400, 'Check the highlighted fields.', errors);

    const { files, errors: fileErrors } = await ctx.claimUploads(req.user, ids);
    if (Object.keys(fileErrors).length) return res.fail(400, Object.values(fileErrors)[0], fileErrors);

    const f = files.file.upload;
    const kind = FILE_TYPES[f.ext].kind;
    const created = models.assets.create({
      ...values,
      userId: req.user.id,
      fileName: f.file_name, fileKey: f.key, fileSize: f.size, fileExt: f.ext, fileKind: kind,
      previewKey: files.preview && files.preview.upload.key,
      previewExt: files.preview && files.preview.sniffed,
      thumbKey: files.thumbnail && files.thumbnail.upload.key,
      width: Math.round(numberHint(b.width, 100000)) || null,
      height: Math.round(numberHint(b.height, 100000)) || null,
      duration: numberHint(b.duration, 7 * 86400),
      mediaStatus: media.needsMedia(kind) ? 'pending' : 'none',
    });
    ctx.releaseUploads(files);
    media.enqueue(created.id);
    return res.ok({ slug: created.slug, url: `/a/${created.slug}`, shareUrl: ctx.absolute(req, `/a/${created.slug}`) }, 201);
  });

  const editable = async (req, res) => {
    const found = await load(req, res, { allowRemoved: true });
    if (!found) return null;
    if (!found.canEdit) { res.fail(403, 'Only the uploader can change this asset.'); return null; }
    return found.row;
  };

  app.post('/api/assets/:slug/edit', requireUser, rate('edit', 120, 3600 * 1000), async (req, res) => {
    const old = await editable(req, res);
    if (!old) return undefined;
    const b = req.body;
    const { values, errors } = parseAssetFields(b);
    if (Object.keys(errors).length) return res.fail(400, 'Check the highlighted fields.', errors);

    const { files, errors: fileErrors } = await ctx.claimUploads(req.user, b.uploads || {});
    if (Object.keys(fileErrors).length) return res.fail(400, Object.values(fileErrors)[0], fileErrors);

    const garbage = [];
    const set = {};
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

    models.assets.update(old.id, values);
    models.assets.setFields(old.id, set);
    ctx.releaseUploads(files);
    for (const k of new Set(garbage)) await storage.remove(k);
    if (files.file || reprocess) media.enqueue(old.id);

    return res.ok({
      url: `/a/${old.slug}`,
      message: files.file ? 'New version uploaded. The share link stays the same.' : 'Changes saved.',
    });
  });

  app.post('/api/assets/:slug/delete', requireUser, async (req, res) => {
    const row = await editable(req, res);
    if (!row) return undefined;
    models.assets.remove(row.id);
    for (const k of [row.file_key, row.preview_key, row.thumb_key]) await storage.remove(k);
    const own = req.user.id === row.user_id;
    return res.ok({ message: `“${row.title}” was deleted.`, redirect: own ? '/dashboard' : '/admin?tab=assets' });
  });

  // ---- Saves & reports -----------------------------------------------------------------

  app.post('/api/assets/:slug/save', requireUser, rate('save', 300, 3600 * 1000), async (req, res) => {
    const found = await load(req, res);
    if (!found) return undefined;
    const saved = models.favorites.toggle(req.user.id, found.row.id);
    return res.ok({ saved, count: models.favorites.count(found.row.id), message: saved ? 'Saved.' : 'Removed from your saved assets.' });
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
    models.reports.create({ assetId: found.row.id, reporterId: req.user && req.user.id, ...values });
    return res.ok({ message: 'Thanks for the report. A moderator will review it soon.' });
  });

  ctx.REPORT_REASONS = REPORT_REASONS;
  ctx.SORTS = SORTS;
};

module.exports.parseAssetFields = parseAssetFields;
module.exports.readFilters = readFilters;
module.exports.REPORT_REASONS = REPORT_REASONS;
