'use strict';
const { html, raw, richText, formatBytes, formatCount, formatDate } = require('../html');
const { layout } = require('./layout');
const { csrfField, assetGrid, fieldError, invalid, meter } = require('./components');
const { CATEGORIES, SOFTWARE, LICENSES, FILE_TYPES, KIND_CATEGORY, PREVIEW_EXTS } = require('../catalog');

// ---- Asset page ------------------------------------------------------------------

function player(a) {
  const poster = a.thumbUrl || '';
  if (a.videoSrc) {
    return html`<video class="player-video" controls playsinline preload="metadata" loop ${poster ? html`poster="${poster}"` : ''} src="${a.videoSrc}"></video>`;
  }
  if (a.audioSrc) {
    return html`<div class="player-audio">
      ${a.thumbUrl ? html`<img src="${a.thumbUrl}" alt="Waveform of ${a.title}">` : ''}
      <audio controls preload="metadata" src="${a.audioSrc}"></audio>
    </div>`;
  }
  if (a.imageSrc) return html`<img class="player-image" src="${a.imageSrc}" alt="${a.title}">`;
  if (a.thumbUrl) return html`<img class="player-image" src="${a.thumbUrl}" alt="${a.title}">`;
  return html`<div class="placeholder big"><span class="ph-kind">${a.kindInfo.name} · ${a.sizeLabel} · no preview</span><span class="ph-ext">.${a.file_ext}</span></div>`;
}

function licenseTerms(l) {
  return html`<ul class="terms">
    <li class="${l.commercial ? 'yes' : 'no'}">${l.commercial ? 'Commercial and client work allowed' : 'Non-commercial use only'}</li>
    <li class="${l.attribution ? 'no' : 'yes'}">${l.attribution ? 'Credit the creator' : 'No credit required'}</li>
    ${l.shareAlike ? html`<li class="no">Modified versions of the asset use the same license</li>` : ''}
    ${l.noResale ? html`<li class="no">Don’t resell or re-upload it as-is</li>` : ''}
  </ul>`;
}

