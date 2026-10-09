'use strict';
const { html, raw, formatBytes } = require('../src/html');
const { layout } = require('./layout');
const { icon, mark, csrfField, fieldError, invalid, notice } = require('./components');

function authShell(ctx, title, inner, aside) {
  return layout(ctx, {
    title, noindex: true,
    body: html`<div class="wrap auth">
      <div class="auth-card">${inner}</div>
      ${aside ? html`<div class="auth-aside">${aside}</div>` : ''}
    </div>`,
  });
}

function passwordInput(id, name, autocomplete, errors) {
  return html`<div class="pw">
    <input id="${id}" name="${name}" type="password" required minlength="8" maxlength="200" autocomplete="${autocomplete}"${invalid(errors, name)}>
    <button type="button" class="pw-toggle" data-toggle-password="${id}" aria-label="Show password" aria-pressed="false">${icon('eye')}</button>
  </div>`;
}

const perks = (ctx) => html`
  ${mark()}
  <ul class="perks">
    <li>${icon('download')}<span><strong>Downloading is free</strong> and never needs an account.</span></li>
    <li>${icon('upload')}<span><strong>Upload files up to ${formatBytes(ctx.config.maxUpload || 2 * 1024 ** 3)}</strong> and share it with one short link.</span></li>
    <li>${icon('bookmark')}<span><strong>Save assets</strong> to come back to later.</span></li>
  </ul>`;

// Google's "G" mark, as their sign-in branding guidelines ask for.
const GOOGLE_G = '<svg class="g-mark" viewBox="0 0 48 48" aria-hidden="true" focusable="false"><path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/><path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/><path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/><path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/></svg>';

const TIKTOK_MARK = '<svg class="g-mark" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path fill="currentColor" d="M12.53.02C13.84 0 15.14.01 16.44 0c.08 1.53.63 3.09 1.75 4.17 1.12 1.11 2.7 1.62 4.24 1.79v4.03c-1.44-.05-2.89-.35-4.2-.97-.57-.26-1.1-.59-1.62-.93-.01 2.92.01 5.84-.02 8.75-.08 1.4-.54 2.79-1.35 3.94-1.31 1.92-3.58 3.17-5.91 3.21-1.43.08-2.86-.31-4.08-1.03-2.02-1.19-3.44-3.37-3.65-5.71-.02-.5-.03-1-.01-1.49.18-1.9 1.12-3.72 2.58-4.96 1.66-1.44 3.98-2.13 6.15-1.72.02 1.48-.04 2.96-.04 4.44-.99-.32-2.15-.23-3.02.37-.63.41-1.11 1.04-1.36 1.75-.21.51-.15 1.07-.14 1.61.24 1.64 1.82 3.02 3.5 2.87 1.12-.01 2.19-.66 2.77-1.61.19-.33.4-.67.41-1.06.1-1.79.06-3.57.07-5.36.01-4.03-.01-8.05.02-12.07z"/></svg>';

const PROVIDERS = [
  { id: 'google', label: 'Google', mark: GOOGLE_G, on: (c) => c.googleAuth },
  { id: 'tiktok', label: 'TikTok', mark: TIKTOK_MARK, on: (c) => c.tiktokAuth },
];
const enabledProviders = (ctx) => PROVIDERS.filter((p) => p.on(ctx.config));

function providerButtons(ctx, next) {
  const list = enabledProviders(ctx);
  if (!list.length) return '';
  const q = next ? `?next=${encodeURIComponent(next)}` : '';
  return html`<div class="oauth">${list.map((p) => html`<a class="btn btn-lg btn-block btn-oauth" href="/auth/${p.id}${q}">${raw(p.mark)}<span>Continue with ${p.label}</span></a>`)}</div>
    <p class="divider"><span>or</span></p>`;
}

