'use strict';
const { html, formatCount, formatBytes, formatDate, timeAgo, richText } = require('../html');
const { layout } = require('./layout');
const { avatar, assetGrid, pagination, emptyState, meter, pageHref } = require('./components');
const { SOFTWARE, LICENSES, KINDS, CATEGORY_MAP, SOFTWARE_MAP, LICENSE_MAP } = require('../catalog');

function catNav(categories, activeId) {
  return html`<nav class="cat-nav" aria-label="Categories">
    <a href="/browse" class="${!activeId ? 'active' : ''}">All</a>
    ${categories.map((c) => html`<a href="/browse?category=${c.id}" class="${activeId === c.id ? 'active' : ''}">${c.name}${c.count ? html`<span class="n">${c.count}</span>` : ''}</a>`)}
  </nav>`;
}

function home(ctx, { stats, categories, fresh, trending }) {
  const body = html`
  <div class="container">
    <section class="intro">
      <div>
        <h1>Free assets for video editors and motion designers.</h1>
        <p>Footage, transitions, LUTs, overlays, templates and sounds, uploaded by people who make videos. Download anything without an account. ${ctx.user ? '' : html`<a href="/signup?next=/upload">Upload your own</a>.`}</p>
      </div>
      <div>
        <form class="intro-search" action="/browse" role="search">
          <input type="search" name="q" placeholder="film grain, whoosh, lower third…" aria-label="Search assets">
          <button class="btn btn-primary" type="submit">Search</button>
        </form>
        <p class="site-facts">${formatCount(stats.assets)} assets · ${formatCount(stats.downloads)} downloads · ${formatCount(stats.creators)} creators</p>
      </div>
    </section>

    ${catNav(categories)}

    <section class="section">
      <div class="section-head"><h2>New</h2><a href="/browse">All new uploads</a></div>
      ${fresh.length ? assetGrid(fresh) : emptyState(null, 'Nothing here yet', 'No one has uploaded anything so far.',
    html`<a class="btn btn-primary" href="/upload">Upload the first asset</a>`)}
    </section>

    ${trending.length ? html`<section class="section">
      <div class="section-head"><h2>Downloaded most in the last two weeks</h2><a href="/browse?sort=trending">More</a></div>
      ${assetGrid(trending)}
    </section>` : ''}
  </div>`;
  return layout(ctx, { body, og: { url: ctx.absolute('/') } });
}

function filterLink(filters, changes) {
  const merged = { ...filters, ...changes, page: 1 };
  const q = {
    q: merged.q, category: merged.category, software: merged.software, license: merged.license, kind: merged.kind,
    tag: merged.tag, commercial: merged.commercial, noattr: merged.noAttribution, sort: merged.sort === 'new' ? '' : merged.sort,
  };
  return pageHref('/browse', q, 1);
}

