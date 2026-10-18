'use strict';
// Developer pages (name.clipfx.me), the page editor and the analytics dashboard.
const { html, raw, formatCount, formatDate, formatBytes, richText } = require('../src/html');
const { layout } = require('./layout');
const {
  icon, avatar, assetGrid, pagination, emptyState, sectionHead, csrfField, fieldError, invalid, notice, hue, media,
} = require('./components');
const { socialLinks } = require('./browse');

const COVER_LABELS = { gradient: 'Gradient', mesh: 'Mesh', grid: 'Grid', plain: 'Plain' };
const THEME_LABELS = { auto: 'Match visitor', dark: 'Dark', light: 'Light' };
const LAYOUT_LABELS = { grid: 'Grid', list: 'List' };

// Accent → the CSS variables the site's components already use.
const accentStyle = (accent) => {
  const a = /^#[0-9a-f]{6}$/.test(accent || '') ? accent : '#6366f1';
  return `--brand:${a};--brand-mid:${a};--link:color-mix(in srgb, ${a} 80%, var(--text));--brand-soft:color-mix(in srgb, ${a} 16%, transparent)`;
};

// The products on a developer page link to their own short address: name.clipfx.me/<slug>.
const onHost = (items, host) => items.map((a) => ({ ...a, url: host ? `https://${host}/${a.slug}` : a.url }));

function productList(items) {
  return html`<ul class="rows devpage-list">${items.map((a) => html`<li class="row" ${hue(a.category)}>
    <a class="row-thumb" href="${a.url}" tabindex="-1" aria-hidden="true">${media(a)}</a>
    <div class="row-main">
      <a class="row-title" href="${a.url}">${a.title}</a>
      <p class="row-meta">${a.category.name} · .${a.file_ext} · ${formatBytes(a.file_size)} · ${a.license.short || a.license.name}</p>
    </div>
    <dl class="row-stats"><div><dt>Downloads</dt><dd>${formatCount(a.downloads)}</dd></div></dl>
    <div class="row-actions"><a class="btn btn-primary btn-sm" href="${a.url}">${icon('download')}<span>Get it</span></a></div>
  </li>`)}</ul>`;
}

