'use strict';
// Adds display fields to the raw asset data that comes from the API.
const { formatBytes, formatDuration } = require('./html');

function buildCatalog(raw) {
  const byId = (list) => Object.fromEntries(list.map((x) => [x.id, x]));
  return {
    ...raw,
    categoryMap: byId(raw.categories),
    softwareMap: byId(raw.software),
    licenseMap: byId(raw.licenses),
  };
}

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

function decorate(a, catalog) {
  if (!a) return a;
  const category = catalog.categoryMap[a.category] || catalog.categoryMap.other;
  return {
    ...a,
    url: `/a/${a.slug}`,
    downloadUrl: `/a/${a.slug}/download`,
    category,
    license: catalog.licenseMap[a.license] || catalog.licenses[0],
    software: (a.software || []).map((id) => catalog.softwareMap[id]).filter(Boolean),
    kind: a.file_kind,
    kindInfo: catalog.kinds[a.file_kind] || catalog.kinds.archive,
    sizeLabel: formatBytes(a.file_size),
    durationLabel: formatDuration(a.duration),
    resolution: resolutionLabel(a.width, a.height),
    vertical: !!(a.width && a.height && a.height > a.width),
  };
}

const decorateAll = (items, catalog) => (items || []).map((a) => decorate(a, catalog));

// Category list with counts merged in.
const withCounts = (catalog, counts) => {
  const map = Object.fromEntries((counts || []).map((c) => [c.id, c.count]));
  return catalog.categories.map((c) => ({ ...c, count: map[c.id] || 0 }));
};

module.exports = { buildCatalog, decorate, decorateAll, resolutionLabel, withCounts };