function asset(ctx, { asset: a, more, related, saved, shareUrl }) {
  const { user } = ctx;
  const credit = `“${a.title}” by ${a.display_name} (${shareUrl}), licensed under ${a.license.short}`;
  const details = [
    ['Format', html`<span class="mono">.${a.file_ext}</span> <span class="muted">${a.kindInfo.name.toLowerCase()}</span>`],
    a.resolution && ['Resolution', html`<span class="mono">${a.width}×${a.height}</span>${a.vertical ? html` <span class="muted">vertical</span>` : ''}`],
    a.durationLabel && ['Duration', html`<span class="mono">${a.durationLabel}</span>`],
    ['Size', html`<span class="mono">${a.sizeLabel}</span>`],
    a.software.length && ['Works with', a.software.map((s, i) => html`${i ? ', ' : ''}<a href="/browse?software=${s.id}">${s.name}</a>`)],
    ['Category', html`<a href="/browse?category=${a.category.id}">${a.category.name}</a>`],
    ['Uploaded', html`<time datetime="${new Date(a.created_at).toISOString()}">${formatDate(a.created_at)}</time>`],
    a.updated_at - a.created_at > 60000 && ['Updated', formatDate(a.updated_at)],
  ].filter(Boolean);

  const ogImage = a.thumbUrl ? ctx.absolute(a.thumbUrl) : null;
  const ogVideo = a.videoSrc && a.visibility === 'public' ? ctx.absolute(a.videoSrc) : null;

  const body = html`
  <div class="container asset-page">
    ${a.status !== 'active' ? html`<div class="notice notice-danger"><strong>Removed by moderators</strong> (${a.removed_reason || 'guidelines'}). Only you${user && user.role === 'admin' ? ' and moderators' : ''} can see this page.</div>` : ''}
    ${a.visibility === 'unlisted' && a.canEdit ? html`<div class="notice"><strong>Unlisted.</strong> Not shown in search or on your profile. Anyone with the link can download it.</div>` : ''}
    ${a.processing ? html`<div class="notice">Making the thumbnail and preview. Refresh in a minute.</div>` : ''}

    <div class="asset-layout">
      <div class="asset-main">
        <div class="player">${player(a)}</div>
        <div class="asset-head">
          <h1>${a.title}</h1>
          <div class="byline">
            <a href="/u/${a.username}">${a.display_name}</a>
            <span class="sep">/</span>
            <span class="mono">${formatCount(a.downloads)} downloads · ${formatCount(a.views)} views · <span data-save-count>${formatCount(a.favorites)}</span> saves</span>
          </div>
        </div>
        ${a.description ? html`<div class="prose description">${richText(a.description)}</div>` : ''}
        ${a.tags.length ? html`<div class="tags">${a.tags.map((t) => html`<a class="tag" href="/browse?tag=${encodeURIComponent(t)}">#${t}</a>`)}</div>` : ''}
      </div>

      <aside class="asset-side">
        <div class="side-block">
          <a class="btn btn-rec btn-lg download-btn" href="${a.downloadUrl}" download><span>Download</span><span class="btn-sub">${a.sizeLabel}</span></a>
          <div class="copy-field">
            <input id="share-url" type="text" readonly value="${shareUrl}" aria-label="Share link" data-select-on-focus>
            <button type="button" class="btn" data-copy="${shareUrl}"><span>Copy link</span></button>
          </div>
          <div class="side-links">
            <button type="button" data-copy="${ctx.absolute(a.downloadUrl)}" title="Starts the download straight away"><span>Copy direct download link</span></button>
            <button type="button" data-share data-share-title="${a.title}" data-share-url="${shareUrl}" hidden>Share…</button>
          </div>
          ${user ? html`<form method="post" action="${a.url}/save" data-save-form>${csrfField(ctx)}
              <button type="submit" class="btn btn-block ${saved ? 'is-saved' : ''}" aria-pressed="${saved ? 'true' : 'false'}" data-save-btn><span>${saved ? 'Saved' : 'Save'}</span></button></form>`
    : html`<a class="btn btn-block" href="/login?next=${encodeURIComponent(a.url)}">Save</a>`}
        </div>

        <div class="side-block">
          <span class="label">License</span>
          <span class="license-name"><a href="${a.license.url}" ${a.license.url.startsWith('http') ? raw('target="_blank" rel="noopener"') : ''}>${a.license.name}</a></span>
          ${licenseTerms(a.license)}
          ${a.license.attribution ? html`<div class="credit">
              <label for="credit" class="small muted">Copy this credit into your video description:</label>
              <textarea id="credit" readonly rows="3" data-select-on-focus>${credit}</textarea>
              <div class="side-links"><button type="button" data-copy="${credit}"><span>Copy credit</span></button></div>
            </div>` : ''}
        </div>

        <div class="side-block">
          <span class="label">File</span>
          <dl class="details">${details.map(([k, v]) => html`<div><dt>${k}</dt><dd>${v}</dd></div>`)}</dl>
        </div>

        ${a.canEdit ? html`<div class="side-block owner-tools">
          <span class="label">${a.isOwner ? 'Your upload' : 'Moderator'}</span>
          <div class="btn-row">
            <a class="btn btn-sm" href="${a.url}/edit">Edit</a>
            <form method="post" action="${a.url}/delete" data-confirm="Delete “${a.title}” permanently? The share link will stop working.">${csrfField(ctx)}
              <button class="btn btn-sm btn-danger-ghost" type="submit">Delete</button></form>
          </div>
          ${user.role === 'admin' && a.status === 'active' ? html`<form method="post" action="/admin/assets/${a.id}/remove" class="stack-sm" data-confirm="Remove this asset from the site?">${csrfField(ctx)}
            <input type="text" name="reason" placeholder="Reason (shown to the uploader)" aria-label="Removal reason">
            <label class="check small"><input type="checkbox" name="block"> Block this exact file from being uploaded again</label>
            <div><button class="btn btn-sm btn-danger-ghost" type="submit">Remove from site</button></div></form>` : ''}
        </div>` : ''}

        <a class="report-link" href="${a.url}/report">Report this asset</a>
      </aside>
    </div>

    ${more.length ? html`<section class="section">
      <div class="section-head"><h2>More from ${a.display_name}</h2><a href="/u/${a.username}">All uploads</a></div>
      ${assetGrid(more, { hideUser: true })}
    </section>` : ''}
    ${related.length ? html`<section class="section">
      <div class="section-head"><h2>Other ${a.category.name.toLowerCase()}</h2><a href="/browse?category=${a.category.id}">Browse</a></div>
      ${assetGrid(related)}
    </section>` : ''}
  </div>`;

  return layout(ctx, {
    title: a.title,
    description: (a.description || `${a.category.name} by ${a.display_name}. Free download, ${a.license.name}.`).slice(0, 200),
    body,
    noindex: a.visibility === 'unlisted' || a.status !== 'active',
    og: { title: `${a.title} by ${a.display_name}`, url: ctx.absolute(a.url), image: ogImage, video: ogVideo, type: ogVideo ? 'video.other' : 'website' },
  });
}

