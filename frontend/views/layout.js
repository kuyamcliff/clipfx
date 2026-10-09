'use strict';
const { html, raw } = require('../src/html');
const { icon, csrfField } = require('./components');

function logo(siteName) {
  return html`<span class="rec" aria-hidden="true"></span><span>${siteName}</span>`;
}

function layout(ctx, { title, description, body, og = {}, noindex = false }) {
  const { config, user, flash } = ctx;
  const fullTitle = title ? `${title} · ${config.siteName}` : `${config.siteName} · free assets for video editors`;
  const desc = description || `Free footage, transitions, LUTs, templates and sound effects shared by video editors and motion designers. Run as a nonprofit.`;
  const nav = (href, label) => html`<a href="${href}" class="${ctx.path === href ? 'active' : ''}">${label}</a>`;

  return raw(`<!doctype html>${html`
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${fullTitle}</title>
  <meta name="description" content="${desc}">
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
        <input type="search" name="q" placeholder="Search" aria-label="Search assets" value="${ctx.path === '/browse' && typeof ctx.query.q === 'string' ? ctx.query.q : ''}">
      </form>
      <button class="nav-toggle btn-icon" type="button" aria-label="Menu" aria-expanded="false" aria-controls="site-nav" data-nav-toggle>${icon('menu')}</button>
      <nav class="site-nav" id="site-nav" aria-label="Main">
        ${nav('/browse', 'Browse')}
        ${nav('/about', 'About')}
        ${nav('/donate', 'Donate')}
        ${user ? html`
          <details class="user-menu">
            <summary>${ctx.openReports ? html`<span class="dot" title="Open reports"></span>` : ''}${user.username}</summary>
            <div class="menu">
              <div class="menu-head muted">Signed in as <strong>@${user.username}</strong></div>
              <a href="/dashboard">My uploads</a>
              <a href="/u/${user.username}">Profile</a>
              <a href="/saved">Saved</a>
              <a href="/settings">Settings</a>
              ${user.role === 'admin' ? html`<a href="/admin">Moderation${ctx.openReports ? html` <span class="count">${ctx.openReports}</span>` : ''}</a>` : ''}
              <form method="post" action="/logout">${csrfField(ctx)}<button type="submit">Log out</button></form>
            </div>
          </details>
          <a class="btn btn-primary btn-sm" href="/upload">Upload</a>` : html`
          ${nav('/login', 'Log in')}
          <a class="btn btn-primary btn-sm" href="/signup?next=/upload">Upload</a>`}
      </nav>
    </div>
  </header>

  ${flash ? html`<div class="container"><div class="flash ${flash.type === 'error' ? 'flash-error' : ''}" role="status">
    <span>${flash.message}</span>
    <button type="button" class="btn-icon" aria-label="Dismiss" data-dismiss>${icon('x')}</button></div></div>` : ''}

  <main id="main">${body}</main>

  <footer class="site-footer">
    <div class="container footer-inner">
      <p>${config.siteName} is a nonprofit, volunteer-run project. Uploads belong to their creators and are shared under the license shown on each page.</p>
      <nav class="footer-links" aria-label="Footer">
        <a href="/about">About</a>
        <a href="/guidelines">Guidelines</a>
        <a href="/licenses">Licenses</a>
        <a href="/copyright">Takedowns</a>
        <a href="/privacy">Privacy</a>
        <a href="/terms">Terms</a>
        <a href="/donate">Donate</a>
        <a href="${config.sourceUrl}" rel="noopener">Source</a>
      </nav>
    </div>
  </footer>
</body>
</html>`}`);
}

module.exports = { layout, logo };
