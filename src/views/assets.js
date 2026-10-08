'use strict';
const { html, richText, formatBytes, formatCount, formatDate, timeAgo, formatDuration } = require('../html');
const { layout } = require('./layout');
const { icon, avatar, csrfField, assetGrid, fieldError, invalid, meter } = require('./components');
const { CATEGORIES, SOFTWARE, LICENSES, FILE_TYPES, KIND_CATEGORY, PREVIEW_EXTS } = require('../catalog');

// ---- Asset page ------------------------------------------------------------------

function player(a) {
  const poster = a.thumbUrl || '';
  if (a.videoSrc) {
    return html`<video class="player-video" controls playsinline preload="metadata" loop ${poster ? html`poster="${poster}"` : ''} src="${a.videoSrc}"></video>`;
  }
  if (a.audioSrc) {
    return html`<div class="player-audio" style="--h:${a.category.hue}">
      ${a.thumbUrl ? html`<img src="${a.thumbUrl}" alt="Waveform of ${a.title}">` : html`<div class="placeholder big">${icon('wave')}</div>`}
      <audio controls preload="metadata" src="${a.audioSrc}"></audio>
    </div>`;
  }
  if (a.imageSrc) return html`<img class="player-image" src="${a.imageSrc}" alt="${a.title}">`;
  if (a.thumbUrl) return html`<img class="player-image" src="${a.thumbUrl}" alt="${a.title}">`;
  return html`<div class="player-placeholder" style="--h:${a.category.hue}">
    ${icon(a.kindInfo.icon)}<strong>.${a.file_ext}</strong><span>${a.kindInfo.name} · ${a.sizeLabel}</span>
  </div>`;
}

function licenseBox(a) {
  const l = a.license;
  const row = (ok, text) => html`<li class="${ok ? 'yes' : 'no'}">${icon(ok ? 'check' : 'x')}${text}</li>`;
  return html`<div class="license-box">
    <div class="license-head"><span class="chip chip-license">${l.short}</span><a href="${l.url}" target="${l.url.startsWith('http') ? '_blank' : '_self'}" rel="noopener">${l.name}</a></div>
    <ul class="license-list">
      ${row(true, 'Free to download & use in your projects')}
      ${row(l.commercial, l.commercial ? 'Commercial use allowed' : 'No commercial use')}
      ${row(!l.attribution, l.attribution ? 'Credit required' : 'No credit required')}
      ${l.shareAlike ? row(false, 'Share modified assets under the same license') : ''}
      ${l.noResale ? row(false, 'Don’t resell or re-upload the asset as-is') : ''}
    </ul>
  </div>`;
}

