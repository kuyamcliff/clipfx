'use strict';
const { html, raw, formatCount, formatBytes, formatDate, timeAgo, richText } = require('../src/html');
const { layout } = require('./layout');
const {
  icon, hue, categoryPhoto, avatar, assetGrid, pagination, emptyState, meter, pageHref, sectionHead, media, shareFlags,
} = require('./components');

const SUGGESTIONS = ['light leak', 'whoosh', 'film grain', 'lower third', 'glitch', 'LUT'];

function categoryGrid(categories) {
  return html`<div class="cats">
    ${categories.map((c, n) => html`<a class="cat" href="/browse?category=${c.id}" ${hue(c)}>
      <img class="cat-img" src="${categoryPhoto(c)}" alt="" width="640" height="400" loading="lazy" decoding="async">
      <span class="cat-num mono">${String(n + 1).padStart(2, '0')}</span>
      <span class="cat-text"><span class="cat-name">${c.name}</span><span class="cat-count">${formatCount(c.count)} ${c.count === 1 ? 'file' : 'files'}</span></span>
    </a>`)}
  </div>`;
}

function creatorCard(c) {
  return html`<a class="creator" href="/u/${c.username}" data-reveal>
    ${avatar(c, 'lg')}
    <span class="creator-name">${c.display_name}</span>
    <span class="creator-handle">@${c.username}</span>
    <span class="creator-stats"><span>${formatCount(c.uploads)} uploads</span><span>${formatCount(c.downloads)} downloads</span></span>
  </a>`;
}

const FEATURES = [
  ['download', 'Free downloads', 'Download anything without an account. No paywalls, no ads.'],
  ['ghost', 'Upload anonymously', 'Share a file without signing up. You get a private link to manage it.'],
  ['clock', 'Expiring links', 'Make a link stop working after a few minutes, days, or a set number of downloads.'],
  ['lock', 'Password protection', 'Lock a file so only people with the password can download it.'],
];

function home(ctx, { stats, categories, fresh, trending, creators }) {
  const body = html`
  <section class="hero">
    <div class="container hero-in">
      <div class="hero-copy">
        <p class="hero-meta mono">${formatCount(stats.assets)} files &middot; ${categories.length} categories &middot; free</p>
        <h1 class="hero-title">Find all resources for video editing.</h1>
        <p class="hero-sub">Stock footage, transitions, LUTs, overlays, templates, sound effects and music. Shared by editors, free to download, no account needed.</p>
        <form class="hero-search" action="/browse" role="search">
          ${icon('search')}
          <input type="search" name="q" placeholder="Search footage, LUTs, sounds" aria-label="Search resources" autocomplete="off">
          <button class="btn btn-primary" type="submit">Search</button>
        </form>
        <p class="hero-popular"><span class="mono">Popular</span> ${SUGGESTIONS.map((s, n) => html`${n ? ', ' : ''}<a href="/browse?q=${encodeURIComponent(s)}">${s}</a>`)}</p>
      </div>
      <figure class="monitor" aria-hidden="true">
        <img src="/static/img/hero.webp" alt="" width="1920" height="1080" fetchpriority="high" decoding="async">
        <span class="monitor-safe"></span>
        <span class="monitor-tc mono" data-timecode>00:00:12:04</span>
        <span class="monitor-tag mono">A001_C004 &middot; 4K &middot; 23.976</span>
      </figure>
    </div>
  </section>

  <div class="container">
    <section class="section">
      ${sectionHead('Categories', ['/browse', 'Browse everything'])}
      ${categoryGrid(categories)}
    </section>

    ${trending.length ? html`<section class="section">
      ${sectionHead('Trending this week', ['/browse?sort=trending', 'See all'])}
      ${assetGrid(trending)}
    </section>` : ''}

    <section class="section">
      ${sectionHead('Just uploaded', ['/browse', 'See all'])}
      ${fresh.length ? assetGrid(fresh) : emptyState('Nothing here yet', 'Be the first to share something. You don\'t even need an account.',
    html`<a class="btn btn-primary" href="/upload">${icon('upload')}<span>Upload a file</span></a>`, 'upload')}
    </section>

    ${creators && creators.length ? html`<section class="section">
      ${sectionHead('Creators', null)}
      <div class="creators">${creators.map(creatorCard)}</div>
    </section>` : ''}

    <section class="section">
      ${sectionHead('How it works', null)}
      <ol class="steps">${FEATURES.map(([, t, d]) => html`<li><h3>${t}</h3><p>${d}</p></li>`)}</ol>
    </section>

    <section class="cta">
      <img class="cta-img" src="/static/img/cta.webp" alt="" width="1280" height="560" loading="lazy" decoding="async">
      <div>
        <h2>Made something useful?</h2>
        <p>A LUT that nailed a look, a pack of whooshes, a title template. Upload it, pick a license and share one link.</p>
      </div>
      <div class="cta-actions">
        <a class="btn btn-primary btn-lg" href="/upload">${icon('upload')}<span>Upload a file</span></a>
        ${ctx.user ? '' : html`<a class="btn btn-secondary btn-lg" href="/signup">Create an account</a>`}
      </div>
    </section>
  </div>`;

  const ldJson = [
    { '@context': 'https://schema.org', '@type': 'Organization', name: ctx.config.siteName, url: ctx.absolute('/'), logo: ctx.absolute('/static/brand/icon-512.png') },
    {
      '@context': 'https://schema.org', '@type': 'WebSite', name: ctx.config.siteName, url: ctx.absolute('/'),
      potentialAction: { '@type': 'SearchAction', target: `${ctx.absolute('')}/browse?q={search_term_string}`, 'query-input': 'required name=search_term_string' },
    },
  ];
  return layout(ctx, { body, og: { url: ctx.absolute('/') }, ldJson, bodyClass: 'is-home' });
}

