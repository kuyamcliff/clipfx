'use strict';
const { html } = require('../html');
const { layout } = require('./layout');
const { icon, csrfField, fieldError, invalid } = require('./components');

function authShell(ctx, title, inner, aside) {
  return layout(ctx, {
    title,
    noindex: true,
    body: html`<div class="container auth">
      <div class="auth-card panel">${inner}</div>
      <aside class="auth-aside">${aside}</aside>
    </div>`,
  });
}

const perks = (ctx) => html`
  <h2>Why join?</h2>
  <ul class="perk-list">
    <li>${icon('upload')}<span><strong>Share your work</strong> — footage, templates, LUTs, sounds, anything.</span></li>
    <li>${icon('link')}<span><strong>Short share links</strong> for your descriptions, Discord and tutorials.</span></li>
    <li>${icon('heart')}<span><strong>Save favorites</strong> into your own collection.</span></li>
    <li>${icon('shield')}<span><strong>No ads, no tracking.</strong> ${ctx.config.siteName} is a nonprofit.</span></li>
  </ul>`;

function passwordInput(id, name, autocomplete, errors) {
  return html`<div class="password-field">
    <input id="${id}" name="${name}" type="password" required minlength="8" maxlength="200" autocomplete="${autocomplete}"${invalid(errors, name)}>
    <button type="button" class="btn-icon" data-toggle-password="${id}" aria-label="Show password">${icon('eye')}</button>
  </div>`;
}

function signup(ctx, { values, errors, next }) {
  return authShell(ctx, 'Create an account', html`
    <h1>Join ${ctx.config.siteName}</h1>
    <p class="muted">Free forever. Takes 20 seconds.</p>
    <form method="post" action="/signup" class="stack" novalidate>
      ${csrfField(ctx)}
      <input type="hidden" name="next" value="${next}">
      <div class="hp" aria-hidden="true"><label>Company <input name="company" tabindex="-1" autocomplete="off"></label></div>
      <div class="field">
        <label for="username">Username</label>
        <div class="input-prefix"><span>@</span><input id="username" name="username" required pattern="[A-Za-z0-9_]{3,24}" maxlength="24" autocomplete="username" value="${values.username || ''}"${invalid(errors, 'username')}></div>
        ${fieldError(errors, 'username')}
      </div>
      <div class="field">
        <label for="display_name">Display name <span class="muted">(optional)</span></label>
        <input id="display_name" name="display_name" maxlength="50" autocomplete="name" value="${values.display_name || ''}" placeholder="How you’ll be credited">
      </div>
      <div class="field">
        <label for="email">Email <span class="muted">(optional)</span></label>
        <input id="email" name="email" type="email" maxlength="200" autocomplete="email" value="${values.email || ''}"${invalid(errors, 'email')}>
        ${fieldError(errors, 'email')}
        <p class="hint">Only used to verify you if you lose access. Never shared, never spammed.</p>
      </div>
      <div class="field">
        <label for="password">Password</label>
        ${passwordInput('password', 'password', 'new-password', errors)}
        ${fieldError(errors, 'password')}
        <p class="hint">At least 8 characters.</p>
      </div>
      <label class="check ${errors.agree ? 'has-error' : ''}"><input type="checkbox" name="agree" required> <span>I’ll follow the <a href="/guidelines" target="_blank">community guidelines</a> and <a href="/terms" target="_blank">terms</a>.</span></label>
      ${fieldError(errors, 'agree')}
      <button class="btn btn-primary btn-block btn-lg" type="submit">Create account</button>
      <p class="center muted small">Already a member? <a href="/login${next ? `?next=${encodeURIComponent(next)}` : ''}">Log in</a></p>
    </form>`, perks(ctx));
}

function login(ctx, { values, error, next }) {
  return authShell(ctx, 'Log in', html`
    <h1>Welcome back</h1>
    <p class="muted">Log in to upload, save and manage your assets.</p>
    ${error ? html`<div class="notice notice-danger" role="alert">${icon('alert')}<div>${error}</div></div>` : ''}
    <form method="post" action="/login" class="stack">
      ${csrfField(ctx)}
      <input type="hidden" name="next" value="${next}">
      <div class="field">
        <label for="login">Username or email</label>
        <input id="login" name="login" required autocomplete="username" value="${values.login || ''}" autofocus>
      </div>
      <div class="field">
        <label for="password">Password</label>
        ${passwordInput('password', 'password', 'current-password', {})}
      </div>
      <button class="btn btn-primary btn-block btn-lg" type="submit">Log in</button>
      <p class="center muted small">New here? <a href="/signup${next ? `?next=${encodeURIComponent(next)}` : ''}">Create a free account</a></p>
      <p class="center muted small">Forgot your password? Email a moderator${ctx.config.contactEmail ? html` at <a href="mailto:${ctx.config.contactEmail}">${ctx.config.contactEmail}</a>` : ''} from the address on your account and we’ll send a reset link.</p>
    </form>`, perks(ctx));
}