function devPage(ctx, { profile: p, stats, featured = [], result, sort, sorts, host }) {
  const page = p.page || {};
  const own = ctx.user && ctx.user.id === p.id;
  const items = onHost(result.items, host);
  const picks = onHost(featured, host);
  const pageUrl = host ? `https://${host}/` : ctx.absolute(`/u/${p.username}`);
  const products = page.layout === 'list' ? productList(items) : assetGrid(items, { hideUser: true });
  const body = html`
  <div class="devpage cover-${page.cover || 'gradient'}" style="${accentStyle(page.accent)}">
    <div class="container">
      <header class="profile devpage-head">
        <div class="profile-banner devpage-banner" aria-hidden="true"></div>
        <div class="profile-row">
          ${avatar(p, 'xl')}
          <div class="profile-actions">
            ${own ? html`<a class="btn btn-secondary btn-sm" href="${ctx.mainUrl('/settings/page')}">${icon('edit')}<span>Customize page</span></a>` : ''}
            <button type="button" class="btn btn-secondary btn-sm" data-share data-share-title="${p.display_name}" data-share-url="${pageUrl}" data-copy="${pageUrl}">${icon('share')}<span>Share</span></button>
            ${page.cta ? html`<a class="btn btn-primary btn-sm" href="${page.cta.url}" rel="nofollow ugc noopener" target="_blank">${page.cta.label}${icon('arrow')}</a>` : ''}
          </div>
        </div>
        <div class="profile-main">
          <h1>${p.display_name}</h1>
          ${page.headline ? html`<p class="devpage-headline">${page.headline}</p>` : ''}
          <p class="profile-handle">@${p.username} · ${host || ''}</p>
          ${p.bio ? html`<div class="prose profile-bio">${richText(p.bio)}</div>` : ''}
          ${page.show_socials !== false ? socialLinks(ctx, p.socials, p.website) : ''}
          ${page.links && page.links.length ? html`<nav class="chips devpage-links" aria-label="Links">${page.links.map((l) => html`<a class="chip" href="${l.url}" rel="nofollow ugc noopener" target="_blank">${icon('link')}${l.label}</a>`)}</nav>` : ''}
          ${page.show_stats !== false ? html`<div class="profile-stats">
            <div><strong>${formatCount(stats.uploads)}</strong><span>products</span></div>
            <div><strong>${formatCount(stats.downloads)}</strong><span>downloads</span></div>
          </div>` : ''}
        </div>
      </header>
      ${page.about ? html`<section class="section section-tight"><div class="panel prose devpage-about">${richText(page.about)}</div></section>` : ''}
      ${picks.length ? html`<section class="section section-tight">${sectionHead('Featured', null)}${assetGrid(picks, { hideUser: true })}</section>` : ''}
      <section class="section section-tight">
        ${sectionHead('Products', null, html`<nav class="seg" aria-label="Sort products">${Object.entries(sorts).map(([k, v]) => html`<a href="/?${new URLSearchParams(k === 'new' ? {} : { sort: k })}" ${sort === k ? raw('aria-current="page"') : ''}>${v}</a>`)}</nav>`)}
        ${items.length ? products : emptyState('Nothing published yet', own ? 'Publish a product and it appears here.' : `${p.display_name} hasn’t published anything yet.`,
    own ? html`<a class="btn btn-primary" href="${ctx.mainUrl('/upload')}">${icon('upload')}<span>Publish</span></a>` : '', 'upload')}
        ${pagination(result, '/', { sort: sort === 'new' ? '' : sort })}
      </section>
      <p class="devpage-foot">Hosted on <a href="${ctx.mainUrl('/')}">${ctx.config.siteName}</a>. <a href="${ctx.mainUrl('/signup')}">Get your own page</a>.</p>
    </div>
  </div>`;
  return layout(ctx, {
    title: page.headline ? `${p.display_name}: ${page.headline}` : `${p.display_name} (@${p.username})`,
    description: page.headline || p.bio || `Products by ${p.display_name} on ${ctx.config.siteName}.`,
    body, bodyClass: 'is-devpage',
    og: { url: pageUrl, image: p.avatar_url || null, type: 'profile' },
    ldJson: {
      '@context': 'https://schema.org', '@type': 'ProfilePage', url: pageUrl,
      mainEntity: { '@type': 'Person', name: p.display_name, alternateName: p.username, url: pageUrl, description: page.headline || p.bio || undefined },
    },
  });
}

// ---- Page editor ----------------------------------------------------------------------------