function removed(ctx, { asset: a }) {
  return layout(ctx, {
    title: 'Asset unavailable',
    noindex: true,
    body: html`<div class="container narrow center-page">
      <div class="empty">
        <p class="error-code">410</p>
        <h1>This asset was removed</h1>
        <p>“${a.title}” is no longer available${a.removed_reason ? html` (${a.removed_reason})` : ''}. Creators who think this is a mistake can read the <a href="/copyright">takedown policy</a>.</p>
        <a class="btn" href="/browse">Browse other assets</a>
      </div>
    </div>`,
  });
}

// ---- Upload & edit forms ------------------------------------------------------------

function detailFields(values, errors) {
  const sw = new Set(values.software || []);
  return html`
    <div class="field">
      <label for="title">Title</label>
      <input id="title" name="title" type="text" required minlength="3" maxlength="100" value="${values.title || ''}" placeholder="e.g. 12 Organic Light Leaks (4K)"${invalid(errors, 'title')}>
      ${fieldError(errors, 'title')}
    </div>
    <div class="field">
      <label for="category">Category</label>
      <select id="category" name="category" required${invalid(errors, 'category')}>
        <option value="">Choose a category…</option>
        ${CATEGORIES.map((c) => html`<option value="${c.id}" ${values.category === c.id ? 'selected' : ''}>${c.name}</option>`)}
      </select>
      ${fieldError(errors, 'category')}
    </div>
    <fieldset class="field">
      <legend>Works with</legend>
      <div class="chip-select">
        ${SOFTWARE.map((s) => html`<label class="chip-option"><input type="checkbox" name="software" value="${s.id}" ${sw.has(s.id) ? 'checked' : ''}><span>${s.name}</span></label>`)}
      </div>
    </fieldset>
    <div class="field">
      <label for="tags">Tags <span class="muted">comma separated</span></label>
      <input id="tags" name="tags" type="text" maxlength="400" value="${Array.isArray(values.tags) ? values.tags.join(', ') : values.tags || ''}" placeholder="light leak, film, warm, 4k" data-tags-input>
      <div class="tag-preview" data-tags-preview aria-hidden="true"></div>
    </div>
    <div class="field">
      <label for="description">Description</label>
      <textarea id="description" name="description" rows="6" maxlength="5000" placeholder="What’s in it, frame rate, codec, which version it needs, any plugins">${values.description || ''}</textarea>
    </div>`;
}

function licenseFields(values, errors) {
  return html`
    <fieldset class="field">
      <legend>License <a class="link-muted small" href="/licenses" target="_blank">compare</a></legend>
      <div class="option-list">
        ${LICENSES.map((l) => html`<label class="option">
          <input type="radio" name="license" value="${l.id}" ${values.license === l.id ? 'checked' : ''} required>
          <span class="option-body"><strong>${l.short}</strong><span>${l.summary}</span></span>
        </label>`)}
      </div>
      ${fieldError(errors, 'license')}
    </fieldset>
    <fieldset class="field">
      <legend>Visibility</legend>
      <div class="option-list">
        <label class="option"><input type="radio" name="visibility" value="public" ${values.visibility !== 'unlisted' ? 'checked' : ''}>
          <span class="option-body"><strong>Public</strong><span>Shown in browse, search and on your profile.</span></span></label>
        <label class="option"><input type="radio" name="visibility" value="unlisted" ${values.visibility === 'unlisted' ? 'checked' : ''}>
          <span class="option-body"><strong>Unlisted</strong><span>Only people with the link can find it.</span></span></label>
      </div>
    </fieldset>`;
}

