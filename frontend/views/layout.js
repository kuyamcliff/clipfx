'use strict';
const { html, raw } = require('../src/html');
const { icon, mark, avatar, csrfField } = require('./components');

const POPULAR = ['light leak', 'whoosh', 'film grain', 'lower third', 'glitch', 'LUT'];

function layout(ctx, { title, description, body, og = {}, noindex = false, ldJson = null, bodyClass = '' }) {
  const { config, user, flash, catalog } = ctx;
  const fullTitle = title ? `${title} | ${config.siteName}` : `${config.siteName}: find all resources for video editing`;
  const desc = description || 'Find all resources for video editing: free stock footage, transitions, LUTs, overlays, templates, sound effects and music, shared by editors. No account needed to download.';
  const at = (href) => ctx.path === href || (href !== '/' && ctx.path.startsWith(`${href}/`));
  const here = (href) => (at(href) ? raw(' aria-current="page"') : '');
  const q = ctx.path === '/browse' && typeof ctx.query.q === 'string' ? ctx.query.q : '';
  const isAdmin = user && user.role === 'admin';
  const themeAttr = ctx.theme ? raw(` data-theme="${ctx.theme}"`) : '';

  const accountLinks = user ? html`
    <div class="menu-head">${avatar(user, 'sm')}<div><strong>${user.display_name}</strong><span>@${user.username}</span></div></div>
    <a href="/u/${user.username}">${icon('user')}<span>Profile</span></a>
    <a href="/dashboard"${here('/dashboard')}>${icon('grid')}<span>My uploads</span></a>
    <a href="/saved"${here('/saved')}>${icon('bookmark')}<span>Saved</span></a>
    <a href="/settings"${here('/settings')}>${icon('settings')}<span>Settings</span></a>
    ${isAdmin ? html`<a href="/admin"${here('/admin')}>${icon('shield')}<span>Moderation</span>${ctx.openReports ? html`<span class="badge">${ctx.openReports}</span>` : ''}</a>` : ''}
    <form method="post" action="/logout">${csrfField(ctx)}<button type="submit">${icon('logout')}<span>Log out</span></button></form>` : '';

  const categories = (catalog.categories || []).map((c) => html`<a class="catlink" href="/browse?category=${c.id}" style="--h:${c.hue}">
    <span class="catlink-icon">${icon(c.icon)}</span><span>${c.name}</span></a>`);

  return raw(`<!doctype html>${html`
<html lang="en"${themeAttr}>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
  <title>${fullTitle}</title>
  <meta name="description" content="${desc}">
  ${noindex ? raw('<meta name="robots" content="noindex">') : ''}
  <meta name="color-scheme" content="dark light">
  <meta name="theme-color" content="#07080d" media="(prefers-color-scheme: dark)">
  <meta name="theme-color" content="#f5f7fb" media="(prefers-color-scheme: light)">
  <link rel="icon" href="/static/brand/favicon-32.png" type="image/png" sizes="32x32">
  <link rel="icon" href="/static/brand/favicon-64.png" type="image/png" sizes="64x64">
  <link rel="apple-touch-icon" href="/static/brand/apple-touch-icon.png">
  <link rel="manifest" href="/manifest.webmanifest">
  <link rel="alternate" type="text/plain" href="/llms.txt" title="Guide for AI assistants">
  <link rel="preload" href="/static/fonts/archivo.woff2" as="font" type="font/woff2" crossorigin>
  <link rel="stylesheet" href="${ctx.asset('/static/css/style.css')}">
  <meta property="og:site_name" content="${config.siteName}">
  <meta property="og:title" content="${og.title || title || config.siteName}">
  <meta property="og:description" content="${og.description || desc}">
  <meta property="og:type" content="${og.type || 'website'}">
  ${og.url ? html`<meta property="og:url" content="${og.url}"><link rel="canonical" href="${og.url}">` : ''}
  <meta property="og:image" content="${og.image || ctx.absolute('/static/brand/og.png')}">
  ${og.image ? '' : raw('<meta property="og:image:width" content="1200"><meta property="og:image:height" content="630">')}
  <meta property="og:image:alt" content="${og.image ? og.title || title || config.siteName : `${config.siteName} logo`}">
  <meta name="twitter:card" content="summary_large_image">
  ${og.video ? html`<meta property="og:video" content="${og.video}"><meta property="og:video:type" content="video/mp4">` : ''}
  ${ldJson ? raw(`<script type="application/ld+json">${JSON.stringify(ldJson).replace(/</g, '\\u003c')}</script>`) : ''}
  <script src="${ctx.asset('/static/js/app.js')}" defer></script>
</head>
<body class="${bodyClass}">
  <div class="progress-bar" data-progress-bar aria-hidden="true"></div>
  <a class="skip" href="#main">Skip to content</a>

  <header class="header" data-header>
    <div class="container header-in">
      <a class="brand" href="/" aria-label="${config.siteName} home">${mark()}<span>${config.siteName}</span></a>

      <nav class="nav" aria-label="Main">
        <a href="/browse"${here('/browse')}>Explore</a>
        <details class="dropdown" data-menu>
          <summary>Categories${icon('chevron')}</summary>
          <div class="dropdown-pop mega">${categories}</div>
        </details>
        <a href="/browse?sort=trending">Trending</a>
        <a href="/developers"${here('/developers')}>API</a>
      </nav>

      <div class="header-actions">
        <a class="searchbtn" href="/browse" data-palette-open aria-label="Search">
          ${icon('search')}<span class="searchbtn-text">${q || 'Search resources'}</span><kbd>/</kbd>
        </a>
        <button class="iconbtn hide-sm" type="button" data-theme-toggle aria-label="Switch theme">${icon('sun', 'theme-sun')}${icon('moon', 'theme-moon')}</button>
        <a class="btn btn-primary btn-sm hide-sm" href="/upload">${icon('upload')}<span>Upload</span></a>
        ${user ? html`
        <details class="dropdown account" data-menu>
          <summary aria-label="Account menu">${avatar(user, 'sm')}${ctx.openReports && isAdmin ? html`<span class="ping"></span>` : ''}</summary>
          <div class="dropdown-pop right">${accountLinks}
            <button type="button" class="show-sm" data-theme-toggle>${icon('moon')}<span>Switch theme</span></button>
          </div>
        </details>` : html`
        <a class="btn btn-ghost btn-sm hide-sm" href="/login"${here('/login')}>Log in</a>
        <a class="btn btn-secondary btn-sm hide-sm" href="/signup"${here('/signup')}>Sign up</a>
        <details class="dropdown show-sm" data-menu>
          <summary class="iconbtn" aria-label="Menu">${icon('menu')}</summary>
          <div class="dropdown-pop right">
            <a href="/login">${icon('user')}<span>Log in</span></a>
            <a href="/signup">${icon('plus')}<span>Create account</span></a>
            <a href="/about">${icon('info')}<span>About</span></a>
            <button type="button" data-theme-toggle>${icon('moon')}<span>Switch theme</span></button>
          </div>
        </details>`}
      </div>
    </div>
  </header>

  <div class="toasts" data-toasts aria-live="polite">
    ${flash ? html`<div class="toast ${flash.type === 'error' ? 'toast-error' : 'toast-ok'}" role="status" data-toast>
      ${icon(flash.type === 'error' ? 'alert' : 'check')}<span>${flash.message}</span>
      <button type="button" class="toast-x" aria-label="Dismiss" data-dismiss>${icon('x')}</button></div>` : ''}
  </div>

  <main id="main" class="main">${body}</main>

  <footer class="footer">
    <div class="container footer-in">
      <div class="footer-brand">
        <a class="brand" href="/">${mark()}<span>${config.siteName}</span></a>
        <p>Find all resources for video editing. A free, nonprofit library run by volunteers. Uploads belong to their creators and are shared under the license on each page.</p>
      </div>
      <nav class="footer-cols" aria-label="Footer">
        <div><p class="footer-h">Library</p>
          <a href="/browse">Explore</a><a href="/browse?sort=trending">Trending</a><a href="/upload">Upload</a><a href="/licenses">Licenses</a></div>
        <div><p class="footer-h">Project</p>
          <a href="/about">About</a><a href="/donate">Donate</a><a href="/developers">API</a><a href="${config.sourceUrl}" rel="noopener">Source code</a></div>
        <div><p class="footer-h">Rules</p>
          <a href="/guidelines">Guidelines</a><a href="/copyright">Takedowns</a><a href="/privacy">Privacy</a><a href="/terms">Terms</a></div>
      </nav>
    </div>
    <div class="container footer-bottom"><span>© ${new Date().getFullYear()} ${config.siteName}</span><span>Nonprofit and open source</span></div>
  </footer>

  <nav class="tabbar" aria-label="Quick">
    <a href="/"${here('/')}>${icon('home')}<span>Home</span></a>
    <a href="/browse"${here('/browse')}>${icon('compass')}<span>Explore</span></a>
    <a class="tabbar-up" href="/upload" aria-label="Upload"><span>${icon('plus')}</span></a>
    <a href="${user ? '/saved' : '/login?next=/saved'}"${here('/saved')}>${icon('bookmark')}<span>Saved</span></a>
    <a href="${user ? `/u/${user.username}` : '/login'}"${user ? here(`/u/${user.username}`) : here('/login')}>${user ? avatar(user, 'xs') : icon('user')}<span>${user ? 'Profile' : 'Log in'}</span></a>
  </nav>

  <dialog class="palette" data-palette aria-label="Search">
    <form class="palette-form" action="/browse" role="search">
      ${icon('search')}
      <input type="search" name="q" placeholder="Search footage, LUTs, sounds..." aria-label="Search resources" value="${q}" autocomplete="off">
      <button type="button" class="palette-x" data-palette-close aria-label="Close">Esc</button>
    </form>
    <div class="palette-body">
      <p class="palette-h">Popular</p>
      <div class="chips">${POPULAR.map((s) => html`<a class="chip" href="/browse?q=${encodeURIComponent(s)}">${s}</a>`)}</div>
      <p class="palette-h">Categories</p>
      <div class="palette-cats">${categories}</div>
    </div>
  </dialog>
</body>
</html>`}`);
}

module.exports = { layout };