function pageSettings(ctx, { page, host, products, errors = {}, values = null }) {
  const opts = ctx.config.pageOptions || { accents: [], themes: ['auto', 'dark', 'light'], layouts: ['grid', 'list'], covers: ['gradient'], maxLinks: 6, maxFeatured: 6 };
  const v = values || page;
  const links = Array.from({ length: opts.maxLinks }, (_, i) => (v.links || [])[i] || { label: '', url: '' });
  const featured = new Set(v.featured || []);
  const radio = (name, value, label, current) => html`<label><input type="radio" name="${name}" value="${value}" ${current === value ? raw('checked') : ''}><span>${label}</span></label>`;
  const body = html`
  <div class="container">
    <header class="pagehead">
      <div><h1>Your page</h1><p class="sub">${host ? html`Live at <a href="https://${host}/" target="_blank" rel="noopener">${host}</a>` : 'Your public developer page.'}</p></div>
      ${host ? html`<a class="btn btn-secondary btn-sm" href="https://${host}/" target="_blank" rel="noopener">${icon('eye')}<span>View page</span></a>` : ''}
    </header>
    ${errors._form ? notice('danger', errors._form) : ''}
    <form method="post" action="/settings/page" class="stack panel">
      ${csrfField(ctx)}
      <div class="field">
        <label for="headline">Headline <span class="opt">up to 120 characters</span></label>
        <input id="headline" name="headline" maxlength="120" value="${v.headline || ''}" placeholder="Fast, tiny tools for developers"${invalid(errors, 'headline')}>
      </div>
      <div class="field">
        <label for="about">About <span class="opt">links and line breaks are kept</span></label>
        <textarea id="about" name="about" rows="6" maxlength="4000" placeholder="What you build, who it’s for, how to get support.">${v.about || ''}</textarea>
      </div>

      <fieldset class="field">
        <legend>Accent color</legend>
        <div class="swatches">${opts.accents.map((c) => html`<label class="swatch" style="--c:${c}" title="${c}"><input type="radio" name="accent" value="${c}" ${v.accent === c ? raw('checked') : ''}><span class="sr-only">${c}</span></label>`)}</div>
        ${fieldError(errors, 'accent')}
      </fieldset>
      <div class="grid2">
        <fieldset class="field"><legend>Theme</legend><div class="seg">${opts.themes.map((t) => radio('theme', t, THEME_LABELS[t] || t, v.theme))}</div></fieldset>
        <fieldset class="field"><legend>Product layout</legend><div class="seg">${opts.layouts.map((t) => radio('layout', t, LAYOUT_LABELS[t] || t, v.layout))}</div></fieldset>
      </div>
      <fieldset class="field"><legend>Banner</legend><div class="seg">${opts.covers.map((t) => radio('cover', t, COVER_LABELS[t] || t, v.cover))}</div></fieldset>

      <h3 class="subhead">Featured products <span class="opt">up to ${opts.maxFeatured}, shown at the top</span></h3>
      ${products.length ? html`<div class="checklist">${products.map((a) => html`<label class="check"><input type="checkbox" name="featured" value="${a.slug}" ${featured.has(a.slug) ? raw('checked') : ''}><span>${a.title}</span></label>`)}</div>`
    : html`<p class="hint">Publish a product first, then pick the ones to feature.</p>`}

      <h3 class="subhead">Links <span class="opt">docs, repo, store, changelog…</span></h3>
      ${links.map((l, i) => html`<div class="grid2">
        <div class="field"><label for="link_label_${i}">Label</label><input id="link_label_${i}" name="link_label_${i}" maxlength="40" value="${l.label}" placeholder="Documentation"></div>
        <div class="field"><label for="link_url_${i}">Address</label><input id="link_url_${i}" name="link_url_${i}" maxlength="300" value="${l.url}" placeholder="https://docs.example.com"${invalid(errors, `links_${i}`)}>${fieldError(errors, `links_${i}`)}</div>
      </div>`)}

      <h3 class="subhead">Main button <span class="opt">optional</span></h3>
      <div class="grid2">
        <div class="field"><label for="cta_label">Button text</label><input id="cta_label" name="cta_label" maxlength="30" value="${(v.cta && v.cta.label) || ''}" placeholder="Star on GitHub"></div>
        <div class="field"><label for="cta_url">Button link</label><input id="cta_url" name="cta_url" maxlength="300" value="${(v.cta && v.cta.url) || ''}" placeholder="https://github.com/you"${invalid(errors, 'cta')}>${fieldError(errors, 'cta')}</div>
      </div>

      <div class="checklist">
        <label class="check"><input type="checkbox" name="show_stats" value="1" ${v.show_stats !== false ? raw('checked') : ''}><span>Show product and download counts</span></label>
        <label class="check"><input type="checkbox" name="show_socials" value="1" ${v.show_socials !== false ? raw('checked') : ''}><span>Show social links (edit them in <a href="/settings#socials">Settings</a>)</span></label>
      </div>
      <div class="btnrow"><button class="btn btn-primary" type="submit">${icon('check')}<span>Save page</span></button></div>
    </form>
  </div>`;
  return layout(ctx, { title: 'Your page', body, noindex: true });
}

// ---- Analytics --------------------------------------------------------------------------------