function mediaFields(limits, opts = {}) {
  return html`
    <div class="thumb-picker">
      <div class="thumb-frame" data-thumb-frame>
        <canvas hidden data-thumb-canvas></canvas>
        <img hidden data-thumb-img alt="Thumbnail preview" ${opts.currentThumb ? html`src="${opts.currentThumb}" data-current` : ''}>
        <span class="thumb-empty" data-thumb-empty ${opts.currentThumb ? 'hidden' : ''}>no thumbnail</span>
      </div>
      <div class="thumb-controls">
        <div class="field" data-frame-picker hidden>
          <label for="frame">Thumbnail frame <span class="frame-time" data-frame-time></span></label>
          <input type="range" id="frame" min="0" max="1" step="0.01" value="0" data-frame-range>
        </div>
        <div class="field">
          <label for="thumbnail">Thumbnail image <span class="muted">optional</span></label>
          <input type="file" id="thumbnail" name="thumbnail" accept=".png,.jpg,.jpeg,.webp,.gif">
          ${fieldError(opts.errors, 'thumbnail')}
        </div>
        <p class="hint" data-thumb-note>${opts.thumbNote || 'Videos get one from a frame automatically.'}</p>
      </div>
    </div>
    <div class="field">
      <label for="preview">Preview clip or image <span class="muted">optional, up to ${formatBytes(limits.maxPreview)}</span></label>
      <input type="file" id="preview" name="preview" accept="${PREVIEW_EXTS.map((e) => `.${e}`).join(',')}">
      ${fieldError(opts.errors, 'preview')}
      <p class="hint">Worth adding for LUTs, presets and templates, so people can see the result before downloading.</p>
    </div>
    <input type="hidden" name="width" data-meta="width">
    <input type="hidden" name="height" data-meta="height">
    <input type="hidden" name="duration" data-meta="duration">`;
}

const allowedJson = () => JSON.stringify(Object.fromEntries(Object.entries(FILE_TYPES).map(([k, v]) => [k, v.kind])));

function dropzone(limits, errors, { required, compact } = {}) {
  return html`
    <div class="dropzone ${compact ? 'compact' : ''} ${errors.file ? 'has-error' : ''}" data-dropzone>
      <input type="file" id="file" name="file" ${required ? 'required' : ''} class="dz-input" aria-describedby="dz-help">
      <div class="dz-empty" data-dz-empty>
        <p>Drop a file here or <label for="file" class="link">choose one</label></p>
        <p class="small muted" id="dz-help">Up to ${formatBytes(limits.maxUpload)}. Several files? Zip them.</p>
      </div>
      <div class="dz-file" data-dz-file hidden>
        <div class="dz-file-info"><strong data-dz-name></strong><span data-dz-meta></span></div>
        <label for="file" class="btn btn-sm">Change</label>
      </div>
    </div>
    ${fieldError(errors, 'file')}`;
}

function progressBlock() {
  return html`<div class="upload-progress" data-progress hidden aria-live="polite">
      <div class="progress-bar"><div class="progress-fill" data-progress-fill></div></div>
      <div class="progress-text"><span data-progress-text>starting…</span><button type="button" class="btn btn-sm btn-ghost" data-cancel>Cancel</button></div>
    </div>
    <p class="form-error" data-form-error role="alert" hidden></p>`;
}

function upload(ctx, { values, errors, limits }) {
  const remaining = Math.max(0, limits.quota - limits.used);
  const body = html`
  <div class="container">
    <header class="page-head">
      <h1>Upload</h1>
      <p>Anything you upload is free for others to download under the license you pick.</p>
    </header>
    ${Object.keys(errors).length ? html`<div class="notice notice-danger" role="alert"><strong>Check the fields below.</strong>${errors.file ? '' : ' You’ll need to choose your file again.'}</div>` : ''}
    <form id="upload-form" class="upload-layout" method="post" action="/upload" enctype="multipart/form-data"
      data-upload-form data-mode="create" data-allowed="${allowedJson()}" data-kind-category="${JSON.stringify(KIND_CATEGORY)}"
      data-max="${limits.maxUpload}" data-remaining="${remaining}" data-csrf="${ctx.csrf}">
      ${csrfField(ctx)}
      <div class="upload-main">
        <section class="panel">
          <h2 class="panel-title"><span class="num">01</span>File</h2>
          ${dropzone(limits, errors, { required: true })}
          <p class="hint" style="margin-top:8px">Not accepted: programs, installers, scripts and plugins (.exe, .dmg, .aex, .jsx). See <a href="/guidelines#formats" target="_blank">formats</a>.</p>
        </section>
        <section class="panel">
          <h2 class="panel-title"><span class="num">02</span>Thumbnail and preview</h2>
          ${mediaFields(limits, { errors })}
        </section>
        <section class="panel">
          <h2 class="panel-title"><span class="num">03</span>Details</h2>
          ${detailFields(values, errors)}
        </section>
      </div>
      <aside class="upload-side">
        <section class="panel sticky">
          ${licenseFields(values, errors)}
          <label class="check ${errors.rights ? 'has-error' : ''}">
            <input type="checkbox" name="rights" required ${values.rights ? 'checked' : ''}>
            <span>I made this or have the right to share it, and it isn’t a paid or leaked asset.</span>
          </label>
          ${fieldError(errors, 'rights')}
          <button class="btn btn-primary btn-lg btn-block" type="submit" data-submit>Publish</button>
          ${progressBlock()}
          <div class="storage">${meter(limits.used, limits.quota)}</div>
        </section>
      </aside>
    </form>
  </div>`;
  return layout(ctx, { title: 'Upload', body, noindex: true });
}