function browse(ctx, { filters, result, sorts, categories }) {
  const f = filters;
  const queryObj = {
    q: f.q, category: f.category, software: f.software, license: f.license, kind: f.kind, tag: f.tag,
    commercial: f.commercial, noattr: f.noAttribution, sort: f.sort === 'new' ? '' : f.sort,
  };
  const active = [
    f.q && [`“${f.q}”`, { q: '' }],
    f.category && [CATEGORY_MAP[f.category].name, { category: '' }],
    f.software && [SOFTWARE_MAP[f.software].name, { software: '' }],
    f.license && [LICENSE_MAP[f.license].short, { license: '' }],
    f.kind && [KINDS[f.kind].name, { kind: '' }],
    f.tag && [`#${f.tag}`, { tag: '' }],
    f.commercial && ['Commercial use OK', { commercial: false }],
    f.noAttribution && ['No credit required', { noAttribution: false }],
  ].filter(Boolean);
  const heading = f.category ? CATEGORY_MAP[f.category].name : f.tag ? `#${f.tag}` : f.q ? `“${f.q}”` : 'All assets';

  const body = html`
  <div class="container browse">
    <header class="page-head browse-head">
      <div>
        <h1>${heading}</h1>
        <p class="muted">${f.category ? `${CATEGORY_MAP[f.category].blurb} ` : ''}${formatCount(result.total)} ${result.total === 1 ? 'result' : 'results'}</p>
      </div>
      <form class="sort-form" action="/browse" data-autosubmit>
        ${Object.entries(queryObj).filter(([k, v]) => v && k !== 'sort').map(([k, v]) => html`<input type="hidden" name="${k}" value="${v === true ? '1' : v}">`)}
        <label for="sort" class="label">Sort</label>
        <select id="sort" name="sort">${Object.entries(sorts).map(([k, v]) => html`<option value="${k}" ${f.sort === k ? 'selected' : ''}>${v}</option>`)}</select>
        <noscript><button class="btn btn-sm">Apply</button></noscript>
      </form>
    </header>

    <div class="browse-layout">
      <aside class="filters">
        <details class="filters-toggle" open data-filters>
          <summary>Filters</summary>
          <form action="/browse" class="filter-form" data-autosubmit>
            ${f.q ? html`<input type="hidden" name="q" value="${f.q}">` : ''}
            ${f.tag ? html`<input type="hidden" name="tag" value="${f.tag}">` : ''}
            ${f.sort !== 'new' ? html`<input type="hidden" name="sort" value="${f.sort}">` : ''}
            <div class="filter-group">
              <label for="f-category" class="label">Category</label>
              <select id="f-category" name="category"><option value="">Any</option>
                ${categories.map((c) => html`<option value="${c.id}" ${f.category === c.id ? 'selected' : ''}>${c.name}${c.count ? ` (${c.count})` : ''}</option>`)}</select>
            </div>
            <div class="filter-group">
              <label for="f-software" class="label">Software</label>
              <select id="f-software" name="software"><option value="">Any</option>
                ${SOFTWARE.map((s) => html`<option value="${s.id}" ${f.software === s.id ? 'selected' : ''}>${s.name}</option>`)}</select>
            </div>
            <div class="filter-group">
              <label for="f-kind" class="label">File type</label>
              <select id="f-kind" name="kind"><option value="">Any</option>
                ${Object.entries(KINDS).map(([id, k]) => html`<option value="${id}" ${f.kind === id ? 'selected' : ''}>${k.name}</option>`)}</select>
            </div>
            <div class="filter-group">
              <label for="f-license" class="label">License</label>
              <select id="f-license" name="license"><option value="">Any</option>
                ${LICENSES.map((l) => html`<option value="${l.id}" ${f.license === l.id ? 'selected' : ''}>${l.short}</option>`)}</select>
            </div>
            <div class="filter-group">
              <label class="check"><input type="checkbox" name="commercial" value="1" ${f.commercial ? 'checked' : ''}> Commercial use OK</label>
              <label class="check"><input type="checkbox" name="noattr" value="1" ${f.noAttribution ? 'checked' : ''}> No credit required</label>
            </div>
            <noscript><button class="btn btn-primary btn-block" type="submit">Apply</button></noscript>
          </form>
        </details>
      </aside>

      <div class="browse-results">
        ${active.length ? html`<div class="active-filters">
          <span class="label">Filtered by</span>
          ${active.map(([v, change]) => html`<a href="${filterLink(f, change)}" aria-label="Remove filter ${v}">${v}<span class="x">×</span></a>`)}
          <a class="link-muted" href="/browse">clear</a>
        </div>` : ''}
        ${result.items.length ? assetGrid(result.items) : emptyState(null, 'No matches', 'Try other words or remove a filter.')}
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
  <div class="container">
    <header class="profile-head">
      ${avatar(p, 'xl')}
      <div class="profile-info">
        <h1>${p.display_name}</h1>
        <div class="byline">
          <span class="mono">@${p.username}</span>
          ${p.role === 'admin' ? html`<span class="sep">/</span><span>moderator</span>` : ''}
          <span class="sep">/</span><span>joined ${formatDate(p.created_at)}</span>
          <span class="sep">/</span><span class="mono">${formatCount(stats.uploads)} uploads · ${formatCount(stats.downloads)} downloads</span>
          ${host ? html`<span class="sep">/</span><a href="${p.website}" rel="nofollow ugc noopener" target="_blank">${host}</a>` : ''}
        </div>
        ${p.bio ? html`<div class="prose">${richText(p.bio)}</div>` : ''}
        ${p.banned ? html`<p class="notice notice-danger">This account is suspended.</p>` : ''}
      </div>
      ${own ? html`<a class="btn btn-sm" href="/settings">Edit profile</a>` : ''}
    </header>
    <section class="section">
      <div class="section-head">
        <h2>Uploads</h2>
        <div class="tabs-inline">${Object.entries(sorts).map(([k, v]) => html`<a href="${pageHref(`/u/${p.username}`, { sort: k === 'new' ? '' : k }, 1)}" class="${sort === k ? 'active' : ''}">${v}</a>`)}</div>
      </div>
      ${result.items.length ? assetGrid(result.items, { hideUser: true }) : emptyState(null, 'No public uploads', own ? 'Anything you upload as public shows up here.' : `${p.display_name} hasn’t shared anything publicly yet.`,
    own ? html`<a class="btn btn-primary" href="/upload">Upload</a>` : '')}
      ${pagination(result, `/u/${p.username}`, { sort: sort === 'new' ? '' : sort })}
    </section>
  </div>`;
  return layout(ctx, { title: `${p.display_name} (@${p.username})`, description: p.bio || `Free editing assets shared by ${p.display_name}.`, body, og: { url: ctx.absolute(`/u/${p.username}`) } });
}

