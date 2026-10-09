'use strict';
const { html, raw, formatCount, formatBytes } = require('../../backend/src/html');

const ICONS = {
  search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>',
  upload: '<path d="M12 15V3"/><path d="m7 8 5-5 5 5"/><path d="M4 15v4a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-4"/>',
  download: '<path d="M12 3v12"/><path d="m7 10 5 5 5-5"/><path d="M4 15v4a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-4"/>',
  link: '<path d="M10 13a5 5 0 0 0 7.07 0l3-3a5 5 0 0 0-7.07-7.07l-1.5 1.5"/><path d="M14 11a5 5 0 0 0-7.07 0l-3 3a5 5 0 0 0 7.07 7.07l1.5-1.5"/>',
  heart: '<path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z"/>',
  flag: '<path d="M4 22V4a1 1 0 0 1 1-1h13l-2 5 2 5H5"/>',
  film: '<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M7 3v18M17 3v18M3 7.5h4M3 12h18M3 16.5h4M17 7.5h4M17 16.5h4"/>',
  transition: '<path d="M4 7h13"/><path d="m14 4 3 3-3 3"/><path d="M20 17H7"/><path d="m10 20-3-3 3-3"/>',
  sparkles: '<path d="M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9z"/><path d="M19 15l.8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8z"/>',
  palette: '<circle cx="12" cy="12" r="9"/><path d="M12 3a9 9 0 0 0 0 18z" fill="currentColor"/>',
  layout: '<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M9 21V9"/>',
  shapes: '<circle cx="7" cy="7" r="4"/><rect x="13" y="13" width="8" height="8" rx="1"/><path d="M17.5 2.5 21.5 9.5h-8z"/>',
  sliders: '<path d="M4 6h9M17 6h3M4 12h3M11 12h9M4 18h11M19 18h1"/><circle cx="15" cy="6" r="2"/><circle cx="9" cy="12" r="2"/><circle cx="17" cy="18" r="2"/>',
  wave: '<path d="M2 12h2M6 8v8M10 4v16M14 9v6M18 6v12M22 12h-2"/>',
  music: '<path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/>',
  image: '<rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-5-5L5 21"/>',
  cube: '<path d="M12 2 3 7v10l9 5 9-5V7z"/><path d="m3 7 9 5 9-5M12 12v10"/>',
  box: '<path d="M21 8v13H3V8M1 3h22v5H1zM10 12h4"/>',
  type: '<path d="M4 7V4h16v3M9 20h6M12 4v16"/>',
  file: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6M8 13h8M8 17h5"/>',
  user: '<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>',
  settings: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.6 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.6a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>',
  shield: '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>',
  logout: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="m16 17 5-5-5-5M21 12H9"/>',
  x: '<path d="M18 6 6 18M6 6l12 12"/>',
  check: '<path d="M20 6 9 17l-5-5"/>',
  copy: '<rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>',
  play: '<path d="m6 3 14 9-14 9z"/>',
  eye: '<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
  trash: '<path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>',
  edit: '<path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4z"/>',
  menu: '<path d="M3 6h18M3 12h18M3 18h18"/>',
  gift: '<path d="M20 12v10H4V12M2 7h20v5H2zM12 22V7"/><path d="M12 7H7.5a2.5 2.5 0 0 1 0-5C11 2 12 7 12 7zM12 7h4.5a2.5 2.5 0 0 0 0-5C13 2 12 7 12 7z"/>',
  lock: '<rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>',
  globe: '<circle cx="12" cy="12" r="10"/><path d="M2 12h20M12 2a15 15 0 0 1 0 20M12 2a15 15 0 0 0 0 20"/>',
  share: '<circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><path d="m8.6 13.5 6.8 4M15.4 6.5l-6.8 4"/>',
  info: '<circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01"/>',
  arrowRight: '<path d="M5 12h14M12 5l7 7-7 7"/>',
  clock: '<circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/>',
  bookmark: '<path d="m19 21-7-4-7 4V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/>',
  grid: '<rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/>',
  alert: '<path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/><path d="M12 9v4M12 17h.01"/>',
};

const icon = (name, cls = '') => raw(`<svg class="icon ${cls}" viewBox="0 0 24 24" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${ICONS[name] || ICONS.box}</svg>`);

function avatar(user, size = '') {
  const name = user.display_name || user.username || '?';
  const initials = name.split(/\s+/).map((w) => [...w][0]).join('').slice(0, 2).toUpperCase();
  return html`<span class="avatar ${size}" aria-hidden="true">${initials}</span>`;
}

