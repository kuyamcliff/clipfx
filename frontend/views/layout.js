'use strict';
const { html, raw } = require('../src/html');
const { icon, mark, csrfField } = require('./components');

function layout(ctx, { title, description, body, og = {}, noindex = false }) {
  const { config, user, flash } = ctx;
  const fullTitle = title ? `${title} | ${config.siteName}` : `${config.siteName}: free assets for video editors`;
  const desc = description || 'Free footage, transitions, LUTs, overlays, templates and sound effects, shared by video editors and motion designers. Nonprofit, no ads.';
  const here = (href) => (ctx.path === href || (href !== '/' && ctx.path.startsWith(`${href}/`)) ? raw(' aria-current="page"') : '');
  const q = ctx.path === '/browse' && typeof ctx.query.q === 'string' ? ctx.query.q : '';
  const isAdmin = user && user.role === 'admin';

  const accountLinks = user ? html`
    <a href="/dashboard"${here('/dashboard')}>My uploads</a>
    <a href="/saved"${here('/saved')}>Saved</a>
    <a href="/u/${user.username}">Profile</a>
    <a href="/settings"${here('/settings')}>Settings</a>
    ${isAdmin ? html`<a href="/admin"${here('/admin')}>Moderation${ctx.openReports ? html` <span class="badge">${ctx.openReports}</span>` : ''}</a>` : ''}
    <form method="post" action="/logout">${csrfField(ctx)}<button type="submit">Log out</button></form>` : '';

  return raw(`<!doctype html>${html`
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
  <title>${fullTitle}</title>
  <meta name="description" content="${desc}">
  ${noindex ? raw('<meta name="robots" content="noindex">') : ''}
  <meta name="color-scheme" content="dark light">
  <meta name="theme-color" content="#0f0f10" media="(prefers-color-scheme: dark)">
  <meta name="theme-color" content="#f3f2ee" media="(prefers-color-scheme: light)">
  <link rel="icon" href="/static/favicon.svg" type="image/svg+xml">
  <link rel="preload" href="/static/fonts/archivo.woff2" as="font" type="font/woff2" crossorigin>
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
  <a class="skip" href="#main">Skip to content</a>
  <header class="topbar">
    <div class="wrap topbar-in">
      <a class="brand" href="/" aria-label="${config.siteName} home">${mark()}<span>${config.siteName}</span></a>

      <form class="topsearch" action="/browse" role="search" data-topsearch>
        ${icon('search')}
        <input type="search" name="q" placeholder="Search assets" aria-label="Search assets" value="${q}" autocomplete="off">
      </form>

      <nav class="topnav" aria-label="Main">
        <a href="/browse"${here('/browse')}>Browse</a>
        <a href="/about"${here('/about')}>About</a>
        <a href="/donate"${here('/donate')}>Donate</a>
        ${user ? html`
        <details class="menu" data-menu>
          <summary aria-label="Account menu">
            <span class="who">${user.username}</span>${ctx.openReports && isAdmin ? html`<span class="ping" title="Open reports"></span>` : ''}${icon('chevron')}
          </summary>
          <div class="menu-pop">${accountLinks}</div>
        </details>` : html`<a href="/login"${here('/login')}>Log in</a>`}
      </nav>

      <div class="top-actions">
        <a class="iconbtn only-sm" href="/browse" aria-label="Search" data-search-toggle>${icon('search')}</a>
        <a class="btn btn-accent btn-sm" href="${user ? '/upload' : '/signup?next=/upload'}">${icon('upload')}<span>Upload</span></a>
        <details class="menu only-sm" data-menu>
          <summary class="iconbtn" aria-label="Menu">${icon('menu')}${ctx.openReports && isAdmin ? html`<span class="ping"></span>` : ''}</summary>
          <div class="menu-pop sheet">
            <a href="/browse"${here('/browse')}>Browse</a>
            <a href="/about"${here('/about')}>About</a>
            <a href="/donate"${here('/donate')}>Donate</a>
            ${user ? html`<p class="menu-label">@${user.username}</p>${accountLinks}` : html`
            <a href="/login"${here('/login')}>Log in</a>
            <a href="/signup"${here('/signup')}>Create account</a>`}
          </div>
        </details>
      </div>
    </div>
  </header>

  ${flash ? html`<div class="wrap"><div class="flash ${flash.type === 'error' ? 'flash-error' : ''}" role="status">
    ${icon(flash.type === 'error' ? 'alert' : 'check')}<span>${flash.message}</span>
    <button type="button" class="iconbtn" aria-label="Dismiss" data-dismiss>${icon('x')}</button></div></div>` : ''}

  <main id="main">${body}</main>

  <footer class="foot">
    <div class="wrap foot-in">
      <div class="foot-about">
        <a class="brand" href="/">${mark()}<span>${config.siteName}</span></a>
        <p>A nonprofit library of editing assets, run by volunteers. Uploads belong to their creators and are shared under the license on each page.</p>
      </div>
      <nav class="foot-cols" aria-label="Footer">
        <div>
          <p class="foot-h">Library</p>
          <a href="/browse">Browse</a>
          <a href="/browse?sort=trending">Trending</a>
          <a href="/upload">Upload</a>
          <a href="/licenses">Licenses</a>
        </div>
        <div>
          <p class="foot-h">Project</p>
          <a href="/about">About</a>
          <a href="/donate">Donate</a>
          <a href="${config.sourceUrl}" rel="noopener">Source code</a>
        </div>
        <div>
          <p class="foot-h">Rules</p>
          <a href="/guidelines">Guidelines</a>
          <a href="/copyright">Takedowns</a>
          <a href="/privacy">Privacy</a>
          <a href="/terms">Terms</a>
        </div>
      </nav>
    </div>
  </footer>
</body>
</html>`}`);
}

module.exports = { layout };