function editAsset(ctx, { asset: a, values, errors, limits }) {
  const body = html`
  <div class="container">
    <header class="page-head">
      <a class="back" href="${a.url}">← ${a.title}</a>
      <h1>Edit</h1>
    </header>
    <form id="upload-form" class="upload-layout" method="post" action="${a.url}/edit" enctype="multipart/form-data"
      data-upload-form data-mode="edit" data-allowed="${allowedJson()}" data-kind-category="{}" data-max="${limits.maxUpload}" data-csrf="${ctx.csrf}">
      ${csrfField(ctx)}
      <div class="upload-main">
        <section class="panel">
          <h2 class="panel-title">Details</h2>
          ${detailFields(values, errors)}
        </section>
        <section class="panel">
          <h2 class="panel-title">Thumbnail and preview</h2>
          ${mediaFields(limits, { errors, currentThumb: a.thumbUrl, thumbNote: 'Choose an image to replace the current thumbnail.' })}
          <div class="stack-sm">
            ${a.thumb_key ? html`<label class="check"><input type="checkbox" name="remove_thumb"> Remove current thumbnail${a.kind === 'video' ? ' (a new one is made from the video)' : ''}</label>` : ''}
            ${a.preview_key ? html`<label class="check"><input type="checkbox" name="remove_preview"> Remove current preview</label>` : ''}
          </div>
        </section>
        <section class="panel">
          <h2 class="panel-title">Replace file</h2>
          <p class="small muted">The page and share link stay the same. Current file: <span class="mono">${a.file_name}</span> (${a.sizeLabel})</p>
          ${dropzone(limits, errors, { compact: true })}
          ${a.thumb_key || a.preview_key ? html`<div class="stack-sm">
            ${a.thumb_key ? html`<label class="check"><input type="checkbox" name="keep_thumb"> Keep the current thumbnail</label>` : ''}
            ${a.preview_key ? html`<label class="check"><input type="checkbox" name="keep_preview"> Keep the current preview</label>` : ''}
          </div>` : ''}
        </section>
      </div>
      <aside class="upload-side">
        <section class="panel sticky">
          ${licenseFields(values, errors)}
          <button class="btn btn-primary btn-lg btn-block" type="submit" data-submit>Save</button>
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
    <header class="page-head">
      <a class="back" href="${a.url}">← ${a.title}</a>
      <h1>Report</h1>
      <p class="muted">Volunteer moderators review every report. For copyright claims, see the <a href="/copyright">takedown policy</a>.</p>
    </header>
    <form method="post" action="${a.url}/report" class="stack">
      ${csrfField(ctx)}
      <fieldset class="field">
        <legend>What’s wrong?</legend>
        <div class="radio-list">
          ${Object.entries(reasons).map(([id, label]) => html`<label class="check"><input type="radio" name="reason" value="${id}" ${values.reason === id ? 'checked' : ''} required> ${label}</label>`)}
        </div>
        ${fieldError(errors, 'reason')}
      </fieldset>
      <div class="field">
        <label for="details">Details</label>
        <textarea id="details" name="details" rows="5" maxlength="3000" placeholder="Links to the original work, what’s broken, etc."${invalid(errors, 'details')}>${values.details || ''}</textarea>
        ${fieldError(errors, 'details')}
      </div>
      <div class="field">
        <label for="contact">Your email <span class="muted">required for copyright claims</span></label>
        <input id="contact" name="contact" type="text" maxlength="200" value="${values.contact || (ctx.user && ctx.user.email) || ''}" placeholder="Email address">
      </div>
      <div><button class="btn btn-primary" type="submit">Send report</button></div>
    </form>
  </div>`;
  return layout(ctx, { title: 'Report asset', body, noindex: true });
}

module.exports = { asset, removed, upload, editAsset, report };
