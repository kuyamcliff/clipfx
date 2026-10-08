'use strict';
const { html, raw } = require('../html');
const { icon, avatar, csrfField } = require('./components');
const { CATEGORIES } = require('../catalog');

function logo(siteName) {
  return html`<span class="logo-mark" aria-hidden="true"><svg viewBox="0 0 32 32"><defs><linearGradient id="lg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#8b5cf6"/><stop offset="1" stop-color="#ff6b3d"/></linearGradient></defs><rect width="32" height="32" rx="9" fill="url(#lg)"/><path d="M12 9.5v13l11-6.5z" fill="#fff"/><path d="M7 9v14" stroke="#fff" stroke-width="2.5" stroke-linecap="round" opacity=".55"/></svg></span><span class="logo-text">${siteName}</span>`;
}

function layout(ctx, { title, description, body, og = {}, noindex = false, wide = false }) {
  const { config, user, flash } = ctx;
  const fullTitle = title ? `${title} · ${config.siteName}` : `${config.siteName} — ${config.tagline}`;
  const desc = description || `${config.siteName} is a free, nonprofit library of footage, templates, LUTs, transitions and sound effects shared by video editors and motion designers.`;
  const nav = (href, label) => html`<a href="${href}" class="${ctx.path === href ? 'active' : ''}">${label}</a>`;

  return raw(`<!doctype html>${html`
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${fullTitle}</title>
  <meta name="description" content="${desc}">
  <meta name="theme-color" content="#0b0b10">
  ${noindex ? raw('<meta name="robots" content="noindex">') : ''}
  <link rel="icon" href="/static/favicon.svg" type="image/svg+xml">
  <link rel="stylesheet" href="/static/css/style.css">
  <meta property="og:site_name" content="${config.siteName}">
  <meta property="og:title" content="${og.title || title || config.siteName}">
  <meta property="og:description" content="${og.description || desc}">
  <meta property="og:type" content="${og.type || 'website'}">
  ${og.url ? html`<meta property="og:url" content="${og.url}"><link rel="canonical" href="${og.url}">` : ''}
  ${og.image ? html`<meta property="og:image" content="${og.image}"><meta name="twitter:card" content="summary_large_image">` : raw('<meta name="twitter:card" content="summary">')}
  ${og.video ? html`<meta property="og:video" content="${og.video}"><meta property="og:video:type" content="video/mp4">` : ''}
  <script src="/static/js/app.js" defer></script>
</head>
<body>
  <a class="skip-link" href="#main">Skip to content</a>
  <header class="site-header">
    <div class="container header-inner">
      <a class="logo" href="/" aria-label="${config.siteName} home">${logo(config.siteName)}</a>
      <form class="header-search" action="/browse" role="search">
        ${icon('search')}
        <input type="search" name="q" placeholder="Search transitions, LUTs, light leaks…" aria-label="Search assets" value="${ctx.path === '/browse' && typeof ctx.query.q === 'string' ? ctx.query.q : ''}">
      </form>
      <button class="nav-toggle btn-icon" type="button" aria-label="Menu" aria-expanded="false" aria-controls="site-nav" data-nav-toggle>${icon('menu')}</button>
      <nav class="site-nav" id="site-nav" aria-label="Main">
        ${nav('/browse', 'Browse')}
        ${nav('/about', 'About')}
        <a href="/donate" class="nav-donate ${ctx.path === '/donate' ? 'active' : ''}">${icon('heart')}Donate</a>
        ${user ? html`
          <a class="btn btn-primary btn-sm" href="/upload">${icon('upload')}Upload</a>
          <details class="user-menu">
            <summary aria-label="Account menu">${avatar(user, 'sm')}${ctx.openReports ? html`<span class="dot" title="Open reports"></span>` : ''}</summary>
            <div class="menu">
              <div class="menu-head"><strong>${user.display_name}</strong><span class="muted">@${user.username}</span></div>
              <a href="/dashboard">${icon('grid')}My uploads</a>
              <a href="/u/${user.username}">${icon('user')}Public profile</a>
              <a href="/saved">${icon('bookmark')}Saved</a>
              <a href="/settings">${icon('settings')}Settings</a>
              ${user.role === 'admin' ? html`<a href="/admin">${icon('shield')}Moderation${ctx.openReports ? html` <span class="pill">${ctx.openReports}</span>` : ''}</a>` : ''}
              <form method="post" action="/logout">${csrfField(ctx)}<button type="submit">${icon('logout')}Log out</button></form>
            </div>
          </details>` : html`
          <a href="/login" class="${ctx.path === '/login' ? 'active' : ''}">Log in</a>
          <a class="btn btn-primary btn-sm" href="/signup">Join free</a>`}
      </nav>
    </div>
  </header>

  ${flash ? html`<div class="container"><div class="flash flash-${flash.type === 'error' ? 'error' : 'success'}" role="status">
    ${icon(flash.type === 'error' ? 'alert' : 'check')}<span>${flash.message}</span>
    <button type="button" class="btn-icon" aria-label="Dismiss" data-dismiss>${icon('x')}</button></div></div>` : ''}

  <main id="main" class="${wide ? 'main-wide' : ''}">${body}</main>

  <footer class="site-footer">
    <div class="container footer-grid">
      <div class="footer-brand">
        <a class="logo" href="/">${logo(config.siteName)}</a>
        <p>A nonprofit, community-run library of free editing assets. No ads. No paywalls. No tracking.</p>
        <a class="btn btn-outline btn-sm" href="/donate">${icon('heart')}Support the project</a>
      </div>
      <div>
        <h4>Explore</h4>
        ${CATEGORIES.slice(0, 6).map((c) => html`<a href="/browse?category=${c.id}">${c.name}</a>`)}
      </div>
      <div>
        <h4>Community</h4>
        <a href="/upload">Share an asset</a>
        <a href="/guidelines">Community guidelines</a>
        <a href="/licenses">Licenses explained</a>
        <a href="${config.sourceUrl}" rel="noopener">Open source</a>
      </div>
      <div>
        <h4>Nonprofit</h4>
        <a href="/about">About &amp; mission</a>
        <a href="/donate">Donate</a>
        <a href="/copyright">Copyright &amp; takedowns</a>
        <a href="/privacy">Privacy</a>
        <a href="/terms">Terms</a>
      </div>
    </div>
    <div class="container footer-bottom">
      <span>© ${new Date().getFullYear()} ${config.siteName}. Assets belong to their creators and are shared under the license shown on each page.</span>
    </div>
  </footer>
</body>
</html>`}`);
}

module.exports = { layout, logo };