function asset(ctx, { asset: a, more, related, saved, shareUrl, reasons }) {
  const { config, user } = ctx;
  const credit = `“${a.title}” by ${a.display_name} (${shareUrl}) — licensed under ${a.license.short}`;
  const details = [
    ['Category', html`<a href="/browse?category=${a.category.id}">${a.category.name}</a>`],
    ['Type', html`${a.kindInfo.name} <span class="muted">(.${a.file_ext})</span>`],
    a.resolution && ['Resolution', html`${a.width}×${a.height} <span class="muted">${a.resolution}${a.vertical ? ' · vertical' : ''}</span>`],
    a.durationLabel && ['Duration', a.durationLabel],
    ['File size', a.sizeLabel],
    a.software.length && ['Works with', a.software.map((s, i) => html`${i ? ', ' : ''}<a href="/browse?software=${s.id}">${s.name}</a>`)],
    ['Published', html`<time datetime="${new Date(a.created_at).toISOString()}" title="${formatDate(a.created_at)}">${timeAgo(a.created_at)}</time>`],
    a.updated_at - a.created_at > 60000 && ['Updated', formatDate(a.updated_at)],
  ].filter(Boolean);

  const ogImage = a.thumbUrl ? ctx.absolute(a.thumbUrl) : null;
  const ogVideo = a.videoSrc && a.visibility === 'public' ? ctx.absolute(a.videoSrc) : null;

  const body = html`
  <div class="container asset-page">
    ${a.status !== 'active' ? html`<div class="notice notice-danger">${icon('alert')}<div><strong>This asset was removed by moderators.</strong> Reason: ${a.removed_reason || 'guidelines violation'}. Only you${user && user.role === 'admin' ? ' (and moderators)' : ''} can see this page.</div></div>` : ''}
    ${a.visibility === 'unlisted' && a.canEdit ? html`<div class="notice">${icon('lock')}<div><strong>Unlisted.</strong> This asset doesn’t appear in search or on your profile — only people with the link can see it.</div></div>` : ''}
    ${a.processing ? html`<div class="notice">${icon('clock')}<div><strong>Generating preview…</strong> Thumbnails and web previews are being created. Refresh in a minute.</div></div>` : ''}

    <div class="asset-layout">
      <div class="asset-main">
        <div class="player" style="--h:${a.category.hue}">${player(a)}</div>

        <div class="asset-title-row">
          <div>
            <a class="eyebrow" href="/browse?category=${a.category.id}">${icon(a.category.icon)}${a.category.name}</a>
            <h1>${a.title}</h1>
          </div>
        </div>

        <div class="creator-row">
          <a class="creator" href="/u/${a.username}">${avatar(a, '')}<span><strong>${a.display_name}</strong><span class="muted">@${a.username}</span></span></a>
          <div class="asset-stats">
            <span title="Downloads">${icon('download')}${formatCount(a.downloads)}</span>
            <span title="Views">${icon('eye')}${formatCount(a.views)}</span>
            <span title="Saves">${icon('heart')}<span data-save-count>${formatCount(a.favorites)}</span></span>
          </div>
        </div>

        ${a.description ? html`<div class="prose description">${richText(a.description)}</div>` : html`<p class="muted">No description provided.</p>`}

        ${a.tags.length ? html`<div class="tags">${a.tags.map((t) => html`<a class="tag" href="/browse?tag=${encodeURIComponent(t)}">#${t}</a>`)}</div>` : ''}
      </div>

      <aside class="asset-side">
        <div class="panel download-panel">
          <a class="btn btn-primary btn-lg btn-block" href="${a.downloadUrl}" download>${icon('download')}Download <span class="btn-sub">${a.sizeLabel} · .${a.file_ext}</span></a>
          <div class="share">
            <label for="share-url" class="small muted">Share link</label>
            <div class="copy-field">
              <input id="share-url" type="text" readonly value="${shareUrl}" data-select-on-focus>
              <button type="button" class="btn btn-secondary" data-copy="${shareUrl}">${icon('copy')}<span>Copy</span></button>
            </div>
            <div class="share-actions">
              <button type="button" class="btn btn-ghost btn-sm" data-share data-share-title="${a.title}" data-share-url="${shareUrl}" hidden>${icon('share')}Share…</button>
              <button type="button" class="btn btn-ghost btn-sm" data-copy="${ctx.absolute(a.downloadUrl)}" title="Link that starts the download immediately">${icon('link')}<span>Copy direct download link</span></button>
            </div>
          </div>
          <div class="side-actions">
            ${user ? html`<form method="post" action="${a.url}/save" data-save-form>${csrfField(ctx)}
                <button type="submit" class="btn btn-secondary btn-block ${saved ? 'is-saved' : ''}" aria-pressed="${saved ? 'true' : 'false'}" data-save-btn>${icon('heart')}<span>${saved ? 'Saved' : 'Save'}</span></button></form>`
    : html`<a class="btn btn-secondary btn-block" href="/login?next=${encodeURIComponent(a.url)}">${icon('heart')}Save</a>`}
          </div>
        </div>

        <div class="panel">
          <h2 class="panel-title">License</h2>
          ${licenseBox(a)}
          ${a.license.attribution ? html`
            <div class="credit">
              <label for="credit" class="small muted">Copy this credit into your video description:</label>
              <textarea id="credit" readonly rows="3" data-select-on-focus>${credit}</textarea>
              <button type="button" class="btn btn-ghost btn-sm" data-copy="${credit}">${icon('copy')}<span>Copy credit</span></button>
            </div>` : ''}
        </div>

        <div class="panel">
          <h2 class="panel-title">Details</h2>
          <dl class="details">${details.map(([k, v]) => html`<div><dt>${k}</dt><dd>${v}</dd></div>`)}</dl>
        </div>

        ${a.canEdit ? html`<div class="panel owner-panel">
          <h2 class="panel-title">${a.isOwner ? 'Your asset' : 'Moderator tools'}</h2>
          <div class="btn-row">
            <a class="btn btn-secondary" href="${a.url}/edit">${icon('edit')}Edit</a>
            <form method="post" action="${a.url}/delete" data-confirm="Delete “${a.title}” permanently? The share link will stop working.">${csrfField(ctx)}
              <button class="btn btn-danger-ghost" type="submit">${icon('trash')}Delete</button></form>
          </div>
          ${user.role === 'admin' && a.status === 'active' ? html`<form method="post" action="/admin/assets/${a.id}/remove" class="stack-sm" data-confirm="Remove this asset from the site?">${csrfField(ctx)}
            <input type="text" name="reason" placeholder="Removal reason (shown to uploader)" aria-label="Removal reason">
            <label class="check"><input type="checkbox" name="block"> Block this exact file from being re-uploaded</label>
            <button class="btn btn-danger-ghost" type="submit">${icon('shield')}Remove from site</button></form>` : ''}
        </div>` : ''}

        <a class="report-link" href="${a.url}/report">${icon('flag')}Report this asset</a>
      </aside>
    </div>

    ${more.length ? html`<section class="section">
      <div class="section-head"><h2>More from ${a.display_name}</h2><a href="/u/${a.username}">View profile →</a></div>
      ${assetGrid(more)}
    </section>` : ''}
    ${related.length ? html`<section class="section">
      <div class="section-head"><h2>More ${a.category.name.toLowerCase()}</h2><a href="/browse?category=${a.category.id}">Browse all →</a></div>
      ${assetGrid(related)}
    </section>` : ''}
  </div>`;

  void reasons;
  return layout(ctx, {
    title: a.title,
    description: (a.description || `${a.category.name} by ${a.display_name}. Free download under ${a.license.name}.`).slice(0, 200),
    body,
    noindex: a.visibility === 'unlisted' || a.status !== 'active',
    og: { title: `${a.title} — free ${a.category.name.toLowerCase()} by ${a.display_name}`, url: ctx.absolute(a.url), image: ogImage, video: ogVideo, type: ogVideo ? 'video.other' : 'website' },
  });
}

