'use strict';
// Shared building blocks for every page.
const { html, raw, formatCount, formatBytes } = require('../src/html');

// 24px line icons (stroke) plus a few filled brand marks. Category and file-kind icons are looked
// up by the names the API uses.
const ICONS = {
  search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.6-3.6"/>',
  upload: '<path d="M12 15V4"/><path d="m7.5 8.5 4.5-4.5 4.5 4.5"/><path d="M5 15v3.5A1.5 1.5 0 0 0 6.5 20h11a1.5 1.5 0 0 0 1.5-1.5V15"/>',
  download: '<path d="M12 4v11"/><path d="m7.5 10.5 4.5 4.5 4.5-4.5"/><path d="M5 15v3.5A1.5 1.5 0 0 0 6.5 20h11a1.5 1.5 0 0 0 1.5-1.5V15"/>',
  link: '<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1"/><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/>',
  copy: '<rect x="8" y="8" width="12" height="12" rx="2.5"/><path d="M16 8V6.5A2.5 2.5 0 0 0 13.5 4h-7A2.5 2.5 0 0 0 4 6.5v7A2.5 2.5 0 0 0 6.5 16H8"/>',
  bookmark: '<path d="M6.5 4h11a1 1 0 0 1 1 1v15l-6.5-4-6.5 4V5a1 1 0 0 1 1-1z"/>',
  share: '<circle cx="18" cy="5.5" r="2.5"/><circle cx="6" cy="12" r="2.5"/><circle cx="18" cy="18.5" r="2.5"/><path d="m8.2 10.8 7.6-4M8.2 13.2l7.6 4"/>',
  flag: '<path d="M5 21V4.5h11.5l-2 4 2 4H5"/>',
  lock: '<rect x="4.5" y="10.5" width="15" height="10" rx="2.5"/><path d="M8 10.5V8a4 4 0 0 1 8 0v2.5"/>',
  unlock: '<rect x="4.5" y="10.5" width="15" height="10" rx="2.5"/><path d="M8 10.5V8a4 4 0 0 1 7.7-1.5"/>',
  clock: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>',
  infinity: '<path d="M8.5 15.5c-2 0-3.5-1.6-3.5-3.5s1.5-3.5 3.5-3.5c3.5 0 3.5 7 7 7 2 0 3.5-1.6 3.5-3.5s-1.5-3.5-3.5-3.5c-3.5 0-3.5 7-7 7z"/>',
  key: '<circle cx="8" cy="15" r="4"/><path d="m11 12 8-8M16 7l2.5 2.5M14 9l2 2"/>',
  ghost: '<path d="M5 20V10a7 7 0 0 1 14 0v10l-2.3-1.5L14.3 20 12 18.5 9.7 20l-2.4-1.5z"/><path d="M9.5 11h.01M14.5 11h.01"/>',
  shield: '<path d="M12 21s7-3.2 7-9.5V6l-7-2.5L5 6v5.5C5 17.8 12 21 12 21z"/><path d="m9 12 2 2 4-4"/>',
  zap: '<path d="M13 3 5 13.5h6L10.5 21 19 10.5h-6z"/>',
  heart: '<path d="M12 20s-7.5-4.4-7.5-10A4.2 4.2 0 0 1 12 7.3 4.2 4.2 0 0 1 19.5 10C19.5 15.6 12 20 12 20z"/>',
  home: '<path d="M4 10.5 12 4l8 6.5V19a1 1 0 0 1-1 1h-4.5v-6h-5v6H5a1 1 0 0 1-1-1z"/>',
  compass: '<circle cx="12" cy="12" r="8.5"/><path d="m15.5 8.5-2 5-5 2 2-5z"/>',
  user: '<circle cx="12" cy="8.5" r="3.5"/><path d="M5 20a7 7 0 0 1 14 0"/>',
  users: '<circle cx="9" cy="9" r="3.2"/><path d="M3.5 19a5.5 5.5 0 0 1 11 0"/><path d="M15.5 6.3a3 3 0 0 1 0 5.4M17 14.2a5.5 5.5 0 0 1 3.5 4.8"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  grid: '<rect x="4" y="4" width="7" height="7" rx="1.5"/><rect x="13" y="4" width="7" height="7" rx="1.5"/><rect x="4" y="13" width="7" height="7" rx="1.5"/><rect x="13" y="13" width="7" height="7" rx="1.5"/>',
  trending: '<path d="m3.5 16.5 6-6 4 4 7-7"/><path d="M15 7.5h5.5V13"/>',
  sparkles: '<path d="M11 4 12.6 9 17.5 10.6 12.6 12.2 11 17 9.4 12.2 4.5 10.6 9.4 9z"/><path d="M18.5 15v5M16 17.5h5"/>',
  film: '<rect x="3.5" y="4.5" width="17" height="15" rx="2"/><path d="M7.5 4.5v15M16.5 4.5v15M3.5 9.5h4M3.5 14.5h4M16.5 9.5h4M16.5 14.5h4"/>',
  transition: '<path d="M4 7.5h12.5"/><path d="m13.5 4.5 3 3-3 3"/><path d="M20 16.5H7.5"/><path d="m10.5 13.5-3 3 3 3"/>',
  palette: '<circle cx="12" cy="12" r="8.5"/><path d="M12 3.5v17a8.5 8.5 0 0 0 0-17z" fill="currentColor" stroke="none"/>',
  layout: '<rect x="3.5" y="4" width="17" height="16" rx="2"/><path d="M3.5 9.5h17M9.5 9.5V20"/>',
  shapes: '<circle cx="7.5" cy="7.5" r="3.5"/><rect x="13" y="13" width="7.5" height="7.5" rx="1.5"/><path d="m17 3 4 6.5h-8z"/>',
  sliders: '<path d="M4 7h9M17 7h3M4 12h3M11 12h9M4 17h11M19 17h1"/><circle cx="15" cy="7" r="2"/><circle cx="9" cy="12" r="2"/><circle cx="17" cy="17" r="2"/>',
  wave: '<path d="M3 12h1.5M7 8.5v7M10.5 5v14M14 9v6M17.5 6.5v11M21 12h-1"/>',
  music: '<path d="M9 17.5V6l10.5-2v11.5"/><circle cx="6.5" cy="17.5" r="2.5"/><circle cx="17" cy="15.5" r="2.5"/>',
  image: '<rect x="3.5" y="4.5" width="17" height="15" rx="2"/><circle cx="9" cy="10" r="1.8"/><path d="m20.5 16-4.5-4.5L6 19.5"/>',
  cube: '<path d="M12 3 4 7.5v9L12 21l8-4.5v-9z"/><path d="m4 7.5 8 4.5 8-4.5M12 12v9"/>',
  box: '<path d="M4 8.5h16V19a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1z"/><path d="M3 4.5h18v4H3zM10 12.5h4"/>',
  type: '<path d="M5 7V4.5h14V7M12 4.5v15M9 19.5h6"/>',
  file: '<path d="M14 3.5H7a1.5 1.5 0 0 0-1.5 1.5v14A1.5 1.5 0 0 0 7 20.5h10a1.5 1.5 0 0 0 1.5-1.5V8z"/><path d="M14 3.5V8h4.5M9 13h6M9 16.5h4"/>',
  x: '<path d="M18 6 6 18M6 6l12 12"/>',
  check: '<path d="m5 12.5 4.5 4.5L19 7.5"/>',
  minus: '<path d="M6 12h12"/>',
  info: '<circle cx="12" cy="12" r="8.5"/><path d="M12 11v5M12 8h.01"/>',
  alert: '<path d="M12 4 2.8 19.5h18.4z"/><path d="M12 10v4M12 17h.01"/>',
  arrow: '<path d="M5 12h14"/><path d="m13 6 6 6-6 6"/>',
  back: '<path d="M19 12H5"/><path d="m11 6-6 6 6 6"/>',
  chevron: '<path d="m6.5 9.5 5.5 5.5 5.5-5.5"/>',
  chevronRight: '<path d="m9.5 6 6 6-6 6"/>',
  menu: '<path d="M4 7h16M4 12h16M4 17h16"/>',
  eye: '<path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z"/><circle cx="12" cy="12" r="2.8"/>',
  filter: '<path d="M4 6.5h16M7 12h10M10 17.5h4"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2.5v2M12 19.5v2M4.6 4.6 6 6M18 18l1.4 1.4M2.5 12h2M19.5 12h2M4.6 19.4 6 18M18 6l1.4-1.4"/>',
  moon: '<path d="M20 14.5A8 8 0 0 1 9.5 4 8 8 0 1 0 20 14.5z"/>',
  settings: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>',
  logout: '<path d="M9 20H6a1.5 1.5 0 0 1-1.5-1.5v-13A1.5 1.5 0 0 1 6 4h3"/><path d="m15.5 16.5 4.5-4.5-4.5-4.5M20 12H9"/>',
  trash: '<path d="M4 7h16M9.5 7V4.5h5V7M6 7l1 12.5A1.5 1.5 0 0 0 8.5 21h7a1.5 1.5 0 0 0 1.5-1.5L18 7"/>',
  edit: '<path d="M4 20h4L19 9a2.8 2.8 0 0 0-4-4L4 16z"/><path d="m13.5 6.5 4 4"/>',
  globe: '<circle cx="12" cy="12" r="8.5"/><path d="M3.5 12h17M12 3.5c2.5 2.6 3.5 5.4 3.5 8.5s-1 5.9-3.5 8.5c-2.5-2.6-3.5-5.4-3.5-8.5s1-5.9 3.5-8.5z"/>',
  code: '<path d="m8.5 8-4 4 4 4M15.5 8l4 4-4 4M13.5 5l-3 14"/>',
  camera: '<path d="M4 8.5A1.5 1.5 0 0 1 5.5 7h2.3L9.5 4.5h5L16.2 7h2.3A1.5 1.5 0 0 1 20 8.5v9a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 17.5z"/><circle cx="12" cy="12.5" r="3.2"/>',
  // Social platforms. Simple marks drawn to match the line icons.
  youtube: '<rect x="2.5" y="5.5" width="19" height="13" rx="4"/><path d="m10 9.2 5 2.8-5 2.8z" fill="currentColor"/>',
  instagram: '<rect x="3.5" y="3.5" width="17" height="17" rx="5"/><circle cx="12" cy="12" r="4"/><path d="M17.2 6.8h.01"/>',
  twitch: '<path d="M4.5 3.5h15v10l-4 4h-3.5l-3 3v-3h-4.5z"/><path d="M11 8v4M15.5 8v4"/>',
  vimeo: '<path d="M3 8.5c3-2.5 4.5-3.5 5.5-1.5 1 2.2 1.5 8 3 8s4.5-4.5 5-6.5c.5-2.5-1.5-3-3-2 1-4.5 7.5-4.5 6.5 0-1 4-6.5 11.5-9 11.5-2.7 0-3-8.5-4.5-8.5-.5 0-1.5.7-2.5 1.5"/>',
  behance: '<path d="M3.5 6.5h5a2.8 2.8 0 0 1 0 5.5h-5zM3.5 12h5.5a3 3 0 0 1 0 6H3.5zM14.5 14.5h6.5a3.3 3.3 0 1 0-1 2.8M15 7.5h4.5"/>',
  artstation: '<path d="M3 16.5 9.5 5h5l6.5 11.5-2.5 3.5zM3 16.5h11.5M8.5 13l3.5-6"/>',
  discord: '<path d="M7.5 6.5c3-1.3 6-1.3 9 0 1.8 2.5 2.8 5.6 2.7 9.5-1.5 1.2-3.1 2-4.7 2.5l-1-1.8M7.5 6.5C5.7 9 4.7 12.1 4.8 16c1.5 1.2 3.1 2 4.7 2.5l1-1.8M8 15.5c2.6 1.3 5.4 1.3 8 0"/><circle cx="9.5" cy="12" r="1.2"/><circle cx="14.5" cy="12" r="1.2"/>',
};
const FILLED = {
  tiktok: '<path d="M12.53.02C13.84 0 15.14.01 16.44 0c.08 1.53.63 3.09 1.75 4.17 1.12 1.11 2.7 1.62 4.24 1.79v4.03c-1.44-.05-2.89-.35-4.2-.97-.57-.26-1.1-.59-1.62-.93-.01 2.92.01 5.84-.02 8.75-.08 1.4-.54 2.79-1.35 3.94-1.31 1.92-3.58 3.17-5.91 3.21-1.43.08-2.86-.31-4.08-1.03-2.02-1.19-3.44-3.37-3.65-5.71-.02-.5-.03-1-.01-1.49.18-1.9 1.12-3.72 2.58-4.96 1.66-1.44 3.98-2.13 6.15-1.72.02 1.48-.04 2.96-.04 4.44-.99-.32-2.15-.23-3.02.37-.63.41-1.11 1.04-1.36 1.75-.21.51-.15 1.07-.14 1.61.24 1.64 1.82 3.02 3.5 2.87 1.12-.01 2.19-.66 2.77-1.61.19-.33.4-.67.41-1.06.1-1.79.06-3.57.07-5.36.01-4.03-.01-8.05.02-12.07z"/>',
  x: '<path d="M18.9 1.15h3.68l-8.04 9.19L24 22.85h-7.4l-5.8-7.58-6.64 7.58H.47l8.6-9.83L0 1.15h7.6l5.24 6.93zm-1.29 19.5h2.04L6.49 3.24H4.3z"/>',
};

