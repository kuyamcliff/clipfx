'use strict';
const { html, raw, richText, formatBytes, formatCount, formatDate } = require('../src/html');
const { layout } = require('./layout');
const { icon, hue, csrfField, assetGrid, fieldError, invalid, meter, notice, sectionHead } = require('./components');

// ---- Asset page ------------------------------------------------------------------

function player(a) {
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
  return html`<div class="player player-none"><div class="tile">${icon(a.category.icon)}<span class="tile-ext">.${a.file_ext}</span><span class="tile-note">${a.kindInfo.name}, no preview</span></div></div>`;
}

function licenseTerms(l) {
  const term = (ok, text) => html`<li class="${ok ? 'ok' : 'cond'}">${icon(ok ? 'check' : 'minus')}<span>${text}</span></li>`;
  return html`<ul class="terms">
    ${term(l.commercial, l.commercial ? 'Commercial and client work allowed' : 'Non-commercial projects only')}
    ${term(!l.attribution, l.attribution ? 'Credit the creator' : 'No credit required')}
    ${l.shareAlike ? term(false, 'Modified versions use the same license') : ''}
    ${l.noResale ? term(false, 'Don\'t resell or re-upload it as is') : ''}
  </ul>`;
}

function asset(ctx, { asset: a, more, related, saved, shareUrl, justUploaded }) {
  const { user } = ctx;
  const credit = `"${a.title}" by ${a.display_name} (${shareUrl}), licensed under ${a.license.short}`;
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

  const ogImage = a.thumbUrl ? ctx.absolute(a.thumbUrl) : null;
  const ogVideo = a.videoSrc && a.visibility === 'public' ? ctx.absolute(a.videoSrc) : null;
  const isAdmin = user && user.role === 'admin';

  const body = html`
  <div class="wrap">
    <div class="notices">
      ${a.status !== 'active' ? notice('danger', html`<strong>Removed by moderators</strong> (${a.removed_reason || 'guidelines'}). Only you${isAdmin ? ' and moderators' : ''} can see this page.`) : ''}
      ${justUploaded ? notice('accent', html`<strong>Uploaded.</strong> ${a.visibility === 'unlisted' ? 'It\'s unlisted, so only people with the link can find it.' : 'It\'s live.'} Copy the link below to share it.`) : ''}
      ${a.visibility === 'unlisted' && a.canEdit && !justUploaded ? notice('', html`<strong>Unlisted.</strong> Hidden from search and your profile. Anyone with the link can download it.`) : ''}
      ${a.processing ? notice('', 'Generating the thumbnail and preview. Refresh in a minute.') : ''}
    </div>

    <div class="assetpage" ${hue(a.category)}>
      <div class="ap-player">${player(a)}</div>

      <header class="ap-head">
        <a class="ap-cat" href="/browse?category=${a.category.id}"><span class="swatch" aria-hidden="true"></span>${a.category.name}</a>
        <h1>${a.title}</h1>
        <p class="ap-by">
          <a href="/u/${a.username}">${a.display_name}</a>
          <span class="ap-counts"><span>${formatCount(a.downloads)} downloads</span><span>${formatCount(a.views)} views</span><span><span data-save-count>${formatCount(a.favorites)}</span> saves</span></span>
        </p>
      </header>

      <aside class="ap-side">
        <section class="box">
          <a class="btn btn-accent btn-xl btn-block" href="${a.downloadUrl}" download>${icon('download')}<span>Download</span><span class="btn-meta">.${a.file_ext} · ${a.sizeLabel}</span></a>
          <div class="ap-actions">
            ${user ? html`<form method="post" action="${a.url}/save" data-save-form data-api="/api/assets/${a.slug}/save">${csrfField(ctx)}
              <button type="submit" class="btn ${saved ? 'is-on' : ''}" aria-pressed="${saved ? 'true' : 'false'}" data-save-btn>${icon('bookmark')}<span>${saved ? 'Saved' : 'Save'}</span></button></form>`
    : html`<a class="btn" href="/login?next=${encodeURIComponent(a.url)}">${icon('bookmark')}<span>Save</span></a>`}
            <button type="button" class="btn" data-share data-share-title="${a.title}" data-share-url="${shareUrl}" hidden>${icon('share')}<span>Share</span></button>
          </div>
          <div class="copyfield">
            <label for="share-url">Share link</label>
            <div class="copyfield-row">
              <input id="share-url" type="text" readonly value="${shareUrl}" data-select-on-focus>
              <button type="button" class="btn" data-copy="${shareUrl}"><span>Copy</span></button>
            </div>
          </div>
          <button type="button" class="textbtn" data-copy="${ctx.absolute(a.downloadUrl)}">${icon('link')}<span>Copy direct download link</span></button>
        </section>

        <section class="box">
          <p class="box-label">License</p>
          <p class="license-name"><a href="${a.license.url}" ${a.license.url.startsWith('http') ? raw('target="_blank" rel="noopener"') : ''}>${a.license.name}</a></p>
          ${licenseTerms(a.license)}
          ${a.license.attribution ? html`<div class="credit">
            <label for="credit">Credit line for your description</label>
            <textarea id="credit" readonly rows="3" data-select-on-focus>${credit}</textarea>
            <button type="button" class="textbtn" data-copy="${credit}">${icon('link')}<span>Copy credit</span></button>
          </div>` : ''}
        </section>

        <section class="box">
          <p class="box-label">File</p>
          <dl class="specs">${details.map(([k, v]) => html`<div><dt>${k}</dt><dd>${v}</dd></div>`)}</dl>
        </section>

        ${a.canEdit ? html`<section class="box">
          <p class="box-label">${a.isOwner ? 'Your upload' : 'Moderator tools'}</p>
          <div class="btnrow">
            <a class="btn btn-sm" href="${a.url}/edit">Edit</a>
            <form method="post" action="${a.url}/delete" data-confirm="Delete &quot;${a.title}&quot; permanently? The share link will stop working.">${csrfField(ctx)}
              <button class="btn btn-sm btn-danger" type="submit">Delete</button></form>
          </div>
          ${isAdmin && a.status === 'active' ? html`<form method="post" action="/admin/assets/${a.id}/remove" class="modform" data-confirm="Remove this asset from the site?">${csrfField(ctx)}
            <input type="text" name="reason" placeholder="Reason, shown to the uploader" aria-label="Removal reason">
            <label class="check"><input type="checkbox" name="block"><span>Block this exact file from being uploaded again</span></label>
            <button class="btn btn-sm btn-danger" type="submit">Remove from site</button></form>` : ''}
        </section>` : ''}

        <a class="report" href="${a.url}/report">${icon('flag')}<span>Report this asset</span></a>
      </aside>

      <div class="ap-body">
        ${a.description ? html`<div class="prose">${richText(a.description)}</div>` : ''}
        ${a.tags.length ? html`<div class="tags">${a.tags.map((t) => html`<a class="tag" href="/browse?tag=${encodeURIComponent(t)}">#${t}</a>`)}</div>` : ''}
      </div>
    </div>

    ${more.length ? html`<section class="section">
      ${sectionHead(`More from ${a.display_name}`, [`/u/${a.username}`, 'All uploads'])}
      ${assetGrid(more, { hideUser: true })}
    </section>` : ''}
    ${related.length ? html`<section class="section">
      ${sectionHead(`More ${a.category.name.toLowerCase()}`, [`/browse?category=${a.category.id}`, 'Browse'])}
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
    body: html`<div class="wrap">
      <div class="bigmsg">
        <p class="bigmsg-code">410</p>
        <h1>This asset was removed</h1>
        <p>"${a.title}" is no longer available${a.removed_reason ? html` (${a.removed_reason})` : ''}. If you made it and think this is a mistake, read the <a href="/copyright">takedown policy</a>.</p>
        <a class="btn" href="/browse">Browse other assets</a>
      </div>
    </div>`,
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
      <div class="tagpreview" data-tags-preview aria-hidden="true"></div>
    </div>
    <div class="field">
      <label for="description">Description <span class="opt">optional</span></label>
      <textarea id="description" name="description" rows="6" maxlength="5000" placeholder="What's in it, frame rate, codec, software version, required plugins">${values.description || ''}</textarea>
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
    </fieldset>
    <fieldset class="field">
      <legend>Visibility</legend>
      <div class="choices">
        <label class="choice"><input type="radio" name="visibility" value="public" ${values.visibility !== 'unlisted' ? 'checked' : ''}>
          <span><strong>Public</strong><span>Listed in browse, search and on your profile.</span></span></label>
        <label class="choice"><input type="radio" name="visibility" value="unlisted" ${values.visibility === 'unlisted' ? 'checked' : ''}>
          <span><strong>Unlisted</strong><span>Only people with the link can find it.</span></span></label>
      </div>
    </fieldset>`;
}

function mediaFields(catalog, limits, opts = {}) {
  return html`
    <div class="thumbpick">
      <div class="thumbframe" data-thumb-frame>
        <canvas hidden data-thumb-canvas></canvas>
        <img hidden data-thumb-img alt="Thumbnail preview" ${opts.currentThumb ? html`src="${opts.currentThumb}" data-current` : ''}>
        <span class="thumbframe-empty" data-thumb-empty ${opts.currentThumb ? 'hidden' : ''}>No thumbnail yet</span>
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
        <p class="hint" data-thumb-note>${opts.thumbNote || 'Videos get one from a frame automatically. Drag the slider to pick it.'}</p>
      </div>
    </div>
    <div class="field">
      <label for="preview">Preview clip or image <span class="opt">optional, up to ${formatBytes(limits.maxPreview)}</span></label>
      <input type="file" id="preview" name="preview" accept="${catalog.previewExts.map((e) => `.${e}`).join(',')}">
      ${fieldError(opts.errors, 'preview')}
      <p class="hint">Useful for LUTs, presets and templates, so people can see the result before downloading.</p>
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
        ${icon('upload')}
        <p class="drop-title">Drop a file here or <span class="drop-link">browse</span></p>
        <p class="drop-help" id="drop-help">Up to ${formatBytes(limits.maxUpload)}. Several files? Zip them first.</p>
      </div>
      <div class="drop-file" data-dz-file hidden>
        ${icon('file')}
        <div class="drop-file-info"><strong data-dz-name></strong><span data-dz-meta></span></div>
        <span class="btn btn-sm">Change</span>
      </div>
    </div>
    ${fieldError(errors, 'file')}`;
}

function progressBlock() {
  return html`<div class="progress" data-progress hidden aria-live="polite">
      <div class="progress-bar"><span class="progress-fill" data-progress-fill></span></div>
      <div class="progress-row"><span data-progress-text>Starting</span><button type="button" class="textbtn" data-cancel>Cancel</button></div>
    </div>
    <p class="form-error" data-form-error role="alert" hidden></p>`;
}

function upload(ctx, { values, errors, limits }) {
  if (ctx.config.uploadsEnabled === false) {
    return layout(ctx, {
      title: 'Upload', noindex: true,
      body: html`<div class="wrap narrow"><header class="pagehead"><div><h1>Upload</h1></div></header>
        ${notice('', 'Uploads aren\'t open yet while storage is being set up. Check back soon.')}</div>`,
    });
  }
  const remaining = Math.max(0, limits.quota - limits.used);
  const body = html`
  <div class="wrap">
    <header class="pagehead">
      <div><h1>Upload</h1><p class="sub">Whatever you upload is free for others to download under the license you choose.</p></div>
    </header>
    ${Object.keys(errors).length ? notice('danger', html`<strong>Check the fields below.</strong>${errors.file ? '' : ' You\'ll need to choose your file again.'}`) : ''}
    <noscript>${notice('danger', 'Uploading needs JavaScript, because files go straight from your browser to storage.')}</noscript>
    <form id="upload-form" class="formgrid" method="post" action="/upload"
      data-upload-form data-mode="create" data-allowed="${allowedJson(ctx.catalog)}" data-kind-category="${JSON.stringify(ctx.catalog.kindCategory)}"
      data-max="${limits.maxUpload}" data-max-preview="${limits.maxPreview}" data-remaining="${remaining}" data-csrf="${ctx.csrf}" data-api="/api/assets">
      ${csrfField(ctx)}
      <div class="formgrid-main">
        <section class="panel">
          <h2 class="panel-h">File</h2>
          ${dropzone(limits, errors, { required: true })}
          <p class="hint">Programs, installers, scripts and plugins (.exe, .dmg, .aex, .jsx) aren't accepted. <a href="/guidelines#formats" target="_blank">See formats</a>.</p>
        </section>
        <section class="panel">
          <h2 class="panel-h">Details</h2>
          ${detailFields(ctx.catalog, values, errors)}
        </section>
        <section class="panel">
          <h2 class="panel-h">Thumbnail and preview</h2>
          ${mediaFields(ctx.catalog, limits, { errors })}
        </section>
      </div>
      <aside class="formgrid-side">
        <section class="panel is-sticky">
          ${licenseFields(ctx.catalog, values, errors)}
          <label class="check ${errors.rights ? 'has-error' : ''}">
            <input type="checkbox" name="rights" required ${values.rights ? 'checked' : ''}>
            <span>I made this or have the right to share it, and it isn't a paid or leaked asset.</span>
          </label>
          ${fieldError(errors, 'rights')}
          <button class="btn btn-accent btn-lg btn-block" type="submit" data-submit>Publish</button>
          ${progressBlock()}
          <div class="storage"><p class="box-label">Your storage</p>${meter(limits.used, limits.quota)}</div>
        </section>
      </aside>
    </form>
  </div>`;
  return layout(ctx, { title: 'Upload', body, noindex: true });
}

function editAsset(ctx, { asset: a, values, errors, limits }) {
  const body = html`
  <div class="wrap">
    <header class="pagehead">
      <div>
        <a class="backlink" href="${a.url}">${icon('back')}<span>${a.title}</span></a>
        <h1>Edit asset</h1>
      </div>
    </header>
    <form id="upload-form" class="formgrid" method="post" action="${a.url}/edit"
      data-upload-form data-mode="edit" data-allowed="${allowedJson(ctx.catalog)}" data-kind-category="{}" data-max="${limits.maxUpload}"
      data-max-preview="${limits.maxPreview}" data-csrf="${ctx.csrf}" data-api="/api/assets/${a.slug}/edit" data-redirect="${a.url}">
      ${csrfField(ctx)}
      <div class="formgrid-main">
        <section class="panel">
          <h2 class="panel-h">Details</h2>
          ${detailFields(ctx.catalog, values, errors)}
        </section>
        <section class="panel">
          <h2 class="panel-h">Thumbnail and preview</h2>
          ${mediaFields(ctx.catalog, limits, { errors, currentThumb: a.thumbUrl, thumbNote: 'Choose an image to replace the current thumbnail.' })}
          ${a.has_thumb || a.has_preview ? html`<div class="checks">
            ${a.has_thumb ? html`<label class="check"><input type="checkbox" name="removeThumb"><span>Remove current thumbnail${a.kind === 'video' ? ' (a new one is made from the video)' : ''}</span></label>` : ''}
            ${a.has_preview ? html`<label class="check"><input type="checkbox" name="removePreview"><span>Remove current preview</span></label>` : ''}
          </div>` : ''}
        </section>
        <section class="panel">
          <h2 class="panel-h">Replace file</h2>
          <p class="hint">The page and share link stay the same. Current file: <code>${a.file_name}</code> (${a.sizeLabel})</p>
          <noscript>${notice('', 'Replacing the file needs JavaScript. You can still change the details without it.')}</noscript>
          ${dropzone(limits, errors, { compact: true })}
          ${a.has_thumb || a.has_preview ? html`<div class="checks">
            ${a.has_thumb ? html`<label class="check"><input type="checkbox" name="keepThumb"><span>Keep the current thumbnail</span></label>` : ''}
            ${a.has_preview ? html`<label class="check"><input type="checkbox" name="keepPreview"><span>Keep the current preview</span></label>` : ''}
          </div>` : ''}
        </section>
      </div>
      <aside class="formgrid-side">
        <section class="panel is-sticky">
          ${licenseFields(ctx.catalog, values, errors)}
          <button class="btn btn-accent btn-lg btn-block" type="submit" data-submit>Save changes</button>
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
  <div class="wrap narrow">
    <header class="pagehead">
      <div>
        <a class="backlink" href="${a.url}">${icon('back')}<span>${a.title}</span></a>
        <h1>Report asset</h1>
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
      <div><button class="btn btn-accent" type="submit">Send report</button></div>
    </form>
  </div>`;
  return layout(ctx, { title: 'Report asset', body, noindex: true });
}

module.exports = { asset, removed, upload, editAsset, report };
