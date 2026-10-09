/* ClipFX front-end: progressive enhancements only — every page works without JS. */
(function () {
  'use strict';

  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

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

  // ---- Navigation, flash, confirm -------------------------------------------------
  const navToggle = $('[data-nav-toggle]');
  if (navToggle) {
    navToggle.addEventListener('click', () => {
      const nav = $('#site-nav');
      const open = nav.classList.toggle('open');
      navToggle.setAttribute('aria-expanded', String(open));
    });
  }

  document.addEventListener('click', (e) => {
    const menu = $('.user-menu[open]');
    if (menu && !menu.contains(e.target)) menu.removeAttribute('open');
    const dismiss = e.target.closest('[data-dismiss]');
    if (dismiss) dismiss.closest('.flash').remove();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') { const menu = $('.user-menu[open]'); if (menu) menu.removeAttribute('open'); }
  });

  document.addEventListener('submit', (e) => {
    const form = e.target;
    if (form.dataset.confirm && !window.confirm(form.dataset.confirm)) e.preventDefault();
  });

  $$('[data-autosubmit]').forEach((form) => {
    form.addEventListener('change', () => form.requestSubmit ? form.requestSubmit() : form.submit());
  });

  // Collapse filters by default on small screens.
  const filters = $('[data-filters]');
  if (filters && window.matchMedia('(max-width: 860px)').matches) filters.removeAttribute('open');

  // ---- Copy & share ------------------------------------------------------------------
  async function copyText(text) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
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
    const ok = await copyText(btn.dataset.copy);
    const label = btn.querySelector('span');
    const original = label ? label.textContent : null;
    btn.classList.add('copied');
    if (label) label.textContent = ok ? 'Copied!' : 'Press Ctrl+C';
    setTimeout(() => {
      btn.classList.remove('copied');
      if (label) label.textContent = original;
    }, 1600);
  });

  $$('[data-select-on-focus]').forEach((el) => el.addEventListener('focus', () => el.select()));

  $$('[data-share]').forEach((btn) => {
    if (!navigator.share) return;
    btn.hidden = false;
    btn.addEventListener('click', () => {
      navigator.share({ title: btn.dataset.shareTitle, url: btn.dataset.shareUrl }).catch(() => {});
    });
  });

  // ---- Password visibility ----------------------------------------------------------
  $$('[data-toggle-password]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const input = document.getElementById(btn.dataset.togglePassword);
      const show = input.type === 'password';
      input.type = show ? 'text' : 'password';
      btn.setAttribute('aria-label', show ? 'Hide password' : 'Show password');
      btn.textContent = show ? 'hide' : 'show';
    });
  });

  // ---- Hover previews on cards ---------------------------------------------------------
  if (window.matchMedia('(hover: hover)').matches && !window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    $$('.card[data-preview]').forEach((card) => {
      let video = null;
      let timer = null;
      card.addEventListener('mouseenter', () => {
        timer = setTimeout(() => {
          const media = card.querySelector('.card-media');
          video = document.createElement('video');
          Object.assign(video, { src: card.dataset.preview, muted: true, loop: true, playsInline: true, preload: 'auto' });
          video.setAttribute('aria-hidden', 'true');
          video.style.opacity = '0';
          video.style.transition = 'opacity .2s';
          video.addEventListener('playing', () => { video.style.opacity = '1'; });
          media.appendChild(video);
          video.play().catch(() => {});
        }, 180);
      });
      card.addEventListener('mouseleave', () => {
        clearTimeout(timer);
        if (video) { video.pause(); video.removeAttribute('src'); video.load(); video.remove(); video = null; }
      });
    });
  }

  // ---- Save (favorite) without reload ------------------------------------------------
  $$('[data-save-form]').forEach((form) => {
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const btn = $('[data-save-btn]', form);
      btn.disabled = true;
      try {
        const res = await fetch(form.dataset.api, {
          method: 'POST',
          headers: { Accept: 'application/json', 'Content-Type': 'application/json', 'X-CSRF-Token': form.querySelector('[name=_csrf]').value },
          credentials: 'same-origin',
          body: '{}',
        });
        if (!res.ok) throw new Error('failed');
        const data = await res.json();
        btn.classList.toggle('is-saved', data.saved);
        btn.setAttribute('aria-pressed', String(data.saved));
        $('span', btn).textContent = data.saved ? 'Saved' : 'Save';
        const count = $('[data-save-count]');
        if (count) count.textContent = data.count;
      } catch {
        form.submit();
      } finally {
        btn.disabled = false;
      }
    });
  });

  // ---- Tag preview ------------------------------------------------------------------------
  $$('[data-tags-input]').forEach((input) => {
    const preview = input.parentElement.querySelector('[data-tags-preview]');
    const render = () => {
      const tags = [...new Set(input.value.split(/[,#\n]/).map((t) => t.trim().toLowerCase()).filter((t) => t.length >= 2))].slice(0, 15);
      preview.replaceChildren(...tags.map((t) => {
        const s = document.createElement('span');
        s.className = 'chip';
        s.textContent = `#${t}`;
        return s;
      }));
    };
    input.addEventListener('input', render);
    render();
  });

  // ---- Upload form -------------------------------------------------------------------------
  const form = $('[data-upload-form]');
  if (form) initUpload(form);

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

    function resetThumb() {
      frameBlob = null;
      canvas.hidden = true;
      if (!thumbImg.hasAttribute('data-current')) { thumbImg.hidden = true; thumbEmpty.hidden = false; } else { thumbImg.hidden = false; thumbEmpty.hidden = true; }
      framePicker.hidden = true;
      if (thumbNote) thumbNote.textContent = defaultNote;
      if (video) { video.removeAttribute('src'); video.load(); video = null; }
      if (objectUrl) { URL.revokeObjectURL(objectUrl); objectUrl = null; }
      ['width', 'height', 'duration'].forEach((k) => { if (meta(k)) meta(k).value = ''; });
    }

    function drawFrame() {
      const w = Math.min(960, video.videoWidth);
      const h = Math.round((w / video.videoWidth) * video.videoHeight);
      canvas.width = w;
      canvas.height = h;
      canvas.getContext('2d').drawImage(video, 0, 0, w, h);
      canvas.hidden = false;
      thumbEmpty.hidden = true;
      if (!thumbInput.files.length) thumbImg.hidden = true;
      canvas.toBlob((b) => { frameBlob = b; }, 'image/jpeg', 0.86);
      if (frameTime) frameTime.textContent = `Frame at ${formatTime(video.currentTime)}`;
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

    function cantDecode() {
      framePicker.hidden = true;
      if (thumbNote) thumbNote.textContent = 'Your browser can’t preview this format, so we’ll generate a thumbnail on the server (or upload your own).';
    }

    function setupImage(file) {
      if (file.size > 40 * 1024 * 1024) return;
      objectUrl = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => {
        meta('width').value = img.naturalWidth;
        meta('height').value = img.naturalHeight;
        const w = Math.min(960, img.naturalWidth);
        const h = Math.round((w / img.naturalWidth) * img.naturalHeight);
        canvas.width = w;
        canvas.height = h;
        canvas.getContext('2d').drawImage(img, 0, 0, w, h);
        canvas.hidden = false;
        thumbEmpty.hidden = true;
        thumbImg.hidden = true;
        canvas.toBlob((b) => { frameBlob = b; }, 'image/jpeg', 0.86);
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
      if (thumbNote) thumbNote.textContent = 'We’ll draw a waveform for the thumbnail automatically.';
    }

    function prettyTitle(name) {
      return name.replace(/\.[^.]+$/, '').replace(/[_\-.]+/g, ' ').replace(/\s+/g, ' ').trim()
        .replace(/\b\w/g, (c) => c.toUpperCase()).slice(0, 100);
    }

    function handleFile() {
      const file = fileInput.files[0];
      resetThumb();
      showError('');
      if (!file) {
        dzEmpty.hidden = false; dzFile.hidden = true; dropzone.classList.remove('has-file');
        return;
      }
      const ext = extOf(file.name);
      const kind = allowed[ext];
      if (!kind) {
        showError(ext ? `.${ext} files aren’t accepted. Try zipping it.` : 'That file needs an extension (e.g. .mp4).');
        fileInput.value = '';
        return handleFile();
      }
      if (file.size > maxBytes) {
        showError(`That file is ${formatBytes(file.size)} — the limit is ${formatBytes(maxBytes)}.`);
        fileInput.value = '';
        return handleFile();
      }
      if (!isEdit && file.size > remaining) {
        showError(`Not enough storage left (${formatBytes(remaining)} remaining).`);
        fileInput.value = '';
        return handleFile();
      }
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

    fileInput.addEventListener('change', handleFile);
    if (fileInput.files.length) handleFile(); // restored by browser after back navigation

    ['dragenter', 'dragover'].forEach((t) => dropzone.addEventListener(t, (e) => {
      e.preventDefault();
      dropzone.classList.add('dragover');
    }));
    ['dragleave', 'drop'].forEach((t) => dropzone.addEventListener(t, (e) => {
      e.preventDefault();
      if (t === 'dragleave' && dropzone.contains(e.relatedTarget)) return;
      dropzone.classList.remove('dragover');
    }));
    dropzone.addEventListener('drop', (e) => {
      if (!e.dataTransfer.files.length) return;
      const dt = new DataTransfer();
      dt.items.add(e.dataTransfer.files[0]);
      fileInput.files = dt.files;
      handleFile();
    });
    // Allow dropping anywhere on the page while on the upload form.
    window.addEventListener('dragover', (e) => e.preventDefault());
    window.addEventListener('drop', (e) => {
      if (dropzone.contains(e.target)) return;
      e.preventDefault();
      if (e.dataTransfer.files.length) {
        const dt = new DataTransfer();
        dt.items.add(e.dataTransfer.files[0]);
        fileInput.files = dt.files;
        handleFile();
      }
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
        else if (!canvas.width) { thumbImg.hidden = !thumbImg.hasAttribute('data-current'); thumbEmpty.hidden = !thumbImg.hidden; }
        return;
      }
      thumbImg.removeAttribute('data-current');
      thumbImg.src = URL.createObjectURL(f);
      thumbImg.hidden = false;
      canvas.hidden = true;
      thumbEmpty.hidden = true;
    });

    // ---- Sending: browser → storage directly, then tell the API ----------------------
    // 1. POST /api/uploads with file names and sizes → signed storage URLs
    // 2. PUT each file (big ones in parts, several at a time, with retries) straight to storage
    // 3. POST /api/uploads/:id/complete for multipart uploads
    // 4. POST the details + upload IDs to create (or update) the asset
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

    // One PUT with progress. Resolves with the ETag (needed to finish multipart uploads).
    function put(url, body, headers, onProgress) {
      return new Promise((resolve, reject) => {
        const x = new XMLHttpRequest();
        active.add(x);
        x.open('PUT', url);
        Object.entries(headers || {}).forEach(([k, v]) => x.setRequestHeader(k, v));
        x.upload.addEventListener('progress', (ev) => onProgress(ev.loaded));
        x.addEventListener('load', () => {
          active.delete(x);
          if (x.status >= 200 && x.status < 300) { onProgress(body.size); resolve(x.getResponseHeader('ETag')); } else reject(new Error(`Storage answered ${x.status}`));
        });
        x.addEventListener('error', () => { active.delete(x); reject(new Error('network')); });
        x.addEventListener('abort', () => { active.delete(x); reject(new Error('cancelled')); });
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
          if (!etag) throw new Error('Storage didn’t return an ETag. Check the bucket’s CORS settings (ExposeHeaders: ETag).');
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
      Object.entries(errors || {}).forEach(([field, msg]) => {
        const el = form.elements[field] || form.querySelector(`[name="${field}"]`) || (field === 'file' ? fileInput : null);
        const node = el && el.length && !el.tagName ? el[0] : el;
        if (!node) return;
        node.setAttribute('aria-invalid', 'true');
        const p = document.createElement('p');
        p.className = 'field-error';
        p.dataset.js = '1';
        p.textContent = msg;
        const anchor = node.closest('.field, .dropzone, .check, fieldset') || node;
        anchor.insertAdjacentElement('afterend', p);
      });
      if (errors && errors.file) dropzone.classList.add('has-error');
    }

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (busy) return;
      showError('');
      showFieldErrors({});
      if (!form.reportValidity()) return;
      const main = fileInput.files[0];
      if (!isEdit && !main) { showError('Choose a file to upload.'); return; }

      // What to send: the file, a thumbnail (picked frame or custom image), an optional preview.
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
      progressText.textContent = 'Preparing…';
      const total = Object.values(blobs).reduce((n, b) => n + b.size, 0);
      const sent = {};
      const started = Date.now();
      const tick = () => {
        const done = Object.values(sent).reduce((a, b) => a + b, 0);
        const pct = total ? Math.min(100, (done / total) * 100) : 100;
        const secs = (Date.now() - started) / 1000;
        const rate = done / Math.max(secs, 0.1);
        progressFill.style.width = `${pct.toFixed(1)}%`;
        progressText.textContent = pct >= 100 ? 'Finishing…'
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
        progressText.textContent = 'Saving…';
        const saved = await api(form.dataset.api, { ...details(), uploads: ids });
        busy = false;
        progressText.textContent = 'Done. Opening your asset…';
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