function icon(name, cls = '') {
  if (FILLED[name]) return raw(`<svg class="i ${cls}" viewBox="0 0 24 24" aria-hidden="true" focusable="false" fill="currentColor">${FILLED[name]}</svg>`);
  return raw(`<svg class="i ${cls}" viewBox="0 0 24 24" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${ICONS[name] || ICONS.box}</svg>`);
}

// The ClipFX logo. Decorative wherever the name is written next to it, so alt stays empty.
const mark = () => raw('<img class="mark" src="/static/brand/logo.png" alt="" width="142" height="102" decoding="async">');

// Inline style that hands a category's hue to CSS.
const hue = (category) => raw(`style="--h:${Number(category && category.hue) || 220}"`);

// Background photo for each category (CC0, see the About page). Unknown ids fall back to "other".
const CATEGORY_PHOTOS = new Set(['footage', 'transitions', 'overlays', 'luts', 'templates', 'motion', 'presets', 'sfx', 'music', 'textures', '3d', 'other']);
const categoryPhoto = (category) => `/static/img/cat-${CATEGORY_PHOTOS.has(category && category.id) ? category.id : 'other'}.webp`;

// A person's photo, or their initials on a color picked from their name.
function avatar(user, size = '') {
  const name = user.display_name || user.username || '?';
  const url = user.avatar_url || user.user_avatar_url;
  if (url) return html`<span class="avatar ${size}"><img src="${url}" alt="" loading="lazy" decoding="async"></span>`;
  const initials = name.split(/\s+/).map((w) => [...w][0] || '').join('').slice(0, 2).toUpperCase();
  let h = 0;
  for (const c of String(user.username || name)) h = (h * 31 + c.charCodeAt(0)) % 360;
  return html`<span class="avatar ${size}" style="--h:${h}" aria-hidden="true">${initials}</span>`;
}