function removed(ctx, { asset: a }) {
  return layout(ctx, {
    title: 'Asset unavailable',
    noindex: true,
    body: html`<div class="container narrow center-page">
      <div class="empty">
        <div class="empty-icon">${icon('shield')}</div>
        <h1>This asset is no longer available</h1>
        <p class="muted">“${a.title}” was removed${a.removed_reason ? html` (${a.removed_reason})` : ''}. If you’re the creator and think this is a mistake, see our <a href="/copyright">takedown policy</a>.</p>
        <a class="btn btn-primary" href="/browse">Browse other assets</a>
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
      <legend>Works with <span class="muted">(optional)</span></legend>
      <div class="chip-select">
        ${SOFTWARE.map((s) => html`<label class="chip-option"><input type="checkbox" name="software" value="${s.id}" ${sw.has(s.id) ? 'checked' : ''}><span>${s.name}</span></label>`)}
      </div>
    </fieldset>
    <div class="field">
      <label for="tags">Tags <span class="muted">(comma separated)</span></label>
      <input id="tags" name="tags" type="text" maxlength="400" value="${Array.isArray(values.tags) ? values.tags.join(', ') : values.tags || ''}" placeholder="light leak, film, warm, 4k" data-tags-input>
      <div class="tag-preview" data-tags-preview aria-hidden="true"></div>
    </div>
    <div class="field">
      <label for="description">Description <span class="muted">(optional)</span></label>
      <textarea id="description" name="description" rows="6" maxlength="5000" placeholder="What’s included, frame rate, how to use it, credits for anything you built on…">${values.description || ''}</textarea>
      <p class="hint">Links are clickable. Mention fps, codec, version requirements and plugins needed (if any).</p>
    </div>`;
}

function licenseFields(values, errors) {
  return html`
    <fieldset class="field">
      <legend>License</legend>
      <div class="radio-cards">
        ${LICENSES.map((l) => html`<label class="radio-card">
          <input type="radio" name="license" value="${l.id}" ${values.license === l.id ? 'checked' : ''} required>
          <span class="radio-card-body"><strong>${l.short}</strong><span>${l.summary}</span></span>
        </label>`)}
      </div>
      ${fieldError(errors, 'license')}
      <p class="hint"><a href="/licenses" target="_blank">How do these licenses work?</a></p>
    </fieldset>
    <fieldset class="field">
      <legend>Visibility</legend>
      <div class="radio-cards">
        <label class="radio-card"><input type="radio" name="visibility" value="public" ${values.visibility !== 'unlisted' ? 'checked' : ''}>
          <span class="radio-card-body"><strong>${icon('globe')}Public</strong><span>Listed in browse, search and your profile.</span></span></label>
        <label class="radio-card"><input type="radio" name="visibility" value="unlisted" ${values.visibility === 'unlisted' ? 'checked' : ''}>
          <span class="radio-card-body"><strong>${icon('lock')}Unlisted</strong><span>Only people with the link can see and download it.</span></span></label>
      </div>
    </fieldset>`;
}

function mediaFields(limits, opts = {}) {
  return html`
    <div class="thumb-picker">
      <div class="thumb-frame" data-thumb-frame>
        <canvas hidden data-thumb-canvas></canvas>
        <img hidden data-thumb-img alt="Thumbnail preview" ${opts.currentThumb ? html`src="${opts.currentThumb}" data-current` : ''}>
        <div class="thumb-empty" data-thumb-empty ${opts.currentThumb ? 'hidden' : ''}>${icon('image')}<span>Thumbnail preview</span></div>
      </div>
      <div class="thumb-controls">
        <div class="field" data-frame-picker hidden>
          <label for="frame">Pick a thumbnail frame</label>
          <input type="range" id="frame" min="0" max="1" step="0.01" value="0" data-frame-range>
          <p class="hint" data-frame-time></p>
        </div>
        <div class="field">
          <label for="thumbnail">Custom thumbnail <span class="muted">(optional)</span></label>
          <input type="file" id="thumbnail" name="thumbnail" accept=".png,.jpg,.jpeg,.webp,.gif">
          ${fieldError(opts.errors, 'thumbnail')}
        </div>
        <p class="hint" data-thumb-note>${opts.thumbNote || 'For videos we grab a frame automatically — scrub to choose the best one.'}</p>
      </div>
    </div>
    <div class="field">
      <label for="preview">Preview clip or image <span class="muted">(optional, up to ${formatBytes(limits.maxPreview)})</span></label>
      <input type="file" id="preview" name="preview" accept="${PREVIEW_EXTS.map((e) => `.${e}`).join(',')}">
      ${fieldError(opts.errors, 'preview')}
      <p class="hint">Perfect for LUTs, templates and presets: show a before/after or the template in action.</p>
    </div>
    <input type="hidden" name="width" data-meta="width">
    <input type="hidden" name="height" data-meta="height">
    <input type="hidden" name="duration" data-meta="duration">`;
}

const allowedJson = () => JSON.stringify(Object.fromEntries(Object.entries(FILE_TYPES).map(([k, v]) => [k, v.kind])));

function upload(ctx, { values, errors, limits }) {
  const remaining = Math.max(0, limits.quota - limits.used);
  const body = html`
  <div class="container">
    <header class="page-head">
      <h1>Share an asset</h1>
      <p class="muted">Upload footage, transitions, LUTs, templates, sounds — anything that helps other editors. It’s free for everyone, forever.</p>
    </header>
    ${Object.keys(errors).length ? html`<div class="notice notice-danger" role="alert">${icon('alert')}<div><strong>Please fix the highlighted fields.</strong>${errors.file ? '' : ' You’ll need to choose your file again.'}</div></div>` : ''}
    <form id="upload-form" class="upload-layout" method="post" action="/upload" enctype="multipart/form-data"
      data-upload-form data-mode="create" data-allowed="${allowedJson()}" data-kind-category="${JSON.stringify(KIND_CATEGORY)}"
      data-max="${limits.maxUpload}" data-remaining="${remaining}" data-csrf="${ctx.csrf}">
      ${csrfField(ctx)}
      <div class="upload-main">
        <section class="panel">
          <h2 class="panel-title"><span class="step">1</span>Your file</h2>
          <div class="dropzone ${errors.file ? 'has-error' : ''}" data-dropzone>
            <input type="file" id="file" name="file" required class="dz-input" aria-describedby="dz-help">
            <div class="dz-empty" data-dz-empty>
              <div class="dz-icon">${icon('upload')}</div>
              <p><strong>Drag &amp; drop your file here</strong></p>
              <p class="muted">or <label for="file" class="link">browse your computer</label></p>
              <p class="small muted" id="dz-help">Up to ${formatBytes(limits.maxUpload)} · Video, audio, images, LUTs, AE/Premiere/Resolve/FCP projects, MOGRTs, 3D, ZIP</p>
            </div>
            <div class="dz-file" data-dz-file hidden>
              <span class="dz-file-icon" data-dz-icon>${icon('file')}</span>
              <div class="dz-file-info"><strong data-dz-name></strong><span class="muted small" data-dz-meta></span></div>
              <label for="file" class="btn btn-ghost btn-sm">Change</label>
            </div>
          </div>
          ${fieldError(errors, 'file')}
          <p class="hint">Sharing several files? Put them in a <strong>.zip</strong> with a short README. Executables and plugins (.exe, .aex, .dmg…) aren’t allowed.</p>
        </section>

        <section class="panel">
          <h2 class="panel-title"><span class="step">2</span>Thumbnail &amp; preview</h2>
          ${mediaFields(limits, { errors })}
        </section>

        <section class="panel">
          <h2 class="panel-title"><span class="step">3</span>Details</h2>
          ${detailFields(values, errors)}
        </section>
      </div>

      <aside class="upload-side">
        <section class="panel sticky">
          ${licenseFields(values, errors)}
          <label class="check ${errors.rights ? 'has-error' : ''}">
            <input type="checkbox" name="rights" required ${values.rights ? 'checked' : ''}>
            <span>I made this, or I have the right to share it under this license. It isn’t a paid or leaked asset. (<a href="/guidelines" target="_blank">Guidelines</a>)</span>
          </label>
          ${fieldError(errors, 'rights')}
          <button class="btn btn-primary btn-lg btn-block" type="submit" data-submit>${icon('upload')}Publish</button>
          <div class="upload-progress" data-progress hidden aria-live="polite">
            <div class="progress-bar"><div class="progress-fill" data-progress-fill></div></div>
            <div class="progress-text"><span data-progress-text>Starting…</span><button type="button" class="btn btn-ghost btn-sm" data-cancel>Cancel</button></div>
          </div>
          <p class="form-error" data-form-error role="alert" hidden></p>
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
      <a class="back" href="${a.url}">← Back to asset</a>
      <h1>Edit “${a.title}”</h1>
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
          <h2 class="panel-title">Thumbnail &amp; preview</h2>
          ${mediaFields(limits, { errors, currentThumb: a.thumbUrl, thumbNote: 'Upload a new image to replace the current thumbnail.' })}
          <div class="stack-sm">
            ${a.thumb_key ? html`<label class="check"><input type="checkbox" name="remove_thumb"> Remove current thumbnail${a.kind === 'video' ? ' (a new one will be generated)' : ''}</label>` : ''}
            ${a.preview_key ? html`<label class="check"><input type="checkbox" name="remove_preview"> Remove current preview</label>` : ''}
          </div>
        </section>
        <section class="panel">
          <h2 class="panel-title">Upload a new version <span class="muted">(optional)</span></h2>
          <p class="muted small">Replace the file but keep the same page and share link. Current file: <strong>${a.file_name}</strong> (${a.sizeLabel}).</p>
          <div class="dropzone compact ${errors.file ? 'has-error' : ''}" data-dropzone>
            <input type="file" id="file" name="file" class="dz-input">
            <div class="dz-empty" data-dz-empty><p><strong>Drop a new file</strong> or <label for="file" class="link">browse</label></p></div>
            <div class="dz-file" data-dz-file hidden>
              <span class="dz-file-icon" data-dz-icon>${icon('file')}</span>
              <div class="dz-file-info"><strong data-dz-name></strong><span class="muted small" data-dz-meta></span></div>
              <label for="file" class="btn btn-ghost btn-sm">Change</label>
            </div>
          </div>
          ${fieldError(errors, 'file')}
          ${a.thumb_key || a.preview_key ? html`<div class="stack-sm">
            ${a.thumb_key ? html`<label class="check"><input type="checkbox" name="keep_thumb"> Keep the current thumbnail for the new version</label>` : ''}
            ${a.preview_key ? html`<label class="check"><input type="checkbox" name="keep_preview"> Keep the current preview for the new version</label>` : ''}
          </div>` : ''}
        </section>
      </div>
      <aside class="upload-side">
        <section class="panel sticky">
          ${licenseFields(values, errors)}
          <button class="btn btn-primary btn-lg btn-block" type="submit" data-submit>${icon('check')}Save changes</button>
          <div class="upload-progress" data-progress hidden aria-live="polite">
            <div class="progress-bar"><div class="progress-fill" data-progress-fill></div></div>
            <div class="progress-text"><span data-progress-text>Starting…</span><button type="button" class="btn btn-ghost btn-sm" data-cancel>Cancel</button></div>
          </div>
          <p class="form-error" data-form-error role="alert" hidden></p>
          <p class="hint">Changing the license only applies to future downloads.</p>
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
      <a class="back" href="${a.url}">← Back to asset</a>
      <h1>Report “${a.title}”</h1>
      <p class="muted">Reports are reviewed by volunteer moderators. For copyright claims, please read our <a href="/copyright">takedown policy</a> first.</p>
    </header>
    <form method="post" action="${a.url}/report" class="panel stack">
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
        <label for="contact">How can we reach you? <span class="muted">(required for copyright claims)</span></label>
        <input id="contact" name="contact" type="text" maxlength="200" value="${values.contact || (ctx.user && ctx.user.email) || ''}" placeholder="Email address">
      </div>
      <button class="btn btn-primary" type="submit">${icon('flag')}Send report</button>
    </form>
  </div>`;
  return layout(ctx, { title: 'Report asset', body, noindex: true });
}

void formatDuration;
module.exports = { asset, removed, upload, editAsset, report };