function filterLink(filters, changes) {
  const m = { ...filters, ...changes };
  return pageHref('/browse', {
    q: m.q, category: m.category, software: m.software, license: m.license, kind: m.kind,
    tag: m.tag, commercial: m.commercial, noattr: m.noAttribution, sort: m.sort === 'new' ? '' : m.sort,
  }, 1);
}

function select(id, name, label, options, current) {
  return html`<div class="field">
    <label for="${id}">${label}</label>
    <select id="${id}" name="${name}"><option value="">Any</option>
      ${options.map(([value, text]) => html`<option value="${value}" ${current === value ? 'selected' : ''}>${text}</option>`)}
    </select>
  </div>`;
}

function browse(ctx, { filters: f, result, sorts, categories }) {
  const { software, licenses, kinds, categoryMap, softwareMap, licenseMap } = ctx.catalog;
  const queryObj = {
    q: f.q, category: f.category, software: f.software, license: f.license, kind: f.kind, tag: f.tag,
    commercial: f.commercial, noattr: f.noAttribution, sort: f.sort === 'new' ? '' : f.sort,
  };
  const active = [
    f.q && [`"${f.q}"`, { q: '' }],
    f.category && [categoryMap[f.category].name, { category: '' }],
    f.software && [softwareMap[f.software].name, { software: '' }],
    f.license && [licenseMap[f.license].short, { license: '' }],
    f.kind && [kinds[f.kind].name, { kind: '' }],
    f.tag && [`#${f.tag}`, { tag: '' }],
    f.commercial && ['Commercial use OK', { commercial: false }],
    f.noAttribution && ['No credit required', { noAttribution: false }],
  ].filter(Boolean);
  const filterCount = [f.category, f.software, f.license, f.kind, f.commercial, f.noAttribution].filter(Boolean).length;
  const cat = f.category ? categoryMap[f.category] : null;
  const heading = cat ? cat.name : f.tag ? `#${f.tag}` : f.q ? `Results for "${f.q}"` : f.sort === 'trending' ? 'Trending' : 'Explore';

  const body = html`
  <div class="container">
    <header class="pagehead${cat ? ' has-photo' : ''}" ${cat ? hue(cat) : ''}>
      ${cat ? html`<img class="pagehead-img" src="${categoryPhoto(cat)}" alt="" width="640" height="400" decoding="async">` : ''}
      <div>
        ${cat ? html`<span class="pagehead-icon">${icon(cat.icon)}</span>` : ''}
        <h1>${heading}</h1>
        <p class="sub">${cat ? `${cat.blurb} ` : ''}<strong>${formatCount(result.total)}</strong> ${result.total === 1 ? 'resource' : 'resources'}</p>
      </div>
    </header>

    <nav class="catbar" aria-label="Categories">
      <a href="${filterLink(f, { category: '' })}" ${!f.category ? raw('aria-current="page"') : ''}>All</a>
      ${categories.map((c) => html`<a href="${filterLink(f, { category: c.id })}" ${f.category === c.id ? raw('aria-current="page"') : ''} ${hue(c)}><span class="dot"></span>${c.name}</a>`)}
    </nav>

    <div class="toolbar">
      <form class="toolbar-search" action="/browse" role="search">
        ${Object.entries(queryObj).filter(([k, v]) => v && k !== 'q').map(([k, v]) => html`<input type="hidden" name="${k}" value="${v === true ? '1' : v}">`)}
        ${icon('search')}<input type="search" name="q" value="${f.q}" placeholder="Search in results" aria-label="Search">
      </form>
      <button type="button" class="btn btn-secondary btn-sm filter-toggle" aria-expanded="false" aria-controls="filters" data-filter-toggle>
        ${icon('filter')}<span>Filters${filterCount ? html` <span class="badge">${filterCount}</span>` : ''}</span>
      </button>
      <form class="sortform" action="/browse" data-autosubmit>
        ${Object.entries(queryObj).filter(([k, v]) => v && k !== 'sort').map(([k, v]) => html`<input type="hidden" name="${k}" value="${v === true ? '1' : v}">`)}
        <label for="sort" class="sr-only">Sort</label>
        <select id="sort" name="sort">${Object.entries(sorts).map(([k, v]) => html`<option value="${k}" ${f.sort === k ? 'selected' : ''}>${v}</option>`)}</select>
        <noscript><button class="btn btn-sm">Apply</button></noscript>
      </form>
    </div>

    <div class="browse">
      <aside class="filters" id="filters">
        <form action="/browse" class="filterform" data-autosubmit>
          ${f.q ? html`<input type="hidden" name="q" value="${f.q}">` : ''}
          ${f.tag ? html`<input type="hidden" name="tag" value="${f.tag}">` : ''}
          ${f.category ? html`<input type="hidden" name="category" value="${f.category}">` : ''}
          ${f.sort !== 'new' ? html`<input type="hidden" name="sort" value="${f.sort}">` : ''}
          ${select('f-software', 'software', 'Works with', software.map((s) => [s.id, s.name]), f.software)}
          ${select('f-kind', 'kind', 'File type', Object.entries(kinds).map(([id, k]) => [id, k.name]), f.kind)}
          ${select('f-license', 'license', 'License', licenses.map((l) => [l.id, l.short]), f.license)}
          <fieldset class="field">
            <legend>Usage</legend>
            <label class="switch"><input type="checkbox" name="commercial" value="1" ${f.commercial ? 'checked' : ''}><span class="switch-ui"></span><span>Commercial use OK</span></label>
            <label class="switch"><input type="checkbox" name="noattr" value="1" ${f.noAttribution ? 'checked' : ''}><span class="switch-ui"></span><span>No credit required</span></label>
          </fieldset>
          <noscript><button class="btn btn-primary btn-block" type="submit">Apply filters</button></noscript>
        </form>
      </aside>

      <div class="results">
        ${active.length ? html`<div class="chips active-chips">
          ${active.map(([label, change]) => html`<a class="chip chip-x" href="${filterLink(f, change)}" aria-label="Remove filter: ${label}">${label}${icon('x')}</a>`)}
          <a class="link-quiet" href="/browse">Clear all</a>
        </div>` : ''}
        <h2 class="sr-only">Results</h2>
        ${result.items.length ? assetGrid(result.items) : emptyState('Nothing matches', 'Try different words, or remove a filter or two.',
    active.length ? html`<a class="btn btn-secondary" href="/browse">Clear filters</a>` : '')}
        ${pagination(result, '/browse', queryObj)}
      </div>
    </div>
  </div>`;
  return layout(ctx, { title: heading, body, og: { url: ctx.absolute(filterLink(f, {})) } });
}