// One series per chart (never two scales on one axis). Bars are focusable and carry their value,
// so the hover/focus tooltip and screen readers say the same thing; the table under each chart
// is the non-visual view.
function barChart(id, title, rows, key, unit) {
  const max = Math.max(1, ...rows.map((r) => r[key]));
  const total = rows.reduce((s, r) => s + r[key], 0);
  const fmtDay = (d) => new Date(`${d}T00:00:00Z`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
  return html`<section class="panel chart" aria-labelledby="${id}-h">
    <div class="chart-head"><h2 class="panel-h" id="${id}-h">${title}</h2><p class="chart-total"><strong>${formatCount(total)}</strong> ${unit}</p></div>
    <div class="bars" role="list" style="--n:${rows.length}">
      ${rows.map((r) => html`<div class="bar" role="listitem" tabindex="0" aria-label="${fmtDay(r.date)}: ${r[key]} ${unit}" data-tip="${fmtDay(r.date)} · ${formatCount(r[key])} ${unit}">
        <span class="bar-fill" style="--h:${((r[key] / max) * 100).toFixed(1)}%"></span></div>`)}
    </div>
    <div class="bars-axis" aria-hidden="true"><span>${fmtDay(rows[0].date)}</span><span>${fmtDay(rows[rows.length - 1].date)}</span></div>
    <details class="chart-table"><summary>Show as table</summary>
      <table><thead><tr><th scope="col">Day</th><th scope="col">${unit[0].toUpperCase()}${unit.slice(1)}</th></tr></thead>
      <tbody>${rows.map((r) => html`<tr><td>${r.date}</td><td>${r[key]}</td></tr>`)}</tbody></table>
    </details>
  </section>`;
}

function rankList(title, rows, label = (r) => r.name, empty = 'No data yet.') {
  const max = Math.max(1, ...rows.map((r) => r.n));
  return html`<section class="panel rank"><h2 class="panel-h">${title}</h2>
    ${rows.length ? html`<ol class="ranklist">${rows.map((r) => html`<li><span class="rank-label">${label(r)}</span><span class="rank-n">${formatCount(r.n)}</span>
      <span class="rank-bar" style="--w:${((r.n / max) * 100).toFixed(1)}%" aria-hidden="true"></span></li>`)}</ol>` : html`<p class="hint">${empty}</p>`}
  </section>`;
}

const COUNTRY = (() => {
  try { return new Intl.DisplayNames(['en'], { type: 'region' }); } catch { return null; }
})();

function analytics(ctx, { visits, downloads, days, host, titles = {} }) {
  const totalViews = visits ? visits.series.reduce((s, r) => s + r.pageViews + r.productViews, 0) : 0;
  const totalDownloads = downloads.days.reduce((s, r) => s + r.downloads, 0);
  const rate = totalViews ? `${((totalDownloads / totalViews) * 100).toFixed(1)}%` : '–';
  const body = html`
  <div class="container">
    <header class="pagehead">
      <div><h1>Analytics</h1><p class="sub">Visits to ${host ? html`<a href="https://${host}/" target="_blank" rel="noopener">${host}</a>` : 'your page'} and downloads of your products.</p></div>
      <nav class="seg" aria-label="Time range">${[7, 30, 90].map((d) => html`<a href="?days=${d}" ${days === d ? raw('aria-current="page"') : ''}>${d} days</a>`)}</nav>
    </header>
    <div class="statgrid">
      <div class="stat"><span class="stat-icon">${icon('eye')}</span><p class="stat-label">Views</p><p class="stat-num">${visits ? formatCount(totalViews) : '–'}</p></div>
      <div class="stat"><span class="stat-icon">${icon('download')}</span><p class="stat-label">Downloads</p><p class="stat-num">${formatCount(totalDownloads)}</p></div>
      <div class="stat"><span class="stat-icon">${icon('trending')}</span><p class="stat-label">Downloads per view</p><p class="stat-num">${visits ? rate : '–'}</p></div>
    </div>
    ${visits ? '' : notice('', 'Visit charts appear once your page gets traffic. Downloads are counted either way.')}
    <div class="charts">
      ${visits ? barChart('views', 'Page views', visits.series.map((r) => ({ date: r.date, n: r.pageViews + r.productViews })), 'n', 'views') : ''}
      ${barChart('downloads', 'Downloads', downloads.days.map((r) => ({ date: r.date, n: r.downloads })), 'n', 'downloads')}
    </div>
    <div class="grid2 ranks">
      ${rankList('Top products by downloads', downloads.top.map((t) => ({ name: t.title, n: t.downloads })))}
      ${visits ? rankList('Top products by views', visits.products.map((r) => ({ name: titles[r.slug] || r.slug, n: r.n }))) : ''}
      ${visits ? rankList('Referrers', visits.referrers, (r) => r.name, 'No referring sites yet. Share your page link!') : ''}
      ${visits ? rankList('Countries', visits.countries, (r) => (COUNTRY && /^[A-Z]{2}$/.test(r.name) ? COUNTRY.of(r.name) : r.name)) : ''}
      ${visits ? rankList('Devices', visits.devices, (r) => r.name[0].toUpperCase() + r.name.slice(1)) : ''}
    </div>
    <p class="hint">Views come from Cloudflare Analytics Engine and leave out bots. Visitors are never identified or tracked across sites.</p>
  </div>`;
  return layout(ctx, { title: 'Analytics', body, noindex: true });
}

module.exports = { devPage, pageSettings, analytics, accentStyle };