const csrfField = (ctx) => html`<input type="hidden" name="_csrf" value="${ctx.csrf}">`;

function specLine(a) {
  const parts = [];
  if (a.resolution) parts.push(a.vertical ? `${a.resolution} vertical` : a.resolution);
  else parts.push(`.${a.file_ext}`);
  parts.push(a.license.short);
  return parts.join(' · ');
}

// Thumbnail, or a labelled tile for files without one (LUTs, presets, projects).
function media(a) {
  if (a.thumbUrl) return html`<img src="${a.thumbUrl}" alt="" loading="lazy" decoding="async">`;
  return html`<div class="tile">${icon(a.locked && !a.thumbUrl ? 'lock' : a.category.icon)}<span>.${a.file_ext}</span></div>`;
}

// Who uploaded it: a link to their profile, or plain "Anonymous".
function byline(a, { withAvatar = true } = {}) {
  if (a.anonymous) return html`<span class="by">${withAvatar ? html`<span class="avatar xs anon">${icon('ghost')}</span>` : ''}<span>Anonymous</span></span>`;
  return html`<a class="by" href="/u/${a.username}">${withAvatar ? avatar({ username: a.username, display_name: a.display_name, avatar_url: a.user_avatar_url }, 'xs') : ''}<span>${a.display_name}</span></a>`;
}

