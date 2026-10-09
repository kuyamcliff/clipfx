'use strict';
// Shared building blocks for every page.
const { html, raw, formatCount, formatBytes } = require('../src/html');

// 24px line icons. Category and file-kind icons are looked up by the names the API uses.
const ICONS = {
  search: '<circle cx="11" cy="11" r="6.5"/><path d="m20 20-4.2-4.2"/>',
  upload: '<path d="M12 16V4"/><path d="m6.5 9.5 5.5-5.5 5.5 5.5"/><path d="M4 16v3a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-3"/>',
  download: '<path d="M12 4v12"/><path d="m6.5 10.5 5.5 5.5 5.5-5.5"/><path d="M4 16v3a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-3"/>',
  link: '<path d="M10 14a4.5 4.5 0 0 0 6.4 0l3-3a4.5 4.5 0 0 0-6.4-6.4l-1.2 1.2"/><path d="M14 10a4.5 4.5 0 0 0-6.4 0l-3 3a4.5 4.5 0 0 0 6.4 6.4l1.2-1.2"/>',
  bookmark: '<path d="M6 3.5h12v17l-6-4-6 4z"/>',
  share: '<path d="M12 15V3.5"/><path d="m7.5 8 4.5-4.5L16.5 8"/><path d="M5 12v7.5h14V12"/>',
  flag: '<path d="M5 21V4h12l-2 4.5 2 4.5H5"/>',
  film: '<rect x="3" y="4" width="18" height="16" rx="1.5"/><path d="M7 4v16M17 4v16M3 9h4M3 15h4M17 9h4M17 15h4"/>',
  transition: '<path d="M3 7h14"/><path d="m14 3.5 3.5 3.5-3.5 3.5"/><path d="M21 17H7"/><path d="m10 13.5-3.5 3.5 3.5 3.5"/>',
  sparkles: '<path d="M11 3.5 12.8 9l5.7 1.8-5.7 1.8L11 18.5l-1.8-5.9L3.5 10.8 9.2 9z"/><path d="M18.5 15.5v5M16 18h5"/>',
  palette: '<circle cx="12" cy="12" r="8.5"/><path d="M12 3.5v17a8.5 8.5 0 0 0 0-17z" fill="currentColor" stroke="none"/>',
  layout: '<rect x="3.5" y="3.5" width="17" height="17" rx="1.5"/><path d="M3.5 9h17M9.5 9v11.5"/>',
  shapes: '<circle cx="7.5" cy="7.5" r="4"/><rect x="13" y="13" width="7.5" height="7.5" rx="1"/><path d="m17 3 4 6.5h-8z"/>',
  sliders: '<path d="M4 6h9M17 6h3M4 12h3M11 12h9M4 18h11M19 18h1"/><circle cx="15" cy="6" r="2"/><circle cx="9" cy="12" r="2"/><circle cx="17" cy="18" r="2"/>',
  wave: '<path d="M3 12h1.5M7 8.5v7M10.5 5v14M14 9v6M17.5 6.5v11M21 12h-1"/>',
  music: '<path d="M9 18V5.5l11-2V16"/><circle cx="6.5" cy="18" r="2.5"/><circle cx="17.5" cy="16" r="2.5"/>',
  image: '<rect x="3.5" y="4" width="17" height="16" rx="1.5"/><circle cx="9" cy="9.5" r="1.8"/><path d="m20.5 16-5-5-10 9"/>',
  cube: '<path d="M12 3 4 7.5v9L12 21l8-4.5v-9z"/><path d="m4 7.5 8 4.5 8-4.5M12 12v9"/>',
  box: '<path d="M3.5 8h17v12h-17zM2.5 4h19v4h-19zM10 12h4"/>',
  type: '<path d="M5 7V4.5h14V7M12 4.5v15M9 19.5h6"/>',
  file: '<path d="M14 3.5H6.5v17h11V7z"/><path d="M14 3.5V7h3.5M9 12h6M9 16h4"/>',
  x: '<path d="M18 6 6 18M6 6l12 12"/>',
  check: '<path d="m4.5 12.5 5 5 10-11"/>',
  minus: '<path d="M5 12h14"/>',
  arrow: '<path d="M4 12h15"/><path d="m13 6 6 6-6 6"/>',
  back: '<path d="M20 12H5"/><path d="m11 6-6 6 6 6"/>',
  menu: '<path d="M4 7h16M4 12h16M4 17h16"/>',
  chevron: '<path d="m6 9 6 6 6-6"/>',
  eye: '<path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z"/><circle cx="12" cy="12" r="2.8"/>',
  filter: '<path d="M4 6h16M7 12h10M10 18h4"/>',
  alert: '<path d="M12 3.5 2.5 20h19z"/><path d="M12 10v4.5M12 17.5h.01"/>',
};

const icon = (name, cls = '') => raw(`<svg class="i ${cls}" viewBox="0 0 24 24" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round">${ICONS[name] || ICONS.box}</svg>`);

// The ClipFX mark: an in point and an out point around a clip.
const mark = () => raw('<svg class="mark" viewBox="0 0 28 20" aria-hidden="true" focusable="false"><path d="M5 2H1.5v16H5" fill="none" stroke="currentColor" stroke-width="2.5"/><path d="M23 2h3.5v16H23" fill="none" stroke="currentColor" stroke-width="2.5"/><rect x="8" y="5.5" width="12" height="9" fill="var(--accent)"/></svg>');