function resetPassword(ctx, { token, error, user }) {
  return authShell(ctx, 'Reset password', html`
    <h1>Choose a new password</h1>
    <p class="muted">For @${user ? user.username : ''}</p>
    ${error ? html`<div class="notice notice-danger" role="alert">${icon('alert')}<div>${error}</div></div>` : ''}
    <form method="post" action="/reset/${token}" class="stack">
      ${csrfField(ctx)}
      <div class="field"><label for="password">New password</label>${passwordInput('password', 'password', 'new-password', {})}</div>
      <button class="btn btn-primary btn-block" type="submit">Save password</button>
    </form>`, perks(ctx));
}

function settings(ctx, { values, errors, section }) {
  const u = ctx.user;
  const body = html`
  <div class="container narrow">
    <header class="page-head"><h1>Settings</h1><p class="muted">Manage your public profile and account.</p></header>

    <form method="post" action="/settings/profile" class="panel stack" id="profile">
      ${csrfField(ctx)}
      <h2 class="panel-title">Public profile</h2>
      <div class="field">
        <label for="display_name">Display name</label>
        <input id="display_name" name="display_name" required maxlength="50" value="${values.display_name}"${invalid(errors, 'display_name')}>
        ${fieldError(errors, 'display_name')}
        <p class="hint">Shown on your uploads and used in attribution credits.</p>
      </div>
      <div class="field">
        <label for="bio">Bio</label>
        <textarea id="bio" name="bio" rows="4" maxlength="500" placeholder="Editor based in… Specializing in…">${values.bio}</textarea>
      </div>
      <div class="field">
        <label for="website">Website or portfolio</label>
        <input id="website" name="website" maxlength="200" value="${values.website}" placeholder="https://"${invalid(errors, 'website')}>
        ${fieldError(errors, 'website')}
      </div>
      <div class="field">
        <label for="email">Email <span class="muted">(private)</span></label>
        <input id="email" name="email" type="email" maxlength="200" value="${values.email}"${invalid(errors, 'email')}>
        ${fieldError(errors, 'email')}
      </div>
      <div class="btn-row"><button class="btn btn-primary" type="submit">Save profile</button><a class="btn btn-ghost" href="/u/${u.username}">View profile</a></div>
    </form>

    <form method="post" action="/settings/password" class="panel stack" id="password">
      ${csrfField(ctx)}
      <h2 class="panel-title">Change password</h2>
      <div class="field">
        <label for="current">Current password</label>
        <input id="current" name="current" type="password" required autocomplete="current-password"${invalid(errors, 'current')}>
        ${fieldError(errors, 'current')}
      </div>
      <div class="field">
        <label for="new-password">New password</label>
        ${passwordInput('new-password', 'password', 'new-password', errors)}
        ${fieldError(errors, 'password')}
      </div>
      <div><button class="btn btn-secondary" type="submit">Update password</button></div>
    </form>

    <form method="post" action="/settings/delete" class="panel stack danger-zone" id="delete" data-confirm="This permanently deletes your account and every asset you uploaded. Continue?">
      ${csrfField(ctx)}
      <h2 class="panel-title">Delete account</h2>
      <p class="muted">Permanently deletes your account and all of your uploads. Share links will stop working. This can’t be undone.</p>
      ${errors.delete ? html`<div class="notice notice-danger">${icon('alert')}<div>${errors.delete}</div></div>` : ''}
      <div class="field"><label for="confirm">Type your username (<strong>${u.username}</strong>)</label><input id="confirm" name="confirm" autocomplete="off" required></div>
      <div class="field"><label for="delete-password">Password</label><input id="delete-password" name="password" type="password" autocomplete="current-password" required></div>
      <div><button class="btn btn-danger" type="submit">${icon('trash')}Delete my account</button></div>
    </form>
  </div>`;
  void section;
  return layout(ctx, { title: 'Settings', body, noindex: true });
}

function error(ctx, { status, title, message }) {
  return layout(ctx, {
    title,
    noindex: true,
    body: html`<div class="container narrow center-page">
      <div class="empty">
        <div class="error-code">${status}</div>
        <h1>${title}</h1>
        <p class="muted">${message}</p>
        <div class="btn-row center"><a class="btn btn-primary" href="/">Go home</a><a class="btn btn-ghost" href="/browse">Browse assets</a></div>
      </div>
    </div>`,
  });
}

module.exports = { signup, login, resetPassword, settings, error };