// Small status flags for private shares (shown on dashboards and saved lists).
function shareFlags(a) {
  return html`${a.locked ? html`<span class="flag" title="Password protected">${icon('lock')}</span>` : ''}${a.expires_at ? html`<span class="flag" title="Link expires">${icon('clock')}</span>` : ''}${a.visibility === 'unlisted' ? html`<span class="flag" title="Unlisted">${icon('eye')}</span>` : ''}`;
}

function assetCard(a, opts = {}) {
  return html`
  <article class="card" ${hue(a.category)} ${a.videoSrc ? html`data-preview="${a.videoSrc}"` : ''} data-reveal>
    <div class="card-media">
      ${media(a)}
      <span class="card-kind">${a.kindInfo.name}</span>
      <span class="card-flags">${shareFlags(a)}</span>
      ${a.durationLabel ? html`<span class="card-time">${a.durationLabel}</span>` : ''}
    </div>
    <div class="card-body">
      <p class="card-cat"><span class="dot" aria-hidden="true"></span>${a.category.name}</p>
      <h3 class="card-title"><a href="${a.url}">${a.title}</a></h3>
      <div class="card-foot">
        ${opts.hideUser ? html`<span class="card-spec">${specLine(a)}</span>` : byline(a)}
        <span class="card-dl" title="${a.downloads} downloads">${icon('download')}${formatCount(a.downloads)}</span>
      </div>
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
    ${page > 1 ? html`<a class="btn btn-ghost btn-sm" href="${pageHref(base, query, page - 1)}" rel="prev">${icon('back')}<span class="hide-xs">Previous</span></a>` : html`<span></span>`}
    <div class="pg-nums">${items}</div>
    ${page < pages ? html`<a class="btn btn-ghost btn-sm" href="${pageHref(base, query, page + 1)}" rel="next"><span class="hide-xs">Next</span>${icon('arrow')}</a>` : html`<span></span>`}
  </nav>`;
}

