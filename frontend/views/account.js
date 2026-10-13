'use strict';
const { html, raw, formatDate, timeAgo } = require('../src/html');
const { layout } = require('./layout');
const { icon, mark, avatar, csrfField, fieldError, invalid, notice } = require('./components');

function authShell(ctx, title, inner) {
  return layout(ctx, {
    title, noindex: true, bodyClass: 'is-auth',
    body: html`<div class="auth-bg" aria-hidden="true"><img src="/static/img/auth.webp" alt="" width="1600" height="1000" decoding="async"></div>
    <div class="container auth">
      <div class="auth-card" data-reveal>
        <a class="auth-logo" href="/" aria-label="${ctx.config.siteName} home">${mark()}</a>
        ${inner}
      </div>
    </div>`,
  });
}

function passwordInput(id, name, autocomplete, errors) {
  return html`<div class="pw">
    <input id="${id}" name="${name}" type="password" required minlength="8" maxlength="200" autocomplete="${autocomplete}"${invalid(errors, name)}>
    <button type="button" class="pw-toggle" data-toggle-password="${id}" aria-label="Show password" aria-pressed="false">${icon('eye')}</button>
  </div>`;
}

// Google's "G" mark, as their sign-in branding guidelines ask for.
const GOOGLE_G = '<svg class="i" viewBox="0 0 48 48" aria-hidden="true" focusable="false"><path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/><path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/><path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/><path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/></svg>';

const PROVIDERS = [
  { id: 'google', label: 'Google', mark: () => raw(GOOGLE_G), on: (c) => c.googleAuth },
  { id: 'tiktok', label: 'TikTok', mark: () => icon('tiktok'), on: (c) => c.tiktokAuth },
];
const enabledProviders = (ctx) => PROVIDERS.filter((p) => p.on(ctx.config));

function providerButtons(ctx, next) {
  const list = enabledProviders(ctx);
  if (!list.length) return '';
  const q = next ? `?next=${encodeURIComponent(next)}` : '';
  return html`<div class="oauth">${list.map((p) => html`<a class="btn btn-secondary btn-lg btn-block" href="/auth/${p.id}${q}" data-loading>${p.mark()}<span>Continue with ${p.label}</span></a>`)}</div>
    <p class="divider"><span>or</span></p>`;
}

function signup(ctx, { values, errors, next }) {
  return authShell(ctx, 'Create an account', html`
    <h1>Create your account</h1>
    <p class="sub">Keep your uploads in one place, save resources and get a public profile. Downloading never needs an account.</p>
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
        <label for="display_name">Display name <span class="opt">optional</span></label>
        <input id="display_name" name="display_name" maxlength="50" autocomplete="name" value="${values.display_name || ''}">
      </div>
      <div class="field">
        <label for="email">Email <span class="opt">optional, for account recovery</span></label>
        <input id="email" name="email" type="email" maxlength="200" autocomplete="email" value="${values.email || ''}"${invalid(errors, 'email')}>
        ${fieldError(errors, 'email')}
      </div>
      <div class="field">
        <label for="password">Password <span class="opt">8+ characters</span></label>
        ${passwordInput('password', 'password', 'new-password', errors)}
        ${fieldError(errors, 'password')}
      </div>
      <label class="check ${errors.agree ? 'has-error' : ''}"><input type="checkbox" name="agree" required><span>I'll follow the <a href="/guidelines" target="_blank">guidelines</a> and <a href="/terms" target="_blank">terms</a>.</span></label>
      ${fieldError(errors, 'agree')}
      <button class="btn btn-primary btn-lg btn-block" type="submit">Create account</button>
    </form>
    <p class="auth-alt">Already have an account? <a href="/login${next ? `?next=${encodeURIComponent(next)}` : ''}">Log in</a></p>`);
}

function login(ctx, { values, error, next }) {
  return authShell(ctx, 'Log in', html`
    <h1>Welcome back</h1>
    <p class="sub">Log in to upload, save and manage your files.</p>
    ${error ? notice('danger', error) : ''}
    ${providerButtons(ctx, next)}
    <form method="post" action="/login" class="stack">
      ${csrfField(ctx)}
      <input type="hidden" name="next" value="${next}">
      <div class="field">
        <label for="login">Username or email</label>
        <input id="login" name="login" required autocomplete="username" autocapitalize="off" spellcheck="false" value="${values.login || ''}">
      </div>
      <div class="field">
        <label for="password">Password</label>
        ${passwordInput('password', 'password', 'current-password', {})}
      </div>
      <button class="btn btn-primary btn-lg btn-block" type="submit">Log in</button>
    </form>
    <p class="auth-alt">New here? <a href="/signup${next ? `?next=${encodeURIComponent(next)}` : ''}">Create an account</a></p>
    <p class="hint center">Forgot your password? Email ${ctx.config.contactEmail ? html`<a href="mailto:${ctx.config.contactEmail}">${ctx.config.contactEmail}</a>` : 'a moderator'} from the address on your account and we'll send a reset link.</p>`);
}

