'use strict';
const { html, raw, formatCount, formatBytes, formatDate, timeAgo, richText } = require('../src/html');
const { layout } = require('./layout');
const { icon, hue, avatar, assetGrid, pagination, emptyState, meter, pageHref, sectionHead, media } = require('./components');

const SUGGESTIONS = ['light leak', 'whoosh', 'film grain', 'lower third', 'glitch', 'drone'];

function bins(categories, activeId) {
  return html`<div class="bins">
    ${categories.map((c) => html`<a class="bin" href="/browse?category=${c.id}" ${hue(c)} ${activeId === c.id ? raw('aria-current="page"') : ''}>
      <span class="bin-icon">${icon(c.icon)}</span>
      <span class="bin-name">${c.name}</span>
      <span class="bin-count">${formatCount(c.count)}</span>
    </a>`)}
  </div>`;
}

function home(ctx, { stats, categories, fresh, trending }) {
  const body = html`
  <section class="hero">
    <div class="wrap hero-in">
      <div class="hero-copy">
        <h1>Free assets for people who edit video.</h1>
        <p class="lede">Footage, transitions, LUTs, overlays, templates and sound, uploaded by editors and motion designers. Download anything, no account needed.</p>
        <form class="bigsearch" action="/browse" role="search">
          ${icon('search')}
          <input type="search" name="q" placeholder="Search the library" aria-label="Search assets">
          <button class="btn btn-accent" type="submit">Search</button>
        </form>
        <p class="suggest"><span>Try</span>${SUGGESTIONS.map((s) => html`<a href="/browse?q=${encodeURIComponent(s)}">${s}</a>`)}</p>
      </div>
      <dl class="hero-stats">
        <div><dt>Assets</dt><dd>${formatCount(stats.assets)}</dd></div>
        <div><dt>Downloads</dt><dd>${formatCount(stats.downloads)}</dd></div>
        <div><dt>Creators</dt><dd>${formatCount(stats.creators)}</dd></div>
      </dl>
    </div>
    <div class="ruler" aria-hidden="true"></div>
  </section>

  <div class="wrap">
    <section class="section">
      ${sectionHead('Categories', ['/browse', 'Everything'])}
      ${bins(categories)}
    </section>

    <section class="section">
      ${sectionHead('New uploads', ['/browse', 'See all'])}
      ${fresh.length ? assetGrid(fresh) : emptyState('The library is empty', 'Nobody has uploaded anything yet. You could be first.',
    html`<a class="btn btn-accent" href="/upload">${icon('upload')}<span>Upload an asset</span></a>`)}
    </section>

    ${trending.length ? html`<section class="section">
      ${sectionHead('Popular right now', ['/browse?sort=trending', 'See all'])}
      ${assetGrid(trending)}
    </section>` : ''}

    ${ctx.user ? '' : html`<section class="pitch">
      <div>
        <h2>Got a folder of things you made once?</h2>
        <p>Light leaks, a LUT that nailed a look, a set of whooshes. Upload it, pick a license, and share one link. People can download it without signing up.</p>
      </div>
      <a class="btn btn-accent btn-lg" href="/signup?next=/upload">Create a free account</a>
    </section>`}
  </div>`;
  return layout(ctx, { body, og: { url: ctx.absolute('/') } });
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
  const heading = cat ? cat.name : f.tag ? `#${f.tag}` : f.q ? `Results for "${f.q}"` : 'All assets';

  const body = html`
  <div class="wrap">
    <header class="pagehead browsehead" ${cat ? hue(cat) : ''}>
      <div>
        <h1>${cat ? html`<span class="swatch lg" aria-hidden="true"></span>` : ''}${heading}</h1>
        <p class="sub">${cat ? `${cat.blurb} ` : ''}<span class="num">${formatCount(result.total)}</span> ${result.total === 1 ? 'asset' : 'assets'}</p>
      </div>
      <div class="browse-controls">
        <button type="button" class="btn btn-sm filter-toggle" aria-expanded="false" aria-controls="filters" data-filter-toggle>
          ${icon('filter')}<span>Filters${filterCount ? ` (${filterCount})` : ''}</span>
        </button>
        <form class="sortform" action="/browse" data-autosubmit>
          ${Object.entries(queryObj).filter(([k, v]) => v && k !== 'sort').map(([k, v]) => html`<input type="hidden" name="${k}" value="${v === true ? '1' : v}">`)}
          <label for="sort">Sort</label>
          <select id="sort" name="sort">${Object.entries(sorts).map(([k, v]) => html`<option value="${k}" ${f.sort === k ? 'selected' : ''}>${v}</option>`)}</select>
          <noscript><button class="btn btn-sm">Apply</button></noscript>
        </form>
      </div>
    </header>

    <div class="browse">
      <aside class="filters" id="filters">
        <form action="/browse" class="filterform" data-autosubmit>
          ${f.q ? html`<input type="hidden" name="q" value="${f.q}">` : ''}
          ${f.tag ? html`<input type="hidden" name="tag" value="${f.tag}">` : ''}
          ${f.sort !== 'new' ? html`<input type="hidden" name="sort" value="${f.sort}">` : ''}
          ${select('f-category', 'category', 'Category', categories.map((c) => [c.id, c.count ? `${c.name} (${c.count})` : c.name]), f.category)}
          ${select('f-software', 'software', 'Works with', software.map((s) => [s.id, s.name]), f.software)}
          ${select('f-kind', 'kind', 'File type', Object.entries(kinds).map(([id, k]) => [id, k.name]), f.kind)}
          ${select('f-license', 'license', 'License', licenses.map((l) => [l.id, l.short]), f.license)}
          <fieldset class="field">
            <legend>Usage</legend>
            <label class="check"><input type="checkbox" name="commercial" value="1" ${f.commercial ? 'checked' : ''}><span>Commercial use OK</span></label>
            <label class="check"><input type="checkbox" name="noattr" value="1" ${f.noAttribution ? 'checked' : ''}><span>No credit required</span></label>
          </fieldset>
          <noscript><button class="btn btn-accent btn-block" type="submit">Apply filters</button></noscript>
        </form>
      </aside>

      <div class="results">
        ${active.length ? html`<div class="chips">
          ${active.map(([label, change]) => html`<a class="chip" href="${filterLink(f, change)}" aria-label="Remove filter: ${label}">${label}${icon('x')}</a>`)}
          <a class="chip-clear" href="/browse">Clear all</a>
        </div>` : ''}
        ${result.items.length ? assetGrid(result.items) : emptyState('Nothing matches', 'Try different words, or remove a filter or two.',
    active.length ? html`<a class="btn" href="/browse">Clear filters</a>` : '')}
        ${pagination(result, '/browse', queryObj)}
      </div>
    </div>
  </div>`;
  return layout(ctx, { title: heading, body, og: { url: ctx.absolute(filterLink(f, {})) } });
}

