'use strict';
const { html, raw, richText, formatBytes, formatCount, formatDate } = require('../src/html');
const { layout } = require('./layout');
const {
  icon, hue, avatar, csrfField, assetGrid, fieldError, invalid, meter, notice, sectionHead,
} = require('./components');

// ---- Asset page ------------------------------------------------------------------

function player(a) {
  if (a.locked && !a.unlocked) {
    return html`<div class="player player-locked">${icon('lock')}<p>Preview hidden until the file is unlocked</p></div>`;
  }
  const poster = a.thumbUrl || '';
  if (a.videoSrc) {
    return html`<div class="player ${a.vertical ? 'is-vertical' : ''}"><video controls playsinline preload="metadata" loop ${poster ? html`poster="${poster}"` : ''} src="${a.videoSrc}"></video></div>`;
  }
  if (a.audioSrc) {
    return html`<div class="player player-audio">
      ${a.thumbUrl ? html`<img src="${a.thumbUrl}" alt="Waveform of ${a.title}">` : html`<div class="tile">${icon('wave')}</div>`}
      <audio controls preload="metadata" src="${a.audioSrc}"></audio>
    </div>`;
  }
  const still = a.imageSrc || a.thumbUrl;
  if (still) return html`<div class="player player-still"><img src="${still}" alt="${a.title}"></div>`;
  return html`<div class="player player-none"><div class="tile">${icon(a.category.icon)}<span>.${a.file_ext}</span><small>${a.kindInfo.name}, no preview</small></div></div>`;
}

function licenseTerms(l) {
  const term = (ok, text) => html`<li class="${ok ? 'ok' : 'cond'}">${icon(ok ? 'check' : 'info')}<span>${text}</span></li>`;
  return html`<ul class="terms">
    ${term(l.commercial, l.commercial ? 'Commercial and client work allowed' : 'Non-commercial projects only')}
    ${term(!l.attribution, l.attribution ? 'Credit the creator' : 'No credit required')}
    ${l.shareAlike ? term(false, 'Modified versions use the same license') : ''}
    ${l.noResale ? term(false, 'Don\'t resell or re-upload it as is') : ''}
  </ul>`;
}

// "Expires in 4m 12s" ticks live in the browser; the server renders the exact time as a fallback.
function linkStatus(a) {
  if (!a.expires_at && !a.max_downloads) return '';
  return html`<div class="linkstatus">
    ${a.expires_at ? html`<div class="linkstatus-row">${icon('clock')}<span>Link expires <strong data-expires="${a.expires_at}">${formatDate(a.expires_at)}</strong></span></div>` : ''}
    ${a.max_downloads ? html`<div class="linkstatus-row">${icon('download')}<span><strong>${formatCount(a.downloads_left)}</strong> of ${formatCount(a.max_downloads)} downloads left</span></div>` : ''}
  </div>`;
}