function signup(ctx, { values, errors, next }) {
  return authShell(ctx, 'Create an account', html`
    <h1>Create an account</h1>
    <p class="sub">You need one to upload or save. Downloading doesn't.</p>
    ${providerButtons(ctx, next)}
    <form method="post" action="/signup" class="stack" novalidate>
      ${csrfField(ctx)}
      <input type="hidden" name="next" value="${next}">
      <div class="hp" aria-hidden="true"><label>Company <input name="company" tabindex="-1" autocomplete="off"></label></div>
      <div class="field">
        <label for="username">Username</label>
        <div class="prefixed"><span>@</span><input id="username" name="username" required pattern="[A-Za-z0-9_]{3,24}" maxlength="24" autocomplete="username" autocapitalize="off" spellcheck="false" value="${values.username || ''}"${invalid(errors, 'username')}></div>
        ${fieldError(errors, 'username')}
      </div>
      <div class="field">
        <label for="display_name">Display name <span class="opt">optional, used in credits</span></label>
        <input id="display_name" name="display_name" maxlength="50" autocomplete="name" value="${values.display_name || ''}">
      </div>
      <div class="field">
        <label for="email">Email <span class="opt">optional, only for account recovery</span></label>
        <input id="email" name="email" type="email" maxlength="200" autocomplete="email" value="${values.email || ''}"${invalid(errors, 'email')}>
        ${fieldError(errors, 'email')}
      </div>
      <div class="field">
        <label for="password">Password <span class="opt">8 or more characters</span></label>
        ${passwordInput('password', 'password', 'new-password', errors)}
        ${fieldError(errors, 'password')}
      </div>
      <label class="check ${errors.agree ? 'has-error' : ''}"><input type="checkbox" name="agree" required><span>I'll follow the <a href="/guidelines" target="_blank">guidelines</a> and <a href="/terms" target="_blank">terms</a>.</span></label>
      ${fieldError(errors, 'agree')}
      <button class="btn btn-accent btn-lg btn-block" type="submit">Create account</button>
    </form>
    <p class="auth-alt">Already have an account? <a href="/login${next ? `?next=${encodeURIComponent(next)}` : ''}">Log in</a></p>`, perks(ctx));
}

function login(ctx, { values, error, next }) {
  return authShell(ctx, 'Log in', html`
    <h1>Log in</h1>
    <p class="sub">Welcome back.</p>
    ${error ? notice('danger', error) : ''}
    ${providerButtons(ctx, next)}
    <form method="post" action="/login" class="stack">
      ${csrfField(ctx)}
      <input type="hidden" name="next" value="${next}">
      <div class="field">
        <label for="login">Username or email</label>
        <input id="login" name="login" required autocomplete="username" autocapitalize="off" spellcheck="false" value="${values.login || ''}" autofocus>
      </div>
      <div class="field">
        <label for="password">Password</label>
        ${passwordInput('password', 'password', 'current-password', {})}
      </div>
      <button class="btn btn-accent btn-lg btn-block" type="submit">Log in</button>
    </form>
    <p class="auth-alt">New here? <a href="/signup${next ? `?next=${encodeURIComponent(next)}` : ''}">Create an account</a></p>
    <p class="hint">Forgot your password? Email ${ctx.config.contactEmail ? html`<a href="mailto:${ctx.config.contactEmail}">${ctx.config.contactEmail}</a>` : 'a moderator'} from the address on your account and we'll send you a reset link.</p>`);
}

function resetPassword(ctx, { token, error, user }) {
  return authShell(ctx, 'Reset password', html`
    <h1>New password</h1>
    <p class="sub">For @${user ? user.username : ''}</p>
    ${error ? notice('danger', error) : ''}
    <form method="post" action="/reset/${token}" class="stack">
      ${csrfField(ctx)}
      <div class="field"><label for="password">New password <span class="opt">8 or more characters</span></label>${passwordInput('password', 'password', 'new-password', {})}</div>
      <button class="btn btn-accent btn-lg btn-block" type="submit">Save password</button>
    </form>`);
}