function saved(ctx, { result }) {
  const body = html`
  <div class="container">
    <header class="page-head"><h1>Saved</h1><p class="muted">Only you can see this list.</p></header>
    ${result.items.length ? assetGrid(result.items) : emptyState(null, 'Nothing saved', 'Use the Save button on an asset page to keep it here.', html`<a class="btn" href="/browse">Browse</a>`)}
    ${pagination(result, '/saved')}
  </div>`;
  return layout(ctx, { title: 'Saved', body, noindex: true });
}

function dashboard(ctx, { result, stats, used, quota }) {
  const statusLabel = (a) => {
    if (a.status !== 'active') return html`<span class="status status-danger" title="${a.removed_reason || ''}">removed</span>`;
    if (a.processing) return html`<span class="status status-warn">processing</span>`;
    return a.visibility === 'unlisted' ? html`<span class="status">unlisted</span>` : html`<span class="status status-ok">public</span>`;
  };
  const body = html`
  <div class="container">
    <header class="page-head browse-head">
      <h1>My uploads</h1>
      <a class="btn btn-primary" href="/upload">Upload</a>
    </header>
    <div class="summary">
      <span><b>${formatCount(stats.uploads)}</b> assets</span>
      <span><b>${formatCount(stats.downloads)}</b> downloads</span>
      <span class="meter-inline">${formatBytes(used)} of ${formatBytes(quota)} <span class="meter"><span class="meter-fill ${used / quota > 0.9 ? 'danger' : ''}" style="display:block;width:${Math.min(100, (used / quota) * 100).toFixed(1)}%"></span></span></span>
    </div>
    ${result.items.length ? html`<div class="table-wrap">
      <table class="table">
        <thead><tr><th scope="col">Asset</th><th scope="col">Status</th><th scope="col" class="num">Downloads</th><th scope="col" class="num">Views</th><th scope="col" class="num">Saves</th><th scope="col">Uploaded</th><th scope="col"><span class="visually-hidden">Actions</span></th></tr></thead>
        <tbody>
        ${result.items.map((a) => html`<tr>
          <td><a class="table-asset" href="${a.url}"><span class="table-thumb">${a.thumbUrl ? html`<img src="${a.thumbUrl}" alt="" loading="lazy">` : `.${a.file_ext}`}</span>
            <span><strong>${a.title}</strong><span class="mono">${a.category.name} · .${a.file_ext} · ${formatBytes(a.file_size)}</span></span></a></td>
          <td>${statusLabel(a)}</td>
          <td class="num">${formatCount(a.downloads)}</td>
          <td class="num">${formatCount(a.views)}</td>
          <td class="num">${formatCount(a.favorites)}</td>
          <td class="small"><time title="${formatDate(a.created_at)}">${timeAgo(a.created_at)}</time></td>
          <td class="actions">
            <button type="button" class="btn btn-sm" data-copy="${a.shareUrl}"><span>Copy link</span></button>
            <a class="btn btn-sm btn-ghost" href="${a.url}/edit">Edit</a>
          </td>
        </tr>`)}
        </tbody>
      </table>
    </div>` : emptyState(null, 'No uploads yet', 'Your assets, their share links and download counts will be listed here.', html`<a class="btn btn-primary" href="/upload">Upload</a>`)}
    ${pagination(result, '/dashboard')}
  </div>`;
  void meter;
  return layout(ctx, { title: 'My uploads', body, noindex: true });
}

module.exports = { home, browse, profile, saved, dashboard };