function asset(ctx, { asset: a, more, related, saved, shareUrl, justUploaded, manageKey }) {
  const { user } = ctx;
  const credit = `"${a.title}" by ${a.anonymous ? 'an anonymous creator' : a.display_name} (${shareUrl}), licensed under ${a.license.short}`;
  const keyQs = manageKey ? `?key=${encodeURIComponent(manageKey)}` : '';
  const manageUrl = manageKey ? ctx.absolute(`${a.url}${keyQs}`) : '';
  const details = [
    ['Format', html`.${a.file_ext} <span class="dim">${a.kindInfo.name}</span>`],
    a.resolution && ['Resolution', html`${a.width}×${a.height}${a.vertical ? html` <span class="dim">vertical</span>` : ''}`],
    a.durationLabel && ['Duration', a.durationLabel],
    ['Size', a.sizeLabel],
    a.software.length && ['Works with', a.software.map((s, i) => html`${i ? ', ' : ''}<a href="/browse?software=${s.id}">${s.name}</a>`)],
    ['Category', html`<a href="/browse?category=${a.category.id}">${a.category.name}</a>`],
    ['Uploaded', html`<time datetime="${new Date(a.created_at).toISOString()}">${formatDate(a.created_at)}</time>`],
    a.updated_at - a.created_at > 60000 && ['Updated', formatDate(a.updated_at)],
  ].filter(Boolean);
  const ogImage = a.thumbUrl && !a.locked ? ctx.absolute(a.thumbUrl) : null;
  const ogVideo = a.videoSrc && a.visibility === 'public' && !a.locked ? ctx.absolute(a.videoSrc) : null;
  const isAdmin = user && user.role === 'admin';
  const canDownload = !a.locked || a.unlocked;

  const body = html`
  <div class="container">
    <nav class="crumbs" aria-label="Breadcrumb"><a href="/browse">Explore</a>${icon('chevronRight')}<a href="/browse?category=${a.category.id}">${a.category.name}</a></nav>
    <div class="notices">
      ${a.status !== 'active' ? notice('danger', html`<strong>Removed by moderators</strong> (${a.removed_reason || 'guidelines'}). Only you${isAdmin ? ' and moderators' : ''} can see this page.`) : ''}
      ${a.expired ? notice('danger', html`<strong>${a.expired === 'limit' ? 'Download limit reached.' : 'This link has expired.'}</strong> Visitors can't open it. Edit it to give it more time or downloads.`, 'clock') : ''}
      ${justUploaded ? notice('success', html`<strong>Uploaded.</strong> ${a.locked || a.expires_at || a.max_downloads || a.visibility === 'unlisted' ? 'It\'s a private link, so only people you send it to can open it.' : 'It\'s live and listed.'} Copy the link to share it.`) : ''}
      ${manageUrl ? html`<div class="manage" data-reveal>
        <div class="manage-head">${icon('key')}<div><strong>Your private manage link</strong><p>You uploaded without an account. Keep this link to edit or delete the file later. Anyone with it can manage the upload, so don't share it.</p></div></div>
        <div class="copyrow"><input type="text" readonly value="${manageUrl}" aria-label="Private manage link" data-select-on-focus>
          <button type="button" class="btn btn-secondary" data-copy="${manageUrl}">${icon('copy')}<span>Copy</span></button></div>
      </div>` : ''}
      ${a.processing ? notice('', 'Generating the thumbnail and preview. Refresh in a minute.') : ''}
    </div>

    <div class="ap" ${hue(a.category)}>
      <div class="ap-player">${player(a)}</div>

      <header class="ap-head">
        <h1>${a.title}</h1>
        <div class="ap-meta">
          ${a.anonymous ? html`<span class="ap-by">${html`<span class="avatar sm anon">${icon('ghost')}</span>`}<span><strong>Anonymous</strong><small>Uploaded without an account</small></span></span>`
    : html`<a class="ap-by" href="/u/${a.username}">${avatar({ username: a.username, display_name: a.display_name, avatar_url: a.user_avatar_url }, 'sm')}<span><strong>${a.display_name}</strong><small>@${a.username}</small></span></a>`}
          <div class="ap-counts">
            <span>${icon('download')}${formatCount(a.downloads)}</span>
            <span>${icon('eye')}${formatCount(a.views)}</span>
            <span>${icon('bookmark')}<span data-save-count>${formatCount(a.favorites)}</span></span>
          </div>
        </div>
      </header>

      <aside class="ap-side">
        <section class="card-box dl-box">
          ${canDownload ? html`
            <a class="btn btn-primary btn-xl btn-block" href="${a.downloadUrl}" data-download>${icon('download')}<span>Download</span><span class="btn-meta">${a.sizeLabel}</span></a>`
    : html`<form method="post" action="${a.url}/unlock" class="unlock" id="unlock">
            ${csrfField(ctx)}
            <div class="unlock-head"><span class="unlock-icon">${icon('lock')}</span><div><strong>Password protected</strong><p>Enter the password to preview and download.</p></div></div>
            <div class="pw"><input type="password" name="password" required placeholder="Password" aria-label="Password" autocomplete="off" id="unlock-pw">
              <button type="button" class="pw-toggle" data-toggle-password="unlock-pw" aria-label="Show password" aria-pressed="false">${icon('eye')}</button></div>
            <button class="btn btn-primary btn-lg btn-block" type="submit">${icon('unlock')}<span>Unlock</span></button>
          </form>`}
          ${linkStatus(a)}
          <div class="dl-actions">
            ${user ? html`<form method="post" action="${a.url}/save" data-save-form data-api="/api/assets/${a.slug}/save">${csrfField(ctx)}
              <button type="submit" class="btn btn-secondary btn-block ${saved ? 'is-on' : ''}" aria-pressed="${saved ? 'true' : 'false'}" data-save-btn>${icon('bookmark')}<span>${saved ? 'Saved' : 'Save'}</span></button></form>`
    : html`<a class="btn btn-secondary btn-block" href="/login?next=${encodeURIComponent(a.url)}">${icon('bookmark')}<span>Save</span></a>`}
            <button type="button" class="btn btn-secondary btn-block" data-share data-share-title="${a.title}" data-share-url="${shareUrl}" data-copy="${shareUrl}">${icon('share')}<span>Share</span></button>
          </div>
          <div class="copyrow">
            <input id="share-url" type="text" readonly value="${shareUrl}" aria-label="Share link" data-select-on-focus>
            <button type="button" class="btn btn-secondary" data-copy="${shareUrl}" aria-label="Copy share link">${icon('copy')}</button>
          </div>
          ${canDownload ? html`<button type="button" class="link-quiet" data-copy="${ctx.absolute(a.downloadUrl)}">${icon('link')}<span>Copy direct download link</span></button>` : ''}
        </section>

        <section class="card-box">
          <p class="box-label">License</p>
          <p class="license-name"><a href="${a.license.url}" ${a.license.url.startsWith('http') ? raw('target="_blank" rel="noopener"') : ''}>${a.license.name}</a></p>
          ${licenseTerms(a.license)}
          ${a.license.attribution ? html`<div class="credit">
            <label for="credit">Credit line</label>
            <textarea id="credit" readonly rows="3" data-select-on-focus>${credit}</textarea>
            <button type="button" class="link-quiet" data-copy="${credit}">${icon('copy')}<span>Copy credit</span></button>
          </div>` : ''}
        </section>

        <section class="card-box">
          <p class="box-label">Details</p>
          <dl class="specs">${details.map(([k, v]) => html`<div><dt>${k}</dt><dd>${v}</dd></div>`)}</dl>
        </section>

        ${a.canEdit ? html`<section class="card-box">
          <p class="box-label">${a.isOwner ? 'Manage' : 'Moderator tools'}</p>
          <div class="btnrow">
            <a class="btn btn-secondary btn-sm" href="${a.url}/edit${keyQs}">${icon('edit')}<span>Edit</span></a>
            <form method="post" action="${a.url}/delete" data-confirm="Delete &quot;${a.title}&quot; permanently? The link will stop working.">${csrfField(ctx)}
              ${manageKey ? html`<input type="hidden" name="manageKey" value="${manageKey}">` : ''}
              <button class="btn btn-danger btn-sm" type="submit">${icon('trash')}<span>Delete</span></button></form>
          </div>
          ${isAdmin && a.status === 'active' ? html`<form method="post" action="/admin/assets/${a.id}/remove" class="modform" data-confirm="Remove this asset from the site?">${csrfField(ctx)}
            <input type="text" name="reason" placeholder="Reason, shown to the uploader" aria-label="Removal reason">
            <label class="check"><input type="checkbox" name="block"><span>Block this exact file from being uploaded again</span></label>
            <button class="btn btn-danger btn-sm" type="submit">Remove from site</button></form>` : ''}
        </section>` : ''}

        <a class="report" href="${a.url}/report">${icon('flag')}<span>Report this file</span></a>
      </aside>

      <div class="ap-body">
        ${a.description ? html`<div class="prose">${richText(a.description)}</div>` : ''}
        ${a.tags.length ? html`<div class="chips">${a.tags.map((t) => html`<a class="chip" href="/browse?tag=${encodeURIComponent(t)}">#${t}</a>`)}</div>` : ''}
      </div>
    </div>

    ${more.length && !a.anonymous ? html`<section class="section">
      ${sectionHead(`More from ${a.display_name}`, [`/u/${a.username}`, 'View profile'])}
      ${assetGrid(more, { hideUser: true })}
    </section>` : ''}
    ${related.length ? html`<section class="section">
      ${sectionHead(`More ${a.category.name.toLowerCase()}`, [`/browse?category=${a.category.id}`, 'Browse'])}
      ${assetGrid(related)}
    </section>` : ''}
  </div>`;

  return layout(ctx, {
    title: a.title,
    description: (a.description || `${a.category.name}${a.anonymous ? '' : ` by ${a.display_name}`}. Free download, ${a.license.name}.`).slice(0, 200),
    body,
    noindex: a.visibility === 'unlisted' || a.status !== 'active' || a.locked || !!a.expires_at || !!a.max_downloads,
    og: { title: a.anonymous ? a.title : `${a.title} by ${a.display_name}`, url: ctx.absolute(a.url), image: ogImage, video: ogVideo, type: ogVideo ? 'video.other' : 'website' },
  });
}

function bigMessage(ctx, { code, iconName, title, text, noindex = true }) {
  return layout(ctx, {
    title, noindex,
    body: html`<div class="container"><div class="bigmsg">
      <span class="bigmsg-icon">${icon(iconName)}</span>
      ${code ? html`<p class="bigmsg-code">${code}</p>` : ''}
      <h1>${title}</h1>
      <p>${text}</p>
      <div class="btnrow center"><a class="btn btn-primary" href="/browse">${icon('compass')}<span>Explore resources</span></a><a class="btn btn-secondary" href="/">Go home</a></div>
    </div></div>`,
  });
}

function removed(ctx, { asset: a }) {
  return bigMessage(ctx, {
    iconName: 'alert', code: '410', title: 'This file was removed',
    text: html`"${a.title}" is no longer available${a.removed_reason ? html` (${a.removed_reason})` : ''}. If you made it and think this is a mistake, read the <a href="/copyright">takedown policy</a>.`,
  });
}

function expired(ctx, { asset: a, reason }) {
  return bigMessage(ctx, {
    iconName: 'clock', code: '410',
    title: reason === 'limit' ? 'Download limit reached' : 'This link has expired',
    text: html`"${a.title}" was shared with ${reason === 'limit' ? 'a download limit, and it has been used up' : 'a time limit, and that time is up'}. Ask the person who sent it for a new link.`,
  });
}

// ---- Upload & edit forms ------------------------------------------------------------

function detailFields(catalog, values, errors) {
  const sw = new Set(values.software || []);
  return html`
    <div class="field">
      <label for="title">Title</label>
      <input id="title" name="title" type="text" required minlength="3" maxlength="100" value="${values.title || ''}" placeholder="12 Organic Light Leaks (4K)"${invalid(errors, 'title')}>
      ${fieldError(errors, 'title')}
    </div>
    <div class="field">
      <label for="category">Category</label>
      <select id="category" name="category" required${invalid(errors, 'category')}>
        <option value="">Choose one</option>
        ${catalog.categories.map((c) => html`<option value="${c.id}" ${values.category === c.id ? 'selected' : ''}>${c.name}</option>`)}
      </select>
      ${fieldError(errors, 'category')}
    </div>
    <fieldset class="field">
      <legend>Works with</legend>
      <div class="toggles">
        ${catalog.software.map((s) => html`<label class="toggle"><input type="checkbox" name="software" value="${s.id}" ${sw.has(s.id) ? 'checked' : ''}><span>${s.name}</span></label>`)}
      </div>
    </fieldset>
    <div class="field">
      <label for="tags">Tags <span class="opt">comma separated</span></label>
      <input id="tags" name="tags" type="text" maxlength="400" value="${Array.isArray(values.tags) ? values.tags.join(', ') : values.tags || ''}" placeholder="light leak, film, warm, 4k" data-tags-input>
      <div class="chips tagpreview" data-tags-preview aria-hidden="true"></div>
    </div>
    <div class="field">
      <label for="description">Description <span class="opt">optional</span></label>
      <textarea id="description" name="description" rows="5" maxlength="5000" placeholder="What's in it, frame rate, codec, software version, required plugins">${values.description || ''}</textarea>
    </div>`;
}

function licenseFields(catalog, values, errors) {
  return html`
    <fieldset class="field">
      <legend>License <a class="opt" href="/licenses" target="_blank">Compare</a></legend>
      <div class="choices">
        ${catalog.licenses.map((l) => html`<label class="choice">
          <input type="radio" name="license" value="${l.id}" ${values.license === l.id ? 'checked' : ''} required>
          <span><strong>${l.short}</strong><span>${l.summary}</span></span>
        </label>`)}
      </div>
      ${fieldError(errors, 'license')}
    </fieldset>`;
}

const UNITS = [['1', 'minutes'], ['60', 'hours'], ['1440', 'days']];

// Who can see it and for how long: visibility, expiry, download limit and password.
function linkFields(values, errors, { editing = false, asset: a = null } = {}) {
  const expiry = values.expiry || (editing ? 'keep' : 'never');
  return html`
    <fieldset class="field">
      <legend>Visibility</legend>
      <div class="seg seg-block">
        <label><input type="radio" name="visibility" value="public" ${values.visibility !== 'unlisted' ? 'checked' : ''}><span>${icon('globe')}Public</span></label>
        <label><input type="radio" name="visibility" value="unlisted" ${values.visibility === 'unlisted' ? 'checked' : ''}><span>${icon('link')}Link only</span></label>
      </div>
      <p class="hint">Files with a password, expiry or download limit are always link only.</p>
    </fieldset>

    <fieldset class="field" data-expiry>
      <legend>Link expires</legend>
      <div class="seg seg-block">
        ${editing ? html`<label><input type="radio" name="expiry" value="keep" ${expiry === 'keep' ? 'checked' : ''}><span>Keep</span></label>` : ''}
        <label><input type="radio" name="expiry" value="never" ${expiry === 'never' ? 'checked' : ''}><span>${icon('infinity')}Never</span></label>
        <label><input type="radio" name="expiry" value="after" ${expiry === 'after' ? 'checked' : ''}><span>${icon('clock')}After</span></label>
      </div>
      ${editing && a && a.expires_at ? html`<p class="hint">Currently: ${a.expired === 'expired' ? 'expired' : html`expires <strong data-expires="${a.expires_at}">${formatDate(a.expires_at)}</strong>`}.</p>` : ''}
      <div class="expiry-after" data-expiry-after>
        <input type="number" name="expiryAmount" min="1" max="525600" step="1" value="${values.expiryAmount || 5}" aria-label="Expire after" inputmode="numeric"${invalid(errors, 'expiresIn')}>
        <select name="expiryUnit" aria-label="Unit">${UNITS.map(([v, l]) => html`<option value="${v}" ${String(values.expiryUnit || '1') === v ? 'selected' : ''}>${l}</option>`)}</select>
        <input type="hidden" name="expiresIn" value="" data-expires-in>
      </div>
      <div class="quick" data-expiry-quick>${[1, 2, 3, 5, 10, 30].map((m) => html`<button type="button" class="chip" data-minutes="${m}">${m} min</button>`)}<button type="button" class="chip" data-minutes="60">1 hour</button><button type="button" class="chip" data-minutes="1440">1 day</button><button type="button" class="chip" data-minutes="10080">7 days</button></div>
      ${fieldError(errors, 'expiresIn')}
    </fieldset>

    <div class="field">
      <label for="maxDownloads">Download limit <span class="opt">optional</span></label>
      <input id="maxDownloads" name="maxDownloads" type="number" min="1" max="1000000" step="1" inputmode="numeric" value="${values.maxDownloads || ''}" placeholder="Unlimited"${invalid(errors, 'maxDownloads')}>
      ${fieldError(errors, 'maxDownloads')}
    </div>

    <div class="field">
      <label for="file-password">${editing && a && a.locked ? 'New password' : 'Password'} <span class="opt">optional</span></label>
      <div class="pw"><input id="file-password" name="password" type="password" minlength="4" maxlength="200" autocomplete="new-password" placeholder="${editing && a && a.locked ? 'Leave empty to keep the current one' : 'No password'}"${invalid(errors, 'password')}>
        <button type="button" class="pw-toggle" data-toggle-password="file-password" aria-label="Show password" aria-pressed="false">${icon('eye')}</button></div>
      ${fieldError(errors, 'password')}
      ${editing && a && a.locked ? html`<label class="check"><input type="checkbox" name="removePassword"><span>Remove the password</span></label>` : html`<p class="hint">People need it to preview or download the file.</p>`}
    </div>`;
}

function mediaFields(catalog, limits, opts = {}) {
  return html`
    <div class="thumbpick">
      <div class="thumbframe" data-thumb-frame>
        <canvas hidden data-thumb-canvas></canvas>
        <img hidden data-thumb-img alt="Thumbnail preview" ${opts.currentThumb ? html`src="${opts.currentThumb}" data-current` : ''}>
        <span class="thumbframe-empty" data-thumb-empty ${opts.currentThumb ? 'hidden' : ''}>${icon('image')}<span>No thumbnail yet</span></span>
      </div>
      <div class="thumbctl">
        <div class="field" data-frame-picker hidden>
          <label for="frame">Frame <span class="opt" data-frame-time></span></label>
          <input type="range" id="frame" min="0" max="1" step="0.01" value="0" data-frame-range>
        </div>
        <div class="field">
          <label for="thumbnail">Custom thumbnail <span class="opt">optional</span></label>
          <input type="file" id="thumbnail" name="thumbnail" accept=".png,.jpg,.jpeg,.webp,.gif">
          ${fieldError(opts.errors, 'thumbnail')}
        </div>
        <p class="hint" data-thumb-note>${opts.thumbNote || 'Videos get one from a frame automatically. Drag the slider to choose it.'}</p>
      </div>
    </div>
    <div class="field">
      <label for="preview">Preview clip or image <span class="opt">optional, up to ${formatBytes(limits.maxPreview)}</span></label>
      <input type="file" id="preview" name="preview" accept="${catalog.previewExts.map((e) => `.${e}`).join(',')}">
      ${fieldError(opts.errors, 'preview')}
      <p class="hint">Great for LUTs, presets and templates, so people see the result before downloading.</p>
    </div>
    <input type="hidden" name="width" data-meta="width">
    <input type="hidden" name="height" data-meta="height">
    <input type="hidden" name="duration" data-meta="duration">`;
}

const allowedJson = (catalog) => JSON.stringify(catalog.fileTypes);

function dropzone(limits, errors, { required, compact } = {}) {
  return html`
    <div class="drop ${compact ? 'is-compact' : ''} ${errors.file ? 'has-error' : ''}" data-dropzone>
      <input type="file" id="file" name="file" ${required ? 'required' : ''} class="drop-input" aria-describedby="drop-help">
      <div class="drop-empty" data-dz-empty>
        <span class="drop-icon">${icon('upload')}</span>
        <p class="drop-title">Drop your file here, or <span class="drop-link">browse</span></p>
        <p class="drop-help" id="drop-help">Up to ${formatBytes(limits.maxUpload)}. Several files? Zip them first.</p>
      </div>
      <div class="drop-file" data-dz-file hidden>
        <span class="drop-icon">${icon('file')}</span>
        <div class="drop-file-info"><strong data-dz-name></strong><span data-dz-meta></span></div>
        <span class="btn btn-secondary btn-sm">Change</span>
      </div>
    </div>
    ${fieldError(errors, 'file')}`;
}

function progressBlock() {
  return html`<div class="progress" data-progress hidden aria-live="polite">
      <div class="progress-track"><span class="progress-fill" data-progress-fill></span></div>
      <div class="progress-row"><span data-progress-text>Starting</span><button type="button" class="link-quiet" data-cancel>Cancel</button></div>
    </div>
    <p class="form-error" data-form-error role="alert" hidden></p>`;
}

function upload(ctx, { values, errors, limits }) {
  if (ctx.config.uploadsEnabled === false) {
    return layout(ctx, {
      title: 'Upload', noindex: true,
      body: html`<div class="container narrow"><header class="pagehead"><div><h1>Upload</h1></div></header>
        ${notice('', 'Uploads aren\'t open yet while storage is being set up. Check back soon.')}</div>`,
    });
  }
  const anon = !ctx.user;
  const remaining = limits.quota ? Math.max(0, limits.quota - limits.used) : '';
  const body = html`
  <div class="container">
    <header class="pagehead">
      <div><h1>Upload a resource</h1><p class="sub">Free for others to download under the license you choose.</p></div>
    </header>
    ${anon ? notice('', html`<strong>You're not logged in, and that's fine.</strong> You can upload up to ${formatBytes(limits.maxUpload)} anonymously and you'll get a private link to edit or delete it. <a href="/login?next=/upload">Log in</a> or <a href="/signup?next=/upload">create an account</a> to keep all your uploads in one place.`, 'ghost') : ''}
    ${Object.keys(errors).length ? notice('danger', html`<strong>Check the fields below.</strong>${errors.file ? '' : ' You\'ll need to choose your file again.'}`) : ''}
    <noscript>${notice('danger', 'Uploading needs JavaScript, because files go straight from your browser to storage.')}</noscript>
    <form id="upload-form" class="formgrid" method="post" action="/upload"
      data-upload-form data-mode="create" data-allowed="${allowedJson(ctx.catalog)}" data-kind-category="${JSON.stringify(ctx.catalog.kindCategory)}"
      data-max="${limits.maxUpload}" data-max-preview="${limits.maxPreview}" data-remaining="${remaining}" data-csrf="${ctx.csrf}" data-api="/api/assets">
      ${csrfField(ctx)}
      <div class="formgrid-main">
        <section class="panel">
          <h2 class="panel-h">${icon('file')}File</h2>
          ${dropzone(limits, errors, { required: true })}
          <p class="hint">Programs, installers, scripts and plugins (.exe, .dmg, .aex, .jsx) aren't accepted. <a href="/guidelines#formats" target="_blank">See formats</a>.</p>
        </section>
        <section class="panel">
          <h2 class="panel-h">${icon('edit')}Details</h2>
          ${detailFields(ctx.catalog, values, errors)}
        </section>
        <section class="panel">
          <h2 class="panel-h">${icon('image')}Thumbnail and preview</h2>
          ${mediaFields(ctx.catalog, limits, { errors })}
        </section>
      </div>
      <aside class="formgrid-side">
        <section class="panel">
          <h2 class="panel-h">${icon('link')}Link settings</h2>
          ${linkFields(values, errors)}
        </section>
        <section class="panel">
          ${licenseFields(ctx.catalog, values, errors)}
          <label class="check ${errors.rights ? 'has-error' : ''}">
            <input type="checkbox" name="rights" required ${values.rights ? 'checked' : ''}>
            <span>I made this or have the right to share it, and it isn't a paid or leaked asset.</span>
          </label>
          ${fieldError(errors, 'rights')}
          <button class="btn btn-primary btn-lg btn-block" type="submit" data-submit>${icon('upload')}<span>Publish</span></button>
          ${progressBlock()}
          ${limits.quota ? html`<div class="storage"><p class="box-label">Your storage</p>${meter(limits.used, limits.quota)}</div>` : ''}
        </section>
      </aside>
    </form>
  </div>`;
  return layout(ctx, { title: 'Upload', body, noindex: true });
}

function editAsset(ctx, { asset: a, values, errors, limits, manageKey }) {
  const keyQs = manageKey ? `?key=${encodeURIComponent(manageKey)}` : '';
  const body = html`
  <div class="container">
    <header class="pagehead">
      <div>
        <a class="backlink" href="${a.url}${keyQs}">${icon('back')}<span>${a.title}</span></a>
        <h1>Edit</h1>
      </div>
    </header>
    <form id="upload-form" class="formgrid" method="post" action="${a.url}/edit"
      data-upload-form data-mode="edit" data-allowed="${allowedJson(ctx.catalog)}" data-kind-category="{}" data-max="${limits.maxUpload}"
      data-max-preview="${limits.maxPreview}" data-csrf="${ctx.csrf}" data-api="/api/assets/${a.slug}/edit" data-redirect="${a.url}${keyQs}" data-manage-key="${manageKey || ''}">
      ${csrfField(ctx)}
      ${manageKey ? html`<input type="hidden" name="manageKey" value="${manageKey}">` : ''}
      <div class="formgrid-main">
        <section class="panel">
          <h2 class="panel-h">${icon('edit')}Details</h2>
          ${detailFields(ctx.catalog, values, errors)}
        </section>
        <section class="panel">
          <h2 class="panel-h">${icon('image')}Thumbnail and preview</h2>
          ${mediaFields(ctx.catalog, limits, { errors, currentThumb: a.thumbUrl, thumbNote: 'Choose an image to replace the current thumbnail.' })}
          ${a.has_thumb || a.has_preview ? html`<div class="checks">
            ${a.has_thumb ? html`<label class="check"><input type="checkbox" name="removeThumb"><span>Remove current thumbnail${a.kind === 'video' ? ' (a new one is made from the video)' : ''}</span></label>` : ''}
            ${a.has_preview ? html`<label class="check"><input type="checkbox" name="removePreview"><span>Remove current preview</span></label>` : ''}
          </div>` : ''}
        </section>
        <section class="panel">
          <h2 class="panel-h">${icon('upload')}Replace file</h2>
          <p class="hint">The link stays the same. Current file: <code>${a.file_name}</code> (${a.sizeLabel})</p>
          <noscript>${notice('', 'Replacing the file needs JavaScript. You can still change the details without it.')}</noscript>
          ${dropzone(limits, errors, { compact: true })}
          ${a.has_thumb || a.has_preview ? html`<div class="checks">
            ${a.has_thumb ? html`<label class="check"><input type="checkbox" name="keepThumb"><span>Keep the current thumbnail</span></label>` : ''}
            ${a.has_preview ? html`<label class="check"><input type="checkbox" name="keepPreview"><span>Keep the current preview</span></label>` : ''}
          </div>` : ''}
        </section>
      </div>
      <aside class="formgrid-side">
        <section class="panel">
          <h2 class="panel-h">${icon('link')}Link settings</h2>
          ${linkFields(values, errors, { editing: true, asset: a })}
        </section>
        <section class="panel">
          ${licenseFields(ctx.catalog, values, errors)}
          <button class="btn btn-primary btn-lg btn-block" type="submit" data-submit>${icon('check')}<span>Save changes</span></button>
          ${progressBlock()}
          <p class="hint">A license change only applies to future downloads.</p>
        </section>
      </aside>
    </form>
  </div>`;
  return layout(ctx, { title: `Edit ${a.title}`, body, noindex: true });
}

function report(ctx, { asset: a, reasons, values, errors }) {
  const body = html`
  <div class="container narrow">
    <header class="pagehead">
      <div>
        <a class="backlink" href="${a.url}">${icon('back')}<span>${a.title}</span></a>
        <h1>Report this file</h1>
        <p class="sub">Volunteer moderators read every report. For copyright claims, also see the <a href="/copyright">takedown policy</a>.</p>
      </div>
    </header>
    <form method="post" action="${a.url}/report" class="panel stack">
      ${csrfField(ctx)}
      <fieldset class="field">
        <legend>What's wrong?</legend>
        <div class="choices">
          ${Object.entries(reasons).map(([id, label]) => html`<label class="choice is-compact"><input type="radio" name="reason" value="${id}" ${values.reason === id ? 'checked' : ''} required><span><strong>${label}</strong></span></label>`)}
        </div>
        ${fieldError(errors, 'reason')}
      </fieldset>
      <div class="field">
        <label for="details">Details</label>
        <textarea id="details" name="details" rows="5" maxlength="3000" placeholder="Links to the original work, what's broken, anything that helps"${invalid(errors, 'details')}>${values.details || ''}</textarea>
        ${fieldError(errors, 'details')}
      </div>
      <div class="field">
        <label for="contact">Your email <span class="opt">required for copyright claims</span></label>
        <input id="contact" name="contact" type="text" maxlength="200" value="${values.contact || (ctx.user && ctx.user.email) || ''}" autocomplete="email">
      </div>
      <div><button class="btn btn-primary" type="submit">${icon('flag')}<span>Send report</span></button></div>
    </form>
  </div>`;
  return layout(ctx, { title: 'Report', body, noindex: true });
}

module.exports = { asset, removed, expired, upload, editAsset, report };
