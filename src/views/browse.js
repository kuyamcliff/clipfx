'use strict';
const { html, formatCount, formatBytes, formatDate, timeAgo, richText } = require('../html');
const { layout } = require('./layout');
const { icon, avatar, csrfField, assetGrid, pagination, emptyState, meter, pageHref } = require('./components');
const { CATEGORIES, SOFTWARE, LICENSES, KINDS, CATEGORY_MAP, SOFTWARE_MAP, LICENSE_MAP } = require('../catalog');

function heroTimeline() {
  // Decorative NLE-style timeline.
  const tracks = [
    [[0, 18, 265], [20, 30, 210], [52, 22, 190], [76, 24, 150]],
    [[6, 26, 25], [36, 14, 330], [54, 34, 45]],
    [[0, 40, 0], [44, 20, 290], [68, 32, 0]],
  ];
  return html`<div class="timeline" aria-hidden="true">
    <div class="timeline-ruler">${Array.from({ length: 12 }, (_, i) => html`<span>00:0${Math.floor(i / 2)}:${i % 2 ? '12' : '00'}</span>`)}</div>
    ${tracks.map((t, i) => html`<div class="track"><span class="track-label">${i === 2 ? 'A1' : `V${2 - i}`}</span><div class="track-lane">
      ${t.map(([x, w, h]) => html`<span class="clip ${i === 2 ? 'clip-audio' : ''}" style="left:${x}%;width:${w}%;--h:${h}"></span>`)}
    </div></div>`)}
    <span class="playhead"></span>
  </div>`;
}