function profile(ctx, { profile: p, stats, result, sort, sorts }) {
  const own = ctx.user && ctx.user.id === p.id;
  let host = '';
  try { host = p.website ? new URL(p.website).host.replace(/^www\./, '') : ''; } catch { host = ''; }
  const body = html`
  <div class="wrap">
    <header class="profile">
      ${avatar(p, 'xl')}
      <div class="profile-main">
        <h1>${p.display_name}</h1>
        <p class="profile-handle">@${p.username}${p.role === 'admin' ? html`<span class="tag-pill">Moderator</span>` : ''}</p>
        ${p.bio ? html`<div class="prose profile-bio">${richText(p.bio)}</div>` : ''}
        <ul class="profile-facts">
          <li><b>${formatCount(stats.uploads)}</b> uploads</li>
          <li><b>${formatCount(stats.downloads)}</b> downloads</li>
          <li>Joined ${formatDate(p.created_at)}</li>
          ${host ? html`<li><a href="${p.website}" rel="nofollow ugc noopener" target="_blank">${icon('link')}${host}</a></li>` : ''}
        </ul>
        ${p.banned ? html`<div class="notice notice-danger">This account is suspended.</div>` : ''}
      </div>
      ${own ? html`<a class="btn btn-sm profile-edit" href="/settings">Edit profile</a>` : ''}
    </header>
    <section class="section">
      ${sectionHead('Uploads', null, html`<nav class="seg" aria-label="Sort uploads">${Object.entries(sorts).map(([k, v]) => html`<a href="${pageHref(`/u/${p.username}`, { sort: k === 'new' ? '' : k }, 1)}" ${sort === k ? raw('aria-current="page"') : ''}>${v}</a>`)}</nav>`)}
      ${result.items.length ? assetGrid(result.items, { hideUser: true }) : emptyState('No public uploads', own ? 'Anything you upload as public shows up here.' : `${p.display_name} hasn't shared anything publicly yet.`,
    own ? html`<a class="btn btn-accent" href="/upload">${icon('upload')}<span>Upload</span></a>` : '')}
      ${pagination(result, `/u/${p.username}`, { sort: sort === 'new' ? '' : sort })}
    </section>
  </div>`;
  return layout(ctx, { title: `${p.display_name} (@${p.username})`, description: p.bio || `Free editing assets shared by ${p.display_name}.`, body, og: { url: ctx.absolute(`/u/${p.username}`) } });
}

function saved(ctx, { result }) {
  const body = html`
  <div class="wrap">
    <header class="pagehead"><div><h1>Saved</h1><p class="sub">Only you can see this list.</p></div></header>
    ${result.items.length ? assetGrid(result.items) : emptyState('Nothing saved yet', 'Hit Save on any asset page and it will show up here.', html`<a class="btn" href="/browse">Browse the library</a>`)}
    ${pagination(result, '/saved')}
  </div>`;
  return layout(ctx, { title: 'Saved', body, noindex: true });
}

function statusPill(a) {
  if (a.status !== 'active') return html`<span class="pill pill-danger" title="${a.removed_reason || ''}">Removed</span>`;
  if (a.processing) return html`<span class="pill pill-warn">Processing</span>`;
  return a.visibility === 'unlisted' ? html`<span class="pill">Unlisted</span>` : html`<span class="pill pill-ok">Public</span>`;
}

function dashboard(ctx, { result, stats, used, quota }) {
  const body = html`
  <div class="wrap">
    <header class="pagehead">
      <div><h1>My uploads</h1><p class="sub">Share links, download counts and storage.</p></div>
      <a class="btn btn-accent" href="/upload">${icon('upload')}<span>Upload</span></a>
    </header>
    <div class="tiles">
      <div class="tile-stat"><p class="tile-label">Assets</p><p class="tile-num">${formatCount(stats.uploads)}</p></div>
      <div class="tile-stat"><p class="tile-label">Downloads</p><p class="tile-num">${formatCount(stats.downloads)}</p></div>
      <div class="tile-stat tile-wide"><p class="tile-label">Storage</p>${meter(used, quota)}</div>
    </div>
    ${result.items.length ? html`<ul class="rows">
      ${result.items.map((a) => html`<li class="row" ${hue(a.category)}>
        <a class="row-thumb" href="${a.url}" tabindex="-1" aria-hidden="true">${media(a)}</a>
        <div class="row-main">
          <a class="row-title" href="${a.url}">${a.title}</a>
          <p class="row-meta">${a.category.name} · .${a.file_ext} · ${formatBytes(a.file_size)} · <time datetime="${new Date(a.created_at).toISOString()}" title="${formatDate(a.created_at)}">${timeAgo(a.created_at)}</time></p>
        </div>
        <div class="row-status">${statusPill(a)}</div>
        <dl class="row-stats">
          <div><dt>Downloads</dt><dd>${formatCount(a.downloads)}</dd></div>
          <div><dt>Views</dt><dd>${formatCount(a.views)}</dd></div>
          <div><dt>Saves</dt><dd>${formatCount(a.favorites)}</dd></div>
        </dl>
        <div class="row-actions">
          <button type="button" class="btn btn-sm" data-copy="${a.shareUrl}">${icon('link')}<span>Copy link</span></button>
          <a class="btn btn-sm btn-quiet" href="${a.url}/edit">Edit</a>
        </div>
      </li>`)}
    </ul>` : emptyState('No uploads yet', 'Your assets, their share links and download counts will be listed here.', html`<a class="btn btn-accent" href="/upload">${icon('upload')}<span>Upload your first asset</span></a>`)}
    ${pagination(result, '/dashboard')}
  </div>`;
  return layout(ctx, { title: 'My uploads', body, noindex: true });
}

module.exports = { home, browse, profile, saved, dashboard };