// Inline style that hands a category's hue to CSS (label colors, placeholders).
const hue = (category) => raw(`style="--h:${Number(category && category.hue) || 0}"`);

function avatar(user, size = '') {
  const name = user.display_name || user.username || '?';
  const initials = name.split(/\s+/).map((w) => [...w][0] || '').join('').slice(0, 2).toUpperCase();
  return html`<span class="avatar ${size}" aria-hidden="true">${initials}</span>`;
}

const csrfField = (ctx) => html`<input type="hidden" name="_csrf" value="${ctx.csrf}">`;

// "4K vertical · CC0" style line under a card title.
function specLine(a, { withLicense = true } = {}) {
  const parts = [];
  if (a.resolution) parts.push(a.vertical ? `${a.resolution} vertical` : a.resolution);
  else parts.push(`.${a.file_ext}`);
  if (withLicense) parts.push(a.license.short);
  return parts.join(' · ');
}

// Thumbnail, or a labelled tile for files without one (LUTs, presets, projects).
function media(a) {
  if (a.thumbUrl) return html`<img src="${a.thumbUrl}" alt="" loading="lazy" decoding="async">`;
  return html`<div class="tile">${icon(a.category.icon)}<span class="tile-ext">.${a.file_ext}</span></div>`;
}

function assetCard(a, opts = {}) {
  return html`
  <article class="card" ${hue(a.category)} ${a.videoSrc ? html`data-preview="${a.videoSrc}"` : ''}>
    <div class="card-media">
      ${media(a)}
      ${a.durationLabel ? html`<span class="card-time">${a.durationLabel}</span>` : ''}
      ${a.visibility === 'unlisted' ? html`<span class="card-flag">Unlisted</span>` : ''}
    </div>
    <div class="card-body">
      <h3 class="card-title"><a href="${a.url}">${a.title}</a></h3>
      <p class="card-spec"><span class="swatch" aria-hidden="true"></span>${a.category.name}<span class="sep" aria-hidden="true">/</span>${specLine(a)}</p>
      <p class="card-foot">
        ${opts.hideUser ? html`<span></span>` : html`<a href="/u/${a.username}">${a.display_name}</a>`}
        <span class="card-dl" title="${a.downloads} downloads">${icon('download')}${formatCount(a.downloads)}</span>
      </p>
    </div>
  </article>`;
}

function assetGrid(items, opts = {}) {
  return html`<div class="grid">${items.map((a) => assetCard(a, opts))}</div>`;
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
  const nums = [...new Set([1, pages, page - 1, page, page + 1].filter((n) => n >= 1 && n <= pages))].sort((a, b) => a - b);
  const items = [];
  nums.forEach((n, i) => {
    if (i && n - nums[i - 1] > 1) items.push(html`<span class="pg-gap" aria-hidden="true">...</span>`);
    items.push(n === page
      ? html`<span class="pg-num is-current" aria-current="page">${n}</span>`
      : html`<a class="pg-num" href="${pageHref(base, query, n)}">${n}</a>`);
  });
  return html`<nav class="pager" aria-label="Pages">
    ${page > 1 ? html`<a class="pg-step" href="${pageHref(base, query, page - 1)}" rel="prev">${icon('back')}<span>Previous</span></a>` : html`<span></span>`}
    <div class="pg-nums">${items}</div>
    ${page < pages ? html`<a class="pg-step" href="${pageHref(base, query, page + 1)}" rel="next"><span>Next</span>${icon('arrow')}</a>` : html`<span></span>`}
  </nav>`;
}

function emptyState(title, text, action) {
  return html`<div class="empty">
    <p class="empty-title">${title}</p>
    <p>${text}</p>
    ${action || ''}
  </div>`;
}

function notice(kind, content) {
  return html`<div class="notice ${kind ? `notice-${kind}` : ''}" role="${kind === 'danger' ? 'alert' : 'status'}">${content}</div>`;
}

function fieldError(errors, name) {
  return errors && errors[name] ? html`<p class="field-error" id="${name}-error" role="alert">${errors[name]}</p>` : '';
}

const invalid = (errors, name) => (errors && errors[name] ? raw(` aria-invalid="true" aria-describedby="${name}-error"`) : '');

function meter(used, total, label = 'Storage used') {
  const pct = total ? Math.min(100, (used / total) * 100) : 0;
  return html`<div class="meter-block">
    <div class="meter" role="meter" aria-valuemin="0" aria-valuemax="${total}" aria-valuenow="${used}" aria-label="${label}">
      <span class="meter-fill ${pct > 90 ? 'is-full' : ''}" style="width:${pct.toFixed(1)}%"></span>
    </div>
    <p class="meter-text"><span>${formatBytes(used)} of ${formatBytes(total)}</span><span>${Math.round(pct)}%</span></p>
  </div>`;
}

// A heading row with an optional link on the right.
function sectionHead(title, link, extra = '') {
  return html`<div class="section-head">
    <h2>${title}</h2>
    ${extra}
    ${link ? html`<a class="more" href="${link[0]}">${link[1]}${icon('arrow')}</a>` : ''}
  </div>`;
}

module.exports = {
  ICONS, icon, mark, hue, avatar, csrfField, assetCard, assetGrid, pagination, pageHref, emptyState, notice,
  fieldError, invalid, meter, specLine, media, sectionHead,
};