function settings(ctx, { values, errors }) {
  const u = ctx.user;
  const body = html`
  <div class="wrap narrow">
    <header class="pagehead"><div><h1>Settings</h1><p class="sub">Signed in as @${u.username}</p></div></header>
    <nav class="seg seg-jump" aria-label="Settings sections">
      <a href="#profile">Profile</a>${enabledProviders(ctx).length ? html`<a href="#connections">Sign-in methods</a>` : ''}<a href="#password">Password</a><a href="#delete">Delete account</a>
    </nav>

    <form method="post" action="/settings/profile" class="panel stack" id="profile">
      ${csrfField(ctx)}
      <h2 class="panel-h">Public profile</h2>
      <div class="field">
        <label for="display_name">Display name</label>
        <input id="display_name" name="display_name" required maxlength="50" value="${values.display_name}"${invalid(errors, 'display_name')}>
        ${fieldError(errors, 'display_name')}
      </div>
      <div class="field">
        <label for="bio">Bio</label>
        <textarea id="bio" name="bio" rows="4" maxlength="500">${values.bio}</textarea>
      </div>
      <div class="field">
        <label for="website">Website or portfolio</label>
        <input id="website" name="website" maxlength="200" value="${values.website}" placeholder="https://"${invalid(errors, 'website')}>
        ${fieldError(errors, 'website')}
      </div>
      <div class="field">
        <label for="email">Email <span class="opt">private</span></label>
        <input id="email" name="email" type="email" maxlength="200" value="${values.email}" autocomplete="email"${invalid(errors, 'email')}>
        ${fieldError(errors, 'email')}
      </div>
      <div class="btnrow"><button class="btn btn-accent" type="submit">Save profile</button><a class="textbtn" href="/u/${u.username}">View profile</a></div>
    </form>

    ${enabledProviders(ctx).length ? html`<section class="panel" id="connections">
      <h2 class="panel-h">Sign-in methods</h2>
      <ul class="conns">
        ${enabledProviders(ctx).map((p) => {
    const linked = (u.connections || []).includes(p.id);
    return html`<li class="conn">
          <span class="conn-mark">${raw(p.mark)}</span>
          <span class="conn-main"><strong>${p.label}</strong><span>${linked ? 'Connected. You can log in with it.' : 'Not connected'}</span></span>
          ${linked ? html`<form method="post" action="/settings/connections/${p.id}/remove" data-confirm="Disconnect ${p.label}? You won't be able to log in with it anymore.">${csrfField(ctx)}<button class="btn btn-sm btn-quiet" type="submit">Disconnect</button></form>`
    : html`<a class="btn btn-sm" href="/auth/${p.id}?next=/settings">Connect</a>`}
        </li>`;
  })}
      </ul>
    </section>` : ''}

    <form method="post" action="/settings/password" class="panel stack" id="password">
      ${csrfField(ctx)}
      <h2 class="panel-h">Password</h2>
      ${u.has_password ? html`<div class="field">
        <label for="current">Current password</label>
        <input id="current" name="current" type="password" required autocomplete="current-password"${invalid(errors, 'current')}>
        ${fieldError(errors, 'current')}
      </div>` : html`<p class="hint">You don't have a password yet. Set one if you also want to log in with your username or email.</p>`}
      <div class="field">
        <label for="new-password">New password</label>
        ${passwordInput('new-password', 'password', 'new-password', errors)}
        ${fieldError(errors, 'password')}
      </div>
      <div><button class="btn" type="submit">${u.has_password ? 'Change password' : 'Set password'}</button></div>
    </form>

    <form method="post" action="/settings/delete" class="panel panel-danger stack" id="delete" data-confirm="This permanently deletes your account and every asset you uploaded. Continue?">
      ${csrfField(ctx)}
      <h2 class="panel-h">Delete account</h2>
      <p class="hint">Deletes your account and every upload. Share links stop working. This can't be undone.</p>
      ${errors.delete ? notice('danger', errors.delete) : ''}
      <div class="field"><label for="confirm">Type your username, <strong>${u.username}</strong></label><input id="confirm" name="confirm" autocomplete="off" autocapitalize="off" spellcheck="false" required></div>
      ${u.has_password ? html`<div class="field"><label for="delete-password">Password</label><input id="delete-password" name="password" type="password" autocomplete="current-password" required></div>` : ''}
      <div><button class="btn btn-danger" type="submit">Delete my account</button></div>
    </form>
  </div>`;
  return layout(ctx, { title: 'Settings', body, noindex: true });
}

function error(ctx, { status, title, message }) {
  return layout(ctx, {
    title,
    noindex: true,
    body: html`<div class="wrap">
      <div class="bigmsg">
        <p class="bigmsg-code">${status}</p>
        <h1>${title}</h1>
        <p>${message}</p>
        <div class="btnrow"><a class="btn btn-accent" href="/">Go home</a><a class="btn" href="/browse">Browse assets</a></div>
      </div>
    </div>`,
  });
}

module.exports = { signup, login, resetPassword, settings, error };
