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

function googleButton(ctx, next) {
  if (!ctx.config.googleAuth) return '';
  return html`<a class="btn btn-lg btn-block btn-google" href="/auth/google${next ? `?next=${encodeURIComponent(next)}` : ''}">${raw(GOOGLE_G)}<span>Continue with Google</span></a>
    <p class="divider"><span>or</span></p>`;
}

function signup(ctx, { values, errors, next }) {
  return authShell(ctx, 'Create an account', html`
    <h1>Create an account</h1>
    <p class="sub">You need one to upload or save. Downloading doesn't.</p>
    ${googleButton(ctx, next)}
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
    ${googleButton(ctx, next)}
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
      <a href="#profile">Profile</a><a href="#password">Password</a><a href="#delete">Delete account</a>
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

    <form method="post" action="/settings/password" class="panel stack" id="password">
      ${csrfField(ctx)}
      <h2 class="panel-h">Password</h2>
      ${u.has_password ? html`<div class="field">
        <label for="current">Current password</label>
        <input id="current" name="current" type="password" required autocomplete="current-password"${invalid(errors, 'current')}>
        ${fieldError(errors, 'current')}
      </div>` : html`<p class="hint">You sign in with Google. Set a password if you also want to log in with your username.</p>`}
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