const csrfField = (ctx) => html`<input type="hidden" name="_csrf" value="${ctx.csrf}">`;

// "1080p · 0:12 · CC0" style spec line.
function specLine(a, { withLicense = true } = {}) {
  const parts = [];
  if (a.resolution) parts.push(a.vertical ? `${a.resolution} vertical` : a.resolution);
  if (!a.resolution && !a.durationLabel) parts.push(`.${a.file_ext}`);
  if (withLicense) parts.push(a.license.short);
  return parts.join(' · ');
}

function media(a) {
  if (a.thumbUrl) return html`<img src="${a.thumbUrl}" alt="" loading="lazy" decoding="async">`;
  return html`<div class="placeholder"><span class="ph-kind">${a.kindInfo.name}</span><span class="ph-ext">.${a.file_ext}</span></div>`;
}

function assetCard(a, opts = {}) {
  return html`
  <article class="card" ${a.videoSrc ? html`data-preview="${a.videoSrc}"` : ''}>
    <a class="card-media" href="${a.url}" tabindex="-1" aria-hidden="true">
      ${media(a)}
      ${a.durationLabel ? html`<span class="card-time">${a.durationLabel}</span>` : ''}
      ${a.visibility === 'unlisted' ? html`<span class="card-flag">Unlisted</span>` : ''}
    </a>
    <div class="card-body">
      <h3 class="card-title"><a href="${a.url}">${a.title}</a></h3>
      <p class="card-meta">${specLine(a)} · ${formatCount(a.downloads)} dl</p>
      ${opts.hideUser ? '' : html`<p class="card-by"><a href="/u/${a.username}">${a.display_name}</a></p>`}
    </div>
  </article>`;
}

function assetGrid(items, opts = {}) {
  return html`<div class="grid ${opts.cls || ''}">${items.map((a) => assetCard(a, opts))}</div>`;
}

function pageHref(base, query, page) {
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(query)) if (v !== '' && v !== undefined && v !== null && v !== false && k !== 'page') params.set(k, v === true ? '1' : v);
  if (page > 1) params.set('page', page);
  const s = params.toString();
  return s ? `${base}?${s}` : base;
}

function pagination(result, base, query = {}) {
  if (result.pages <= 1) return '';
  const { page, pages } = result;
  const nums = new Set([1, pages, page - 1, page, page + 1].filter((n) => n >= 1 && n <= pages));
  const sorted = [...nums].sort((a, b) => a - b);
  const items = [];
  sorted.forEach((n, i) => {
    if (i && n - sorted[i - 1] > 1) items.push(html`<span class="page-gap">…</span>`);
    items.push(n === page
      ? html`<span class="page-num current" aria-current="page">${n}</span>`
      : html`<a class="page-num" href="${pageHref(base, query, n)}">${n}</a>`);
  });
  return html`<nav class="pagination" aria-label="Pagination">
    ${page > 1 ? html`<a class="page-num" href="${pageHref(base, query, page - 1)}" rel="prev">← prev</a>` : ''}
    ${items}
    ${page < pages ? html`<a class="page-num" href="${pageHref(base, query, page + 1)}" rel="next">next →</a>` : ''}
  </nav>`;
}

// First argument kept for call-site compatibility; empty states are text only.
function emptyState(_icon, title, text, action) {
  return html`<div class="empty">
    <h3>${title}</h3>
    <p>${text}</p>
    ${action || ''}
  </div>`;
}

function fieldError(errors, name) {
  return errors && errors[name] ? html`<p class="field-error" id="${name}-error" role="alert">${errors[name]}</p>` : '';
}

const invalid = (errors, name) => (errors && errors[name] ? raw(` aria-invalid="true" aria-describedby="${name}-error"`) : '');

function meter(used, total) {
  const pct = Math.min(100, (used / total) * 100);
  return html`<div class="meter" role="meter" aria-valuemin="0" aria-valuemax="${total}" aria-valuenow="${used}" aria-label="Storage used">
    <div class="meter-fill ${pct > 90 ? 'danger' : ''}" style="width:${pct.toFixed(1)}%"></div>
  </div>
  <p class="small muted">${formatBytes(used)} of ${formatBytes(total)} used</p>`;
}

module.exports = {
  ICONS, icon, avatar, csrfField, assetCard, assetGrid, pagination, pageHref, emptyState, fieldError, invalid, meter, specLine, media,
};