function socialLinks(ctx, socials = {}, website = '') {
  const labels = ctx.config.socialPlatforms || {};
  const items = Object.entries(socials).filter(([k]) => labels[k]);
  let host = '';
  try { host = website ? new URL(website).host.replace(/^www\./, '') : ''; } catch { host = ''; }
  if (!items.length && !host) return '';
  return html`<div class="socials">
    ${items.map(([k, url]) => html`<a class="social" href="${url}" rel="me nofollow noopener" target="_blank" aria-label="${labels[k]}" title="${labels[k]}">${icon(k)}</a>`)}
    ${host ? html`<a class="social social-web" href="${website}" rel="me nofollow ugc noopener" target="_blank">${icon('globe')}<span>${host}</span></a>` : ''}
  </div>`;
}

function profile(ctx, { profile: p, stats, result, sort, sorts }) {
  const own = ctx.user && ctx.user.id === p.id;
  const body = html`
  <div class="container">
    <header class="profile">
      <div class="profile-banner" aria-hidden="true"></div>
      <div class="profile-row">
        ${avatar(p, 'xl')}
        <div class="profile-actions">
          ${own ? html`<a class="btn btn-secondary btn-sm" href="/settings">${icon('edit')}<span>Edit profile</span></a>` : ''}
          <button type="button" class="btn btn-secondary btn-sm" data-share data-share-title="${p.display_name} on ${ctx.config.siteName}" data-share-url="${ctx.absolute(`/u/${p.username}`)}" data-copy="${ctx.absolute(`/u/${p.username}`)}">${icon('share')}<span>Share</span></button>
        </div>
      </div>
      <div class="profile-main">
        <h1>${p.display_name}${p.role === 'admin' ? html`<span class="pill pill-brand">Moderator</span>` : ''}</h1>
        <p class="profile-handle">@${p.username} · Joined ${formatDate(p.created_at)}</p>
        ${p.bio ? html`<div class="prose profile-bio">${richText(p.bio)}</div>` : ''}
        ${socialLinks(ctx, p.socials, p.website)}
        <div class="profile-stats">
          <div><strong>${formatCount(stats.uploads)}</strong><span>uploads</span></div>
          <div><strong>${formatCount(stats.downloads)}</strong><span>downloads</span></div>
        </div>
        ${p.banned ? html`<div class="notice notice-danger">${icon('alert')}<div>This account is suspended.</div></div>` : ''}
      </div>
    </header>
    <section class="section section-tight">
      ${sectionHead('Uploads', null, html`<nav class="seg" aria-label="Sort uploads">${Object.entries(sorts).map(([k, v]) => html`<a href="${pageHref(`/u/${p.username}`, { sort: k === 'new' ? '' : k }, 1)}" ${sort === k ? raw('aria-current="page"') : ''}>${v}</a>`)}</nav>`)}
      ${result.items.length ? assetGrid(result.items, { hideUser: true }) : emptyState('No public uploads yet', own ? 'Anything you upload as public shows up here.' : `${p.display_name} hasn't shared anything publicly yet.`,
    own ? html`<a class="btn btn-primary" href="/upload">${icon('upload')}<span>Upload</span></a>` : '', 'upload')}
      ${pagination(result, `/u/${p.username}`, { sort: sort === 'new' ? '' : sort })}
    </section>
  </div>`;
  return layout(ctx, {
    title: `${p.display_name} (@${p.username})`, description: p.bio || `Free video editing resources shared by ${p.display_name}.`, body,
    og: { url: ctx.absolute(`/u/${p.username}`), image: p.avatar_url || null, type: 'profile' },
  });
}

function saved(ctx, { result }) {
  const body = html`
  <div class="container">
    <header class="pagehead"><div><h1>Saved</h1><p class="sub">Only you can see this list.</p></div></header>
    <h2 class="sr-only">Saved resources</h2>
    ${result.items.length ? assetGrid(result.items) : emptyState('Nothing saved yet', 'Tap Save on any resource and it shows up here.', html`<a class="btn btn-secondary" href="/browse">Explore resources</a>`, 'bookmark')}
    ${pagination(result, '/saved')}
  </div>`;
  return layout(ctx, { title: 'Saved', body, noindex: true });
}

function statusPill(a) {
  if (a.status !== 'active') return html`<span class="pill pill-danger" title="${a.removed_reason || ''}">Removed</span>`;
  if (a.expired) return html`<span class="pill pill-danger">${a.expired === 'limit' ? 'Limit reached' : 'Expired'}</span>`;
  if (a.processing) return html`<span class="pill pill-warn">Processing</span>`;
  if (a.locked || a.expires_at || a.max_downloads) return html`<span class="pill pill-brand">Private link</span>`;
  return a.visibility === 'unlisted' ? html`<span class="pill">Unlisted</span>` : html`<span class="pill pill-ok">Public</span>`;
}

function dashboard(ctx, { result, stats, used, quota }) {
  const body = html`
  <div class="container">
    <header class="pagehead">
      <div><h1>My uploads</h1><p class="sub">Your files, their links and how they're doing.</p></div>
      <a class="btn btn-primary" href="/upload">${icon('upload')}<span>Upload</span></a>
    </header>
    <div class="statgrid">
      <div class="stat"><span class="stat-icon">${icon('box')}</span><p class="stat-label">Files</p><p class="stat-num">${formatCount(stats.uploads)}</p></div>
      <div class="stat"><span class="stat-icon">${icon('download')}</span><p class="stat-label">Downloads</p><p class="stat-num">${formatCount(stats.downloads)}</p></div>
      <div class="stat stat-wide"><span class="stat-icon">${icon('layout')}</span><p class="stat-label">Storage</p>${meter(used, quota)}</div>
    </div>
    ${result.items.length ? html`<ul class="rows">
      ${result.items.map((a) => html`<li class="row" ${hue(a.category)} data-reveal>
        <a class="row-thumb" href="${a.url}" tabindex="-1" aria-hidden="true">${media(a)}</a>
        <div class="row-main">
          <a class="row-title" href="${a.url}">${a.title}</a>
          <p class="row-meta">${a.category.name} · .${a.file_ext} · ${formatBytes(a.file_size)} · <time datetime="${new Date(a.created_at).toISOString()}" title="${formatDate(a.created_at)}">${timeAgo(a.created_at)}</time></p>
          <p class="row-flags">${statusPill(a)}${shareFlags(a)}</p>
        </div>
        <dl class="row-stats">
          <div><dt>Downloads</dt><dd>${formatCount(a.downloads)}</dd></div>
          <div><dt>Views</dt><dd>${formatCount(a.views)}</dd></div>
          <div><dt>Saves</dt><dd>${formatCount(a.favorites)}</dd></div>
        </dl>
        <div class="row-actions">
          <button type="button" class="btn btn-secondary btn-sm" data-copy="${a.shareUrl}">${icon('link')}<span>Copy link</span></button>
          <a class="btn btn-ghost btn-sm" href="${a.url}/edit">${icon('edit')}<span>Edit</span></a>
        </div>
      </li>`)}
    </ul>` : emptyState('No uploads yet', 'Your files, their share links and download counts will show up here.', html`<a class="btn btn-primary" href="/upload">${icon('upload')}<span>Upload your first file</span></a>`, 'upload')}
    ${pagination(result, '/dashboard')}
  </div>`;
  return layout(ctx, { title: 'My uploads', body, noindex: true });
}

module.exports = { home, browse, profile, saved, dashboard };