function home(ctx, { stats, categories, fresh, trending }) {
  const { config } = ctx;
  const body = html`
  <section class="hero">
    <div class="container hero-inner">
      <div class="hero-copy">
        <span class="eyebrow-pill">${icon('heart')}Nonprofit · Free forever · No ads</span>
        <h1>Free editing assets, <span class="grad">shared by editors.</span></h1>
        <p class="lead">Footage, transitions, LUTs, overlays, templates and sound effects from video editors and motion designers. Upload what you make, share a link, help someone ship their next edit.</p>
        <form class="hero-search" action="/browse" role="search">
          ${icon('search')}
          <input type="search" name="q" placeholder="Try “film grain”, “whoosh”, “lower third”…" aria-label="Search assets">
          <button class="btn btn-primary" type="submit">Search</button>
        </form>
        <div class="hero-cta">
          <a class="btn btn-secondary" href="${ctx.user ? '/upload' : '/signup?next=/upload'}">${icon('upload')}Share your work</a>
          <a class="link-muted" href="/about">How it works →</a>
        </div>
      </div>
      <div class="hero-art">${heroTimeline()}</div>
    </div>
    <div class="container stats-row">
      <div><strong>${formatCount(stats.assets)}</strong><span>free assets</span></div>
      <div><strong>${formatCount(stats.downloads)}</strong><span>downloads</span></div>
      <div><strong>${formatCount(stats.creators)}</strong><span>creators</span></div>
      <div><strong>$0</strong><span>forever</span></div>
    </div>
  </section>

  <div class="container">
    <section class="section">
      <div class="section-head"><h2>Browse by category</h2><a href="/browse">All assets →</a></div>
      <div class="category-grid">
        ${categories.map((c) => html`<a class="category-card" href="/browse?category=${c.id}" style="--h:${c.hue}">
          <span class="category-icon">${icon(c.icon)}</span>
          <span class="category-text"><strong>${c.name}</strong><span>${c.count ? `${formatCount(c.count)} assets` : c.blurb}</span></span>
        </a>`)}
      </div>
    </section>

    ${trending.length ? html`<section class="section">
      <div class="section-head"><h2>Trending this week</h2><a href="/browse?sort=trending">See more →</a></div>
      ${assetGrid(trending)}
    </section>` : ''}

    <section class="section">
      <div class="section-head"><h2>Fresh uploads</h2><a href="/browse?sort=new">See more →</a></div>
      ${fresh.length ? assetGrid(fresh) : emptyState('upload', 'Nothing here yet', 'Be the first to share something with the community.',
    html`<a class="btn btn-primary" href="/upload">${icon('upload')}Upload the first asset</a>`)}
    </section>

    <section class="section how">
      <h2>How it works</h2>
      <div class="how-grid">
        <div class="how-step"><span class="how-num">1</span><h3>Upload</h3><p>Drop in a clip, LUT, template, sound or ZIP pack. We generate thumbnails and previews automatically.</p></div>
        <div class="how-step"><span class="how-num">2</span><h3>Pick a license</h3><p>CC0, our Free Use license or a Creative Commons option — so downloaders know exactly what they can do.</p></div>
        <div class="how-step"><span class="how-num">3</span><h3>Share the link</h3><p>Every asset gets a short link. Post it in your video description, Discord or tutorial. Make it unlisted if you like.</p></div>
      </div>
    </section>

    <section class="section donate-band">
      <div>
        <h2>Kept alive by the community</h2>
        <p>${config.siteName} is a nonprofit. There are no ads, no premium tier and no tracking. Donations pay for storage and bandwidth — that’s it.</p>
      </div>
      <div class="btn-row">
        <a class="btn btn-primary" href="/donate">${icon('heart')}Donate</a>
        <a class="btn btn-ghost" href="/about">Our mission</a>
      </div>
    </section>
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
    f.q && ['Search', `“${f.q}”`, { q: '' }],
    f.category && ['Category', CATEGORY_MAP[f.category].name, { category: '' }],
    f.software && ['Software', SOFTWARE_MAP[f.software].name, { software: '' }],
    f.license && ['License', LICENSE_MAP[f.license].short, { license: '' }],
    f.kind && ['Type', KINDS[f.kind].name, { kind: '' }],
    f.tag && ['Tag', `#${f.tag}`, { tag: '' }],
    f.commercial && ['', 'Commercial use OK', { commercial: false }],
    f.noAttribution && ['', 'No credit required', { noAttribution: false }],
  ].filter(Boolean);
  const heading = f.category ? CATEGORY_MAP[f.category].name : f.tag ? `#${f.tag}` : f.q ? `Results for “${f.q}”` : 'All assets';

  const body = html`
  <div class="container browse">
    <header class="page-head browse-head">
      <div>
        <h1>${heading}</h1>
        <p class="muted">${f.category ? CATEGORY_MAP[f.category].blurb : 'Free to download. Every asset shows its license.'} · ${formatCount(result.total)} ${result.total === 1 ? 'result' : 'results'}</p>
      </div>
      <form class="sort-form" action="/browse" data-autosubmit>
        ${Object.entries(queryObj).filter(([k, v]) => v && k !== 'sort').map(([k, v]) => html`<input type="hidden" name="${k}" value="${v === true ? '1' : v}">`)}
        <label for="sort" class="small muted">Sort</label>
        <select id="sort" name="sort">${Object.entries(sorts).map(([k, v]) => html`<option value="${k}" ${f.sort === k ? 'selected' : ''}>${v}</option>`)}</select>
        <noscript><button class="btn btn-ghost btn-sm">Apply</button></noscript>
      </form>
    </header>

    <div class="browse-layout">
      <aside class="filters">
        <details class="filters-toggle" open data-filters>
          <summary>${icon('sliders')}Filters</summary>
          <form action="/browse" class="filter-form" data-autosubmit>
            ${f.q ? html`<input type="hidden" name="q" value="${f.q}">` : ''}
            ${f.tag ? html`<input type="hidden" name="tag" value="${f.tag}">` : ''}
            ${f.sort !== 'new' ? html`<input type="hidden" name="sort" value="${f.sort}">` : ''}
            <div class="filter-group">
              <label for="f-category">Category</label>
              <select id="f-category" name="category"><option value="">All categories</option>
                ${categories.map((c) => html`<option value="${c.id}" ${f.category === c.id ? 'selected' : ''}>${c.name}${c.count ? ` (${c.count})` : ''}</option>`)}</select>
            </div>
            <div class="filter-group">
              <label for="f-software">Software</label>
              <select id="f-software" name="software"><option value="">Any software</option>
                ${SOFTWARE.map((s) => html`<option value="${s.id}" ${f.software === s.id ? 'selected' : ''}>${s.name}</option>`)}</select>
            </div>
            <div class="filter-group">
              <label for="f-kind">File type</label>
              <select id="f-kind" name="kind"><option value="">Any type</option>
                ${Object.entries(KINDS).map(([id, k]) => html`<option value="${id}" ${f.kind === id ? 'selected' : ''}>${k.name}</option>`)}</select>
            </div>
            <div class="filter-group">
              <label for="f-license">License</label>
              <select id="f-license" name="license"><option value="">Any license</option>
                ${LICENSES.map((l) => html`<option value="${l.id}" ${f.license === l.id ? 'selected' : ''}>${l.short}</option>`)}</select>
            </div>
            <div class="filter-group">
              <label class="check"><input type="checkbox" name="commercial" value="1" ${f.commercial ? 'checked' : ''}> Commercial use OK</label>
              <label class="check"><input type="checkbox" name="noattr" value="1" ${f.noAttribution ? 'checked' : ''}> No credit required</label>
            </div>
            <noscript><button class="btn btn-primary btn-block" type="submit">Apply filters</button></noscript>
          </form>
        </details>
      </aside>

      <div class="browse-results">
        ${active.length ? html`<div class="active-filters">
          ${active.map(([k, v, change]) => html`<a class="chip chip-removable" href="${filterLink(f, change)}" aria-label="Remove filter ${v}">${k ? html`<span class="muted">${k}:</span> ` : ''}${v}${icon('x')}</a>`)}
          <a class="link-muted small" href="/browse">Clear all</a>
        </div>` : ''}
        ${result.items.length ? assetGrid(result.items) : emptyState('search', 'No assets found', 'Try different keywords or remove some filters.',
    html`<a class="btn btn-secondary" href="/browse">Reset filters</a>`)}
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
        <h1>${p.display_name}${p.role === 'admin' ? html` <span class="pill" title="Moderator">${icon('shield')}Mod</span>` : ''}</h1>
        <p class="muted">@${p.username} · Joined ${formatDate(p.created_at)}</p>
        ${p.bio ? html`<div class="prose">${richText(p.bio)}</div>` : ''}
        ${host ? html`<a class="profile-link" href="${p.website}" rel="nofollow ugc noopener" target="_blank">${icon('globe')}${host}</a>` : ''}
        ${p.banned ? html`<p class="notice notice-danger">${icon('alert')}This account is suspended.</p>` : ''}
      </div>
      <div class="profile-stats">
        <div><strong>${formatCount(stats.uploads)}</strong><span>uploads</span></div>
        <div><strong>${formatCount(stats.downloads)}</strong><span>downloads</span></div>
      </div>
      ${own ? html`<div class="btn-row"><a class="btn btn-secondary" href="/settings">${icon('edit')}Edit profile</a></div>` : ''}
    </header>
    <section class="section">
      <div class="section-head">
        <h2>Uploads</h2>
        <div class="tabs-inline">${Object.entries(sorts).map(([k, v]) => html`<a href="${pageHref(`/u/${p.username}`, { sort: k === 'new' ? '' : k }, 1)}" class="${sort === k ? 'active' : ''}">${v}</a>`)}</div>
      </div>
      ${result.items.length ? assetGrid(result.items, { hideUser: true }) : emptyState('box', 'No public uploads yet', own ? 'Share your first asset — it only takes a minute.' : `${p.display_name} hasn’t shared anything publicly yet.`,
    own ? html`<a class="btn btn-primary" href="/upload">${icon('upload')}Upload</a>` : '')}
      ${pagination(result, `/u/${p.username}`, { sort: sort === 'new' ? '' : sort })}
    </section>
  </div>`;
  return layout(ctx, { title: `${p.display_name} (@${p.username})`, description: p.bio || `Free editing assets shared by ${p.display_name}.`, body, og: { url: ctx.absolute(`/u/${p.username}`) } });
}