function emptyState(title, text, action, iconName = 'search') {
  return html`<div class="empty">
    <span class="empty-icon">${icon(iconName)}</span>
    <p class="empty-title">${title}</p>
    <p class="empty-text">${text}</p>
    ${action || ''}
  </div>`;
}

function notice(kind, content, iconName) {
  const name = iconName || (kind === 'danger' ? 'alert' : kind === 'success' ? 'check' : 'info');
  return html`<div class="notice ${kind ? `notice-${kind}` : ''}" role="${kind === 'danger' ? 'alert' : 'status'}">${icon(name)}<div>${content}</div></div>`;
}

function fieldError(errors, name) {
  return errors && errors[name] ? html`<p class="field-error" id="${name}-error" role="alert">${icon('alert')}${errors[name]}</p>` : '';
}

const invalid = (errors, name) => (errors && errors[name] ? raw(` aria-invalid="true" aria-describedby="${name}-error"`) : '');

function meter(used, total, label = 'Storage used') {
  const pct = total ? Math.min(100, (used / total) * 100) : 0;
  return html`<div class="meter-block">
    <div class="meter" role="meter" aria-valuemin="0" aria-valuemax="${total}" aria-valuenow="${used}" aria-label="${label}">
      <span class="meter-fill ${pct > 90 ? 'is-full' : ''}" style="--w:${pct.toFixed(1)}%"></span>
    </div>
    <p class="meter-text"><span>${formatBytes(used)} of ${formatBytes(total)}</span><span>${Math.round(pct)}%</span></p>
  </div>`;
}

function sectionHead(title, link, extra = '', sub = '') {
  return html`<div class="section-head">
    <div class="section-title"><h2>${title}</h2>${sub ? html`<p>${sub}</p>` : ''}</div>
    ${extra}
    ${link ? html`<a class="link-more" href="${link[0]}">${link[1]}${icon('arrow')}</a>` : ''}
  </div>`;
}

module.exports = {
  ICONS, icon, mark, hue, categoryPhoto, avatar, csrfField, assetCard, assetGrid, pagination, pageHref, emptyState, notice,
  fieldError, invalid, meter, specLine, media, sectionHead, byline, shareFlags,
};