function resetPassword(ctx, { token, error, user }) {
  return authShell(ctx, 'Reset password', html`
    <h1>Choose a new password</h1>
    <p class="sub">For @${user ? user.username : ''}</p>
    ${error ? notice('danger', error) : ''}
    <form method="post" action="/reset/${token}" class="stack">
      ${csrfField(ctx)}
      <div class="field"><label for="password">New password <span class="opt">8+ characters</span></label>${passwordInput('password', 'password', 'new-password', {})}</div>
      <button class="btn btn-primary btn-lg btn-block" type="submit">Save password</button>
    </form>`);
}

function settings(ctx, { values, errors }) {
  const u = ctx.user;
  const platforms = Object.entries(ctx.config.socialPlatforms || {});
  const providers = enabledProviders(ctx);
  const body = html`
  <div class="container">
    <header class="pagehead"><div><h1>Settings</h1><p class="sub">Signed in as @${u.username}</p></div>
      <a class="btn btn-secondary btn-sm" href="/u/${u.username}">${icon('user')}<span>View profile</span></a></header>
    <div class="settings">
      <nav class="settings-nav" aria-label="Settings sections">
        <a href="#profile">${icon('user')}<span>Profile</span></a>
        <a href="#socials">${icon('share')}<span>Social links</span></a>
        ${providers.length ? html`<a href="#connections">${icon('key')}<span>Sign-in methods</span></a>` : ''}
        <a href="#password">${icon('lock')}<span>Password</span></a>
        <a href="/settings/api-keys">${icon('code')}<span>API keys</span></a>
        <a href="#delete">${icon('trash')}<span>Delete account</span></a>
      </nav>
      <div class="settings-main">
        <section class="panel" id="profile">
          <h2 class="panel-h">Profile</h2>
          <div class="avatar-edit" data-avatar-edit data-csrf="${ctx.csrf}">
            <span data-avatar-preview>${avatar(u, 'xl')}</span>
            <div class="avatar-edit-body">
              <p class="avatar-edit-title">Profile photo</p>
              <p class="hint">PNG, JPG, WebP or GIF, up to 5 MB. Square works best.</p>
              <div class="btnrow">
                <label class="btn btn-secondary btn-sm" for="avatar-file">${icon('camera')}<span>${u.avatar_url ? 'Change photo' : 'Upload photo'}</span></label>
                <input type="file" id="avatar-file" accept=".png,.jpg,.jpeg,.webp,.gif" class="sr-only" data-avatar-input>
                ${u.avatar_url ? html`<form method="post" action="/settings/avatar/remove">${csrfField(ctx)}<button class="btn btn-ghost btn-sm" type="submit">${icon('trash')}<span>Remove</span></button></form>` : ''}
              </div>
              <noscript><p class="hint">Uploading a photo needs JavaScript.</p></noscript>
            </div>
          </div>
          <form method="post" action="/settings/profile" class="stack" id="profile-form">
            ${csrfField(ctx)}
            <div class="field">
              <label for="display_name">Display name</label>
              <input id="display_name" name="display_name" required maxlength="50" value="${values.display_name}"${invalid(errors, 'display_name')}>
              ${fieldError(errors, 'display_name')}
            </div>
            <div class="field">
              <label for="bio">Bio <span class="opt">up to 500 characters</span></label>
              <textarea id="bio" name="bio" rows="4" maxlength="500" placeholder="What you make, what you edit with">${values.bio}</textarea>
            </div>
            <div class="grid2">
              <div class="field">
                <label for="website">Website or portfolio</label>
                <input id="website" name="website" maxlength="200" value="${values.website}" placeholder="yourportfolio.com"${invalid(errors, 'website')}>
                ${fieldError(errors, 'website')}
              </div>
              <div class="field">
                <label for="email">Email <span class="opt">private</span></label>
                <input id="email" name="email" type="email" maxlength="200" value="${values.email}" autocomplete="email"${invalid(errors, 'email')}>
                ${fieldError(errors, 'email')}
              </div>
            </div>
            <h3 class="subhead" id="socials">Social links <span class="opt">shown on your profile</span></h3>
            <div class="grid2">
              ${platforms.map(([k, label]) => html`<div class="field">
                <label for="social_${k}">${label}</label>
                <div class="prefixed"><span>${icon(k)}</span><input id="social_${k}" name="social_${k}" maxlength="200" value="${values[`social_${k}`] || ''}" placeholder="@handle or link"${invalid(errors, `social_${k}`)}></div>
                ${fieldError(errors, `social_${k}`)}
              </div>`)}
            </div>
            <div class="btnrow"><button class="btn btn-primary" type="submit">${icon('check')}<span>Save profile</span></button></div>
          </form>
        </section>

        ${providers.length ? html`<section class="panel" id="connections">
          <h2 class="panel-h">Sign-in methods</h2>
          <ul class="conns">
            ${providers.map((p) => {
    const linked = (u.connections || []).includes(p.id);
    return html`<li class="conn">
              <span class="conn-mark">${p.mark()}</span>
              <span class="conn-main"><strong>${p.label}</strong><span>${linked ? 'Connected. You can log in with it.' : 'Not connected'}</span></span>
              ${linked ? html`<form method="post" action="/settings/connections/${p.id}/remove" data-confirm="Disconnect ${p.label}? You won't be able to log in with it anymore.">${csrfField(ctx)}<button class="btn btn-ghost btn-sm" type="submit">Disconnect</button></form>`
    : html`<a class="btn btn-secondary btn-sm" href="/auth/${p.id}?next=/settings" data-loading>Connect</a>`}
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
          <div><button class="btn btn-secondary" type="submit">${u.has_password ? 'Change password' : 'Set password'}</button></div>
        </form>

        <form method="post" action="/settings/delete" class="panel panel-danger stack" id="delete" data-confirm="This permanently deletes your account and every file you uploaded. Continue?">
          ${csrfField(ctx)}
          <h2 class="panel-h">Delete account</h2>
          <p class="hint">Deletes your account and every upload. Links stop working. This can't be undone.</p>
          ${errors.delete ? notice('danger', errors.delete) : ''}
          <div class="field"><label for="confirm">Type your username, <strong>${u.username}</strong></label><input id="confirm" name="confirm" autocomplete="off" autocapitalize="off" spellcheck="false" required></div>
          ${u.has_password ? html`<div class="field"><label for="delete-password">Password</label><input id="delete-password" name="password" type="password" autocomplete="current-password" required></div>` : ''}
          <div><button class="btn btn-danger" type="submit">${icon('trash')}<span>Delete my account</span></button></div>
        </form>
      </div>
    </div>
  </div>`;
  return layout(ctx, { title: 'Settings', body, noindex: true });
}

// ---- API keys ---------------------------------------------------------------------------

const EXPIRY_CHOICES = [['7', '7 days'], ['30', '30 days'], ['60', '60 days'], ['90', '90 days'], ['365', '1 year'], ['custom', 'Custom date'], ['never', 'Never']];

function keyExpiry(k) {
  if (k.expired) return html`<span class="keytag keytag-bad">Expired ${formatDate(k.expires_at)}</span>`;
  if (!k.expires_at) return html`<span class="keytag">Never expires</span>`;
  return html`<span class="keytag">Expires ${formatDate(k.expires_at)}</span>`;
}

function apiKeys(ctx, { keys, scopes, max, created = null, values = {}, errors = {} }) {
  const all = scopes.map((s) => s.id);
  const chosen = new Set(values.scopes || []);
  const full = values.full === 'on' || (values.full === undefined && !values.name && !chosen.size);
  const expires = values.expires || '90';
  const scopeName = Object.fromEntries((ctx.apiScopes || scopes).map((s) => [s.id, s.name]));
  const today = new Date(Date.now() + 24 * 3600 * 1000).toISOString().slice(0, 10);
  const body = html`
  <div class="container">
    <nav class="crumbs" aria-label="Breadcrumb"><a href="/settings">Settings</a>${icon('chevronRight')}<span>API keys</span></nav>
    <header class="pagehead"><div><h1>API keys</h1>
      <p class="sub">Let scripts, apps and AI agents use your account. Each key only gets the permissions you pick.</p></div>
      <a class="btn btn-secondary btn-sm" href="/developers/api">${icon('file')}<span>API docs</span></a></header>

    ${created ? html`<section class="newkey" role="status">
      <p class="newkey-h">${icon('check')}<strong>${created.key.name}</strong> is ready. Copy the key now: it won't be shown again.</p>
      <div class="newkey-row"><code class="newkey-token" data-select-on-focus tabindex="0">${created.token}</code>
        <button type="button" class="btn btn-primary btn-sm" data-copy="${created.token}">${icon('copy')}<span>Copy</span></button></div>
      <pre class="code">curl -H "Authorization: Bearer ${created.token}" ${ctx.absolute('/api/me/assets')}</pre>
      <p class="hint">Keep it secret, like a password. Anyone with it can do everything the key allows. If it leaks, revoke it below.</p>
    </section>` : ''}

    <div class="keys-layout">
      <form method="post" action="/settings/api-keys" class="panel stack" id="new-key" data-key-form>
        ${csrfField(ctx)}
        <h2 class="panel-h">${icon('plus')}New key</h2>
        <div class="field">
          <label for="key-name">Name</label>
          <input id="key-name" name="name" maxlength="60" required placeholder="Upload script" value="${values.name || ''}"${invalid(errors, 'name')}>
          ${fieldError(errors, 'name')}
          <p class="hint">So you can tell keys apart later.</p>
        </div>
        <div class="field">
          <label for="key-expires">Expires</label>
          <select id="key-expires" name="expires" data-key-expires>
            ${EXPIRY_CHOICES.map(([v, label]) => html`<option value="${v}" ${expires === v ? 'selected' : ''}>${label}</option>`)}
          </select>
          <input type="date" name="expiresAt" min="${today}" value="${values.expiresAt || ''}" aria-label="Expiry date" data-key-date${invalid(errors, 'expires')}>
          ${fieldError(errors, 'expires')}
        </div>
        <fieldset class="field scopes">
          <legend>Permissions</legend>
          <label class="scope scope-all"><input type="checkbox" name="full" ${full ? 'checked' : ''} data-key-full>
            <span><strong>Full access</strong><small>Everything below, now and for any permission added later to this list.</small></span></label>
          ${scopes.map((s) => html`<label class="scope${s.danger ? ' scope-danger' : ''}"><input type="checkbox" name="scopes" value="${s.id}" ${full || chosen.has(s.id) ? 'checked' : ''} data-key-scope>
            <span><strong>${s.name}</strong> <code>${s.id}</code><small>${s.description}</small></span></label>`)}
          ${fieldError(errors, 'scopes')}
        </fieldset>
        <p class="hint">Keys can never create other keys, change your password or sign-in methods. Those always need you to log in.</p>
        <div><button class="btn btn-primary" type="submit" data-loading>${icon('key')}<span>Create key</span></button></div>
      </form>

      <section class="panel">
        <h2 class="panel-h">${icon('key')}Your keys <span class="dim mono">${keys.length}/${max}</span></h2>
        ${keys.length ? html`<ul class="keylist">${keys.map((k) => html`<li class="keyitem${k.expired ? ' is-expired' : ''}">
          <div class="keyitem-main">
            <p class="keyitem-name"><strong>${k.name}</strong> <code>${k.prefix}…</code></p>
            <p class="keyitem-meta">${keyExpiry(k)}<span>Created ${formatDate(k.created_at)}</span><span>${k.last_used_at ? `Last used ${timeAgo(k.last_used_at)}` : 'Never used'}</span></p>
            <p class="keyitem-scopes">${k.scopes.includes('*') || all.every((id) => k.scopes.includes(id)) ? html`<span class="keytag keytag-full">Full access</span>`
    : k.scopes.map((id) => html`<span class="keytag" title="${id}">${scopeName[id] || id}</span>`)}</p>
          </div>
          <form method="post" action="/settings/api-keys/${k.id}/revoke" data-confirm="Revoke “${k.name}”? Anything using it stops working right away.">
            ${csrfField(ctx)}<button class="btn btn-danger btn-sm" type="submit">${icon('trash')}<span>Revoke</span></button></form>
        </li>`)}</ul>` : html`<p class="hint">No keys yet. Create one to use the API from your own scripts.</p>`}
      </section>
    </div>
  </div>`;
  return layout(ctx, { title: 'API keys', body, noindex: true });
}

function error(ctx, { status, title, message }) {
  return layout(ctx, {
    title,
    noindex: true,
    body: html`<div class="container"><div class="bigmsg">
      <span class="bigmsg-icon">${icon(status === 404 ? 'compass' : 'alert')}</span>
      <p class="bigmsg-code">${status}</p>
      <h1>${title}</h1>
      <p>${message}</p>
      <div class="btnrow center"><a class="btn btn-primary" href="/">Go home</a><a class="btn btn-secondary" href="/browse">Explore resources</a></div>
    </div></div>`,
  });
}

module.exports = { signup, login, resetPassword, settings, apiKeys, error };
