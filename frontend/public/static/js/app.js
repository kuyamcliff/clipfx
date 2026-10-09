/* ClipFX in the browser. Every page works without this file; it adds menus, copy buttons,
   hover previews, saving without a reload, and the direct-to-storage uploader. */
(function () {
  'use strict';

  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
  const mobile = window.matchMedia('(max-width: 879px)');

  function formatBytes(bytes) {
    const units = ['B', 'KB', 'MB', 'GB', 'TB'];
    let n = bytes;
    let i = 0;
    while (n >= 1024 && i < units.length - 1) { n /= 1024; i++; }
    return `${n >= 100 || i === 0 ? Math.round(n) : n.toFixed(1)} ${units[i]}`;
  }
  function formatTime(s) {
    if (!isFinite(s) || s < 0) return '';
    s = Math.round(s);
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const sec = String(s % 60).padStart(2, '0');
    return h ? `${h}:${String(m).padStart(2, '0')}:${sec}` : `${m}:${sec}`;
  }

  // ---- Menus, header search, flash ----------------------------------------------------

  const menus = $$('[data-menu]');
  const closeMenus = (except) => menus.forEach((m) => { if (m !== except) m.removeAttribute('open'); });
  menus.forEach((m) => m.addEventListener('toggle', () => { if (m.open) closeMenus(m); }));

  const topSearch = $('[data-topsearch]');
  const searchToggle = $('[data-search-toggle]');
  if (topSearch && searchToggle) {
    searchToggle.setAttribute('role', 'button');
    searchToggle.setAttribute('aria-expanded', 'false');
    searchToggle.addEventListener('click', (e) => {
      e.preventDefault();
      const open = topSearch.classList.toggle('is-open');
      searchToggle.setAttribute('aria-expanded', String(open));
      if (open) { closeMenus(); $('input', topSearch).focus(); }
    });
  }
  const closeSearch = () => {
    if (topSearch && topSearch.classList.contains('is-open')) {
      topSearch.classList.remove('is-open');
      searchToggle.setAttribute('aria-expanded', 'false');
    }
  };

  document.addEventListener('click', (e) => {
    if (!e.target.closest('[data-menu]')) closeMenus();
    if (!e.target.closest('[data-topsearch], [data-search-toggle]')) closeSearch();
    const dismiss = e.target.closest('[data-dismiss]');
    if (dismiss) dismiss.closest('.flash').remove();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    const open = menus.find((m) => m.open);
    if (open) { open.removeAttribute('open'); $('summary', open).focus(); }
    closeSearch();
  });
  mobile.addEventListener('change', () => { closeMenus(); closeSearch(); });

  // ---- Forms: confirmations and auto-submitting filters ----------------------------------

  document.addEventListener('submit', (e) => {
    const f = e.target;
    if (f.dataset.confirm && !window.confirm(f.dataset.confirm)) e.preventDefault();
  });

  $$('[data-autosubmit]').forEach((f) => {
    f.addEventListener('change', () => (f.requestSubmit ? f.requestSubmit() : f.submit()));
  });

  const filterToggle = $('[data-filter-toggle]');
  if (filterToggle) {
    const panel = document.getElementById(filterToggle.getAttribute('aria-controls'));
    filterToggle.addEventListener('click', () => {
      const open = panel.classList.toggle('is-open');
      filterToggle.setAttribute('aria-expanded', String(open));
    });
  }

  // ---- Copy & share -------------------------------------------------------------------

  async function copyText(text) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.setAttribute('readonly', '');
      ta.style.cssText = 'position:fixed;top:0;left:0;opacity:0';
      document.body.appendChild(ta);
      ta.select();
      let ok = false;
      try { ok = document.execCommand('copy'); } catch { ok = false; }
      ta.remove();
      return ok;
    }
  }

  document.addEventListener('click', async (e) => {
    const btn = e.target.closest('[data-copy]');
    if (!btn) return;
    const label = $('span', btn);
    if (label && !btn.dataset.label) btn.dataset.label = label.textContent;
    const ok = await copyText(btn.dataset.copy);
    btn.classList.add('is-copied');
    if (label) label.textContent = ok ? 'Copied' : 'Copy failed';
    clearTimeout(btn.copyTimer);
    btn.copyTimer = setTimeout(() => {
      btn.classList.remove('is-copied');
      if (label) label.textContent = btn.dataset.label;
    }, 1600);
  });

  $$('[data-select-on-focus]').forEach((el) => el.addEventListener('focus', () => el.select()));

  if (navigator.share) {
    $$('[data-share]').forEach((btn) => {
      btn.hidden = false;
      btn.addEventListener('click', () => {
        navigator.share({ title: btn.dataset.shareTitle, url: btn.dataset.shareUrl }).catch(() => {});
      });
    });
  }

  // ---- Password visibility -------------------------------------------------------------

  $$('[data-toggle-password]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const input = document.getElementById(btn.dataset.togglePassword);
      const show = input.type === 'password';
      input.type = show ? 'text' : 'password';
      btn.setAttribute('aria-label', show ? 'Hide password' : 'Show password');
      btn.setAttribute('aria-pressed', String(show));
    });
  });

  // ---- Video previews when hovering a card ----------------------------------------------

  if (window.matchMedia('(hover: hover) and (pointer: fine)').matches && !window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    $$('.card[data-preview]').forEach((card) => {
      let video = null;
      let timer = null;
      card.addEventListener('mouseenter', () => {
        timer = setTimeout(() => {
          video = document.createElement('video');
          Object.assign(video, { src: card.dataset.preview, muted: true, loop: true, playsInline: true, preload: 'auto' });
          video.setAttribute('aria-hidden', 'true');
          video.style.opacity = '0';
          video.style.transition = 'opacity .2s';
          video.addEventListener('playing', () => { video.style.opacity = '1'; });
          $('.card-media', card).appendChild(video);
          video.play().catch(() => {});
        }, 160);
      });
      card.addEventListener('mouseleave', () => {
        clearTimeout(timer);
        if (video) { video.pause(); video.removeAttribute('src'); video.load(); video.remove(); video = null; }
      });
    });
  }

  // ---- Save without a reload -------------------------------------------------------------

  $$('[data-save-form]').forEach((f) => {
    f.addEventListener('submit', async (e) => {
      e.preventDefault();
      const btn = $('[data-save-btn]', f);
      btn.disabled = true;
      try {
        const res = await fetch(f.dataset.api, {
          method: 'POST',
          headers: { Accept: 'application/json', 'Content-Type': 'application/json', 'X-CSRF-Token': f.elements._csrf.value },
          credentials: 'same-origin',
          body: '{}',
        });
        if (!res.ok) throw new Error('failed');
        const data = await res.json();
        btn.classList.toggle('is-on', data.saved);
        btn.setAttribute('aria-pressed', String(data.saved));
        $('span', btn).textContent = data.saved ? 'Saved' : 'Save';
        const count = $('[data-save-count]');
        if (count) count.textContent = data.count;
      } catch {
        f.submit();
      } finally {
        btn.disabled = false;
      }
    });
  });

  // ---- Tag preview ---------------------------------------------------------------------------

  $$('[data-tags-input]').forEach((input) => {
    const preview = $('[data-tags-preview]', input.parentElement);
    const render = () => {
      const tags = [...new Set(input.value.split(/[,#\n]/).map((t) => t.trim().toLowerCase()).filter((t) => t.length >= 2))].slice(0, 15);
      preview.replaceChildren(...tags.map((t) => {
        const s = document.createElement('span');
        s.className = 'tagchip';
        s.textContent = `#${t}`;
        return s;
      }));
    };
    input.addEventListener('input', render);
    render();
  });

  // ---- Upload and edit form ----------------------------------------------------------------

  const uploadForm = $('[data-upload-form]');
  if (uploadForm) initUpload(uploadForm);

  function initUpload(form) {
    const allowed = JSON.parse(form.dataset.allowed || '{}');
    const kindCategory = JSON.parse(form.dataset.kindCategory || '{}');
    const maxBytes = Number(form.dataset.max) || Infinity;
    const remaining = form.dataset.remaining ? Number(form.dataset.remaining) : Infinity;
    const isEdit = form.dataset.mode === 'edit';

    const fileInput = $('#file', form);
    const dropzone = $('[data-dropzone]', form);
    const dzEmpty = $('[data-dz-empty]', form);
    const dzFile = $('[data-dz-file]', form);
    const thumbInput = $('#thumbnail', form);
    const previewInput = $('#preview', form);
    const canvas = $('[data-thumb-canvas]', form);
    const thumbImg = $('[data-thumb-img]', form);
    const thumbEmpty = $('[data-thumb-empty]', form);
    const framePicker = $('[data-frame-picker]', form);
    const frameRange = $('[data-frame-range]', form);
    const frameTime = $('[data-frame-time]', form);
    const thumbNote = $('[data-thumb-note]', form);
    const titleInput = $('#title', form);
    const categorySelect = $('#category', form);
    const submitBtn = $('[data-submit]', form);
    const progress = $('[data-progress]', form);
    const progressFill = $('[data-progress-fill]', form);
    const progressText = $('[data-progress-text]', form);
    const cancelBtn = $('[data-cancel]', form);
    const formError = $('[data-form-error]', form);
    const meta = (name) => $(`[data-meta="${name}"]`, form);

    let frameBlob = null;
    let objectUrl = null;
    let video = null;
    const defaultNote = thumbNote ? thumbNote.textContent : '';

    const extOf = (name) => { const m = /\.([a-z0-9]{1,10})$/i.exec(name || ''); return m ? m[1].toLowerCase() : ''; };

    function showError(msg) {
      formError.textContent = msg;
      formError.hidden = !msg;
    }

    function showThumb(which) {
      canvas.hidden = which !== 'canvas';
      thumbImg.hidden = which !== 'img';
      thumbEmpty.hidden = which !== 'empty';
    }

    function resetThumb() {
      frameBlob = null;
      showThumb(thumbImg.hasAttribute('data-current') ? 'img' : 'empty');
      framePicker.hidden = true;
      if (thumbNote) thumbNote.textContent = defaultNote;
      if (video) { video.removeAttribute('src'); video.load(); video = null; }
      if (objectUrl) { URL.revokeObjectURL(objectUrl); objectUrl = null; }
      ['width', 'height', 'duration'].forEach((k) => { meta(k).value = ''; });
    }

    function drawToCanvas(source, sw, sh) {
      const w = Math.min(960, sw);
      const h = Math.round((w / sw) * sh);
      canvas.width = w;
      canvas.height = h;
      canvas.getContext('2d').drawImage(source, 0, 0, w, h);
      if (!thumbInput.files.length) showThumb('canvas');
      canvas.toBlob((b) => { frameBlob = b; }, 'image/jpeg', 0.86);
    }

    function drawFrame() {
      drawToCanvas(video, video.videoWidth, video.videoHeight);
      if (frameTime) frameTime.textContent = `at ${formatTime(video.currentTime)}`;
    }

    function cantDecode() {
      framePicker.hidden = true;
      if (thumbNote) thumbNote.textContent = 'Your browser can\'t play this format, so the thumbnail will be made on the server. You can also upload your own.';
    }

    function setupVideo(file) {
      objectUrl = URL.createObjectURL(file);
      video = document.createElement('video');
      video.muted = true;
      video.playsInline = true;
      video.preload = 'auto';
      video.addEventListener('loadedmetadata', () => {
        meta('width').value = video.videoWidth || '';
        meta('height').value = video.videoHeight || '';
        meta('duration').value = isFinite(video.duration) ? video.duration.toFixed(2) : '';
        if (!video.videoWidth) { cantDecode(); return; }
        frameRange.max = isFinite(video.duration) ? video.duration : 0;
        const start = Math.min(1, (video.duration || 0) / 4);
        frameRange.value = start;
        framePicker.hidden = !(video.duration > 0.2);
        video.currentTime = start;
      });
      video.addEventListener('seeked', () => { if (!thumbInput.files.length) drawFrame(); });
      video.addEventListener('error', cantDecode);
      video.src = objectUrl;
    }

    function setupImage(file) {
      if (file.size > 40 * 1024 * 1024) return;
      objectUrl = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => {
        meta('width').value = img.naturalWidth;
        meta('height').value = img.naturalHeight;
        drawToCanvas(img, img.naturalWidth, img.naturalHeight);
      };
      img.src = objectUrl;
    }

    function setupAudio(file) {
      objectUrl = URL.createObjectURL(file);
      const audio = document.createElement('audio');
      audio.preload = 'metadata';
      audio.addEventListener('loadedmetadata', () => {
        if (isFinite(audio.duration)) meta('duration').value = audio.duration.toFixed(2);
      });
      audio.src = objectUrl;
      if (thumbNote) thumbNote.textContent = 'A waveform will be drawn for the thumbnail automatically.';
    }

    const prettyTitle = (name) => name.replace(/\.[^.]+$/, '').replace(/[_\-.]+/g, ' ').replace(/\s+/g, ' ').trim()
      .replace(/\b\w/g, (c) => c.toUpperCase()).slice(0, 100);

    function reject(msg) {
      showError(msg);
      fileInput.value = '';
      handleFile();
      showError(msg);
    }

    function handleFile() {
      const file = fileInput.files[0];
      resetThumb();
      showError('');
      if (!file) {
        dzEmpty.hidden = false;
        dzFile.hidden = true;
        dropzone.classList.remove('has-file');
        return;
      }
      const ext = extOf(file.name);
      const kind = allowed[ext];
      if (!kind) return reject(ext ? `.${ext} files aren't accepted. Try zipping it.` : 'That file needs an extension, like .mp4.');
      if (file.size > maxBytes) return reject(`That file is ${formatBytes(file.size)}. The limit is ${formatBytes(maxBytes)}.`);
      if (!isEdit && file.size > remaining) return reject(`Not enough storage left. You have ${formatBytes(remaining)} remaining.`);

      dzEmpty.hidden = true;
      dzFile.hidden = false;
      dropzone.classList.add('has-file');
      dropzone.classList.remove('has-error');
      $('[data-dz-name]', form).textContent = file.name;
      $('[data-dz-meta]', form).textContent = `${formatBytes(file.size)} · ${kind}`;

      if (!isEdit) {
        if (titleInput && !titleInput.value) titleInput.value = prettyTitle(file.name);
        if (categorySelect && !categorySelect.value && kindCategory[kind]) categorySelect.value = kindCategory[kind];
      }
      if (kind === 'video') setupVideo(file);
      else if (kind === 'image') setupImage(file);
      else if (kind === 'audio') setupAudio(file);
      return undefined;
    }

    function takeDropped(files) {
      if (!files.length) return;
      const dt = new DataTransfer();
      dt.items.add(files[0]);
      fileInput.files = dt.files;
      handleFile();
    }

    fileInput.addEventListener('change', handleFile);
    if (fileInput.files.length) handleFile(); // restored by the browser after back navigation

    ['dragenter', 'dragover'].forEach((t) => dropzone.addEventListener(t, (e) => {
      e.preventDefault();
      dropzone.classList.add('is-over');
    }));
    ['dragleave', 'drop'].forEach((t) => dropzone.addEventListener(t, (e) => {
      e.preventDefault();
      if (t === 'dragleave' && dropzone.contains(e.relatedTarget)) return;
      dropzone.classList.remove('is-over');
    }));
    dropzone.addEventListener('drop', (e) => takeDropped(e.dataTransfer.files));
    // Dropping anywhere on the page counts too.
    window.addEventListener('dragover', (e) => e.preventDefault());
    window.addEventListener('drop', (e) => {
      if (dropzone.contains(e.target)) return;
      e.preventDefault();
      takeDropped(e.dataTransfer.files);
    });

    if (frameRange) {
      let pending = false;
      frameRange.addEventListener('input', () => {
        if (!video || pending) return;
        pending = true;
        video.currentTime = Number(frameRange.value);
        video.addEventListener('seeked', () => { pending = false; }, { once: true });
      });
    }

    thumbInput.addEventListener('change', () => {
      const f = thumbInput.files[0];
      if (!f) {
        if (video && video.videoWidth) drawFrame();
        else if (!canvas.width) showThumb(thumbImg.hasAttribute('data-current') ? 'img' : 'empty');
        else showThumb('canvas');
        return;
      }
      thumbImg.removeAttribute('data-current');
      thumbImg.src = URL.createObjectURL(f);
      showThumb('img');
    });

    // ---- Sending: browser to storage directly, then tell the API ----------------------
    // 1. POST /api/uploads with file names and sizes, get signed storage URLs back
    // 2. PUT each file straight to storage (big ones in parts, several at a time, with retries)
    // 3. POST /api/uploads/:id/complete for multipart uploads
    // 4. POST the details and upload IDs to create (or update) the asset
    const active = new Set();
    let busy = false;
    let cancelled = false;
    const tickets = [];

    window.addEventListener('beforeunload', (e) => {
      if (busy) { e.preventDefault(); e.returnValue = ''; }
    });

    async function api(path, body) {
      const res = await fetch(path, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json', 'X-CSRF-Token': form.dataset.csrf },
        credentials: 'same-origin',
        body: JSON.stringify(body || {}),
      });
      let data = null;
      try { data = await res.json(); } catch { data = null; }
      if (!res.ok || !data || !data.ok) {
        const err = new Error((data && data.error) || `Request failed (${res.status}).`);
        err.errors = data && data.errors;
        throw err;
      }
      return data;
    }

    cancelBtn.addEventListener('click', () => {
      cancelled = true;
      active.forEach((x) => x.abort());
      tickets.forEach((t) => api(`/api/uploads/${t.id}/abort`).catch(() => {}));
    });

    // One PUT with progress. Resolves with the ETag, which finishing a multipart upload needs.
    function put(url, body, headers, onProgress) {
      return new Promise((resolve, rejectPut) => {
        const x = new XMLHttpRequest();
        active.add(x);
        x.open('PUT', url);
        Object.entries(headers || {}).forEach(([k, v]) => x.setRequestHeader(k, v));
        x.upload.addEventListener('progress', (ev) => onProgress(ev.loaded));
        x.addEventListener('load', () => {
          active.delete(x);
          if (x.status >= 200 && x.status < 300) { onProgress(body.size); resolve(x.getResponseHeader('ETag')); } else rejectPut(new Error(`Storage answered ${x.status}`));
        });
        x.addEventListener('error', () => { active.delete(x); rejectPut(new Error('network')); });
        x.addEventListener('abort', () => { active.delete(x); rejectPut(new Error('cancelled')); });
        x.send(body);
      });
    }

    async function withRetry(fn, onRetry) {
      for (let attempt = 1; ; attempt++) {
        try {
          return await fn();
        } catch (err) {
          if (cancelled || attempt >= 4) throw err;
          onRetry();
          await new Promise((r) => setTimeout(r, 1000 * 2 ** attempt));
        }
      }
    }

    async function send(ticket, blob, onProgress) {
      if (ticket.method === 'put') {
        await withRetry(() => put(ticket.url, blob, ticket.headers, onProgress), () => onProgress(0));
        return;
      }
      const loaded = new Array(ticket.parts.length).fill(0);
      const report = () => onProgress(loaded.reduce((a, b) => a + b, 0));
      const etags = [];
      const queue = ticket.parts.slice();
      const worker = async () => {
        while (queue.length && !cancelled) {
          const part = queue.shift();
          const start = (part.number - 1) * ticket.partSize;
          const chunk = blob.slice(start, start + part.size);
          const i = part.number - 1;
          const etag = await withRetry(
            () => put(part.url, chunk, null, (n) => { loaded[i] = n; report(); }),
            () => { loaded[i] = 0; report(); },
          );
          if (!etag) throw new Error('Storage didn\'t return an ETag. Check the bucket\'s CORS settings (ExposeHeaders: ETag).');
          etags.push({ number: part.number, etag });
        }
      };
      await Promise.all(Array.from({ length: Math.min(4, ticket.parts.length) }, worker));
      if (cancelled) throw new Error('cancelled');
      await api(`/api/uploads/${ticket.id}/complete`, { parts: etags });
    }

    function details() {
      const val = (name) => { const el = form.elements[name]; return el ? el.value : ''; };
      const on = (name) => !!(form.elements[name] && form.elements[name].checked);
      return {
        title: val('title'), category: val('category'), tags: val('tags'), description: val('description'),
        license: (form.querySelector('[name=license]:checked') || {}).value || '',
        visibility: (form.querySelector('[name=visibility]:checked') || {}).value || 'public',
        software: $$('[name=software]:checked', form).map((el) => el.value),
        rights: on('rights'), removeThumb: on('removeThumb'), removePreview: on('removePreview'),
        keepThumb: on('keepThumb'), keepPreview: on('keepPreview'),
        width: Number(meta('width').value) || undefined,
        height: Number(meta('height').value) || undefined,
        duration: Number(meta('duration').value) || undefined,
      };
    }

    function showFieldErrors(errors) {
      $$('[aria-invalid=true]', form).forEach((el) => el.removeAttribute('aria-invalid'));
      $$('.field-error[data-js]', form).forEach((el) => el.remove());
      let first = null;
      Object.entries(errors || {}).forEach(([field, msg]) => {
        const el = form.elements[field] || (field === 'file' ? fileInput : null);
        const node = el && el.length && !el.tagName ? el[0] : el;
        if (!node) return;
        node.setAttribute('aria-invalid', 'true');
        const p = document.createElement('p');
        p.className = 'field-error';
        p.dataset.js = '1';
        p.textContent = msg;
        const anchor = node.closest('.drop, .field, .check, fieldset') || node;
        anchor.insertAdjacentElement('afterend', p);
        if (!first) first = anchor;
      });
      if (errors && errors.file) dropzone.classList.add('has-error');
      if (first) first.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (busy) return;
      showError('');
      showFieldErrors({});
      if (!form.reportValidity()) return;
      const main = fileInput.files[0];
      if (!isEdit && !main) { showError('Choose a file to upload.'); return; }

      // What to send: the file, a thumbnail (picked frame or custom image) and an optional preview.
      const blobs = {};
      if (main) blobs.file = main;
      if (thumbInput.files[0]) blobs.thumbnail = thumbInput.files[0];
      else if (frameBlob && (!isEdit || main)) blobs.thumbnail = new File([frameBlob], 'thumbnail.jpg', { type: 'image/jpeg' });
      if (previewInput && previewInput.files[0]) blobs.preview = previewInput.files[0];

      busy = true;
      cancelled = false;
      tickets.length = 0;
      submitBtn.disabled = true;
      progress.hidden = false;
      progressFill.style.width = '0';
      progressText.textContent = 'Preparing';
      const total = Object.values(blobs).reduce((n, b) => n + b.size, 0);
      const sent = {};
      const started = Date.now();
      const tick = () => {
        const done = Object.values(sent).reduce((a, b) => a + b, 0);
        const pct = total ? Math.min(100, (done / total) * 100) : 100;
        const secs = (Date.now() - started) / 1000;
        const rate = done / Math.max(secs, 0.1);
        progressFill.style.width = `${pct.toFixed(1)}%`;
        progressText.textContent = pct >= 100 ? 'Finishing'
          : `${Math.floor(pct)}% · ${formatBytes(done)} of ${formatBytes(total)} · ${formatBytes(rate)}/s${secs > 2 ? ` · ${formatTime((total - done) / Math.max(rate, 1))} left` : ''}`;
      };

      try {
        const ids = {};
        const fields = Object.keys(blobs);
        if (fields.length) {
          const res = await api('/api/uploads', { files: fields.map((field) => ({ field, name: blobs[field].name, size: blobs[field].size })) });
          tickets.push(...res.uploads);
          await Promise.all(res.uploads.map((t) => send(t, blobs[t.field], (n) => { sent[t.field] = n; tick(); })));
          res.uploads.forEach((t) => { ids[t.field] = t.id; });
        }
        progressText.textContent = 'Saving';
        const saved = await api(form.dataset.api, { ...details(), uploads: ids });
        busy = false;
        progressFill.style.width = '100%';
        progressText.textContent = 'Done. Opening your asset';
        window.location.href = isEdit ? (saved.url || form.dataset.redirect) : `${saved.url}?uploaded=1`;
      } catch (err) {
        busy = false;
        submitBtn.disabled = false;
        progress.hidden = true;
        if (cancelled || err.message === 'cancelled') { showError('Upload cancelled.'); return; }
        if (err.errors) showFieldErrors(err.errors);
        showError(err.message === 'network' ? 'Network error. Check your connection and try again.' : err.message);
      }
    });
  }
})();