function saved(ctx, { result }) {
  const body = html`
  <div class="container">
    <header class="page-head"><h1>Saved assets</h1><p class="muted">Your personal collection. Only you can see this list.</p></header>
    ${result.items.length ? assetGrid(result.items) : emptyState('bookmark', 'Nothing saved yet', 'Tap the heart on any asset to keep it here for later.', html`<a class="btn btn-primary" href="/browse">Browse assets</a>`)}
    ${pagination(result, '/saved')}
  </div>`;
  return layout(ctx, { title: 'Saved', body, noindex: true });
}

function dashboard(ctx, { result, stats, used, quota }) {
  const statusBadge = (a) => {
    if (a.status !== 'active') return html`<span class="status status-danger" title="${a.removed_reason || ''}">Removed</span>`;
    if (a.processing) return html`<span class="status status-warn">Processing</span>`;
    return a.visibility === 'unlisted' ? html`<span class="status">${icon('lock')}Unlisted</span>` : html`<span class="status status-ok">${icon('globe')}Public</span>`;
  };
  const body = html`
  <div class="container">
    <header class="page-head browse-head">
      <div><h1>My uploads</h1><p class="muted">Manage your assets and grab share links.</p></div>
      <a class="btn btn-primary" href="/upload">${icon('upload')}Upload new</a>
    </header>
    <div class="dash-stats">
      <div class="panel stat"><span class="muted small">Assets</span><strong>${formatCount(stats.uploads)}</strong></div>
      <div class="panel stat"><span class="muted small">Total downloads</span><strong>${formatCount(stats.downloads)}</strong></div>
      <div class="panel stat stat-wide"><span class="muted small">Storage</span>${meter(used, quota)}</div>
    </div>
    ${result.items.length ? html`<div class="panel table-wrap">
      <table class="table">
        <thead><tr><th scope="col">Asset</th><th scope="col">Status</th><th scope="col" class="num">Downloads</th><th scope="col" class="num">Views</th><th scope="col" class="num">Saves</th><th scope="col">Uploaded</th><th scope="col"><span class="visually-hidden">Actions</span></th></tr></thead>
        <tbody>
        ${result.items.map((a) => html`<tr>
          <td><a class="table-asset" href="${a.url}"><span class="table-thumb" style="--h:${a.category.hue}">${a.thumbUrl ? html`<img src="${a.thumbUrl}" alt="" loading="lazy">` : icon(a.category.icon)}</span>
            <span><strong>${a.title}</strong><span class="muted small">${a.category.name} · .${a.file_ext} · ${formatBytes(a.file_size)}</span></span></a></td>
          <td>${statusBadge(a)}</td>
          <td class="num">${formatCount(a.downloads)}</td>
          <td class="num">${formatCount(a.views)}</td>
          <td class="num">${formatCount(a.favorites)}</td>
          <td><time title="${formatDate(a.created_at)}">${timeAgo(a.created_at)}</time></td>
          <td class="actions">
            <button type="button" class="btn btn-ghost btn-sm" data-copy="${a.shareUrl}" title="Copy share link">${icon('link')}<span>Copy link</span></button>
            <a class="btn btn-ghost btn-sm" href="${a.url}/edit" title="Edit">${icon('edit')}<span class="visually-hidden">Edit</span></a>
          </td>
        </tr>`)}
        </tbody>
      </table>
    </div>` : emptyState('upload', 'You haven’t uploaded anything yet', 'Share a transition, LUT, sound or template — the community will thank you.', html`<a class="btn btn-primary" href="/upload">${icon('upload')}Upload your first asset</a>`)}
    ${pagination(result, '/dashboard')}
  </div>`;
  void csrfField;
  return layout(ctx, { title: 'My uploads', body, noindex: true });
}

module.exports = { home, browse, profile, saved, dashboard };
