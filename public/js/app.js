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
        const res = await fetch(form.action, {
          method: 'POST',
          headers: { Accept: 'application/json', 'X-CSRF-Token': form.querySelector('[name=_csrf]').value },
          credentials: 'same-origin',
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
    let xhr = null;
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

    window.addEventListener('beforeunload', (e) => {
      if (xhr) { e.preventDefault(); e.returnValue = ''; }
    });

    cancelBtn.addEventListener('click', () => { if (xhr) xhr.abort(); });

    form.addEventListener('submit', (e) => {
      if (!window.FormData || !window.XMLHttpRequest) return; // fall back to normal post
      e.preventDefault();
      showError('');
      if (!form.reportValidity()) return;
      if (!isEdit && !fileInput.files.length) { showError('Choose a file to upload.'); return; }

      const data = new FormData(form);
      if (!thumbInput.files.length) {
        data.delete('thumbnail');
        if (frameBlob && (!isEdit || fileInput.files.length)) data.append('thumbnail', frameBlob, 'thumbnail.jpg');
      }
      ['file', 'preview'].forEach((n) => { const v = data.get(n); if (v && v instanceof File && !v.name) data.delete(n); });

      xhr = new XMLHttpRequest();
      xhr.open('POST', form.action);
      xhr.setRequestHeader('Accept', 'application/json');
      xhr.setRequestHeader('X-CSRF-Token', form.dataset.csrf);
      const started = Date.now();
      progress.hidden = false;
      submitBtn.disabled = true;

      xhr.upload.addEventListener('progress', (ev) => {
        if (!ev.lengthComputable) return;
        const pct = (ev.loaded / ev.total) * 100;
        const secs = (Date.now() - started) / 1000;
        const rate = ev.loaded / Math.max(secs, 0.1);
        const eta = (ev.total - ev.loaded) / Math.max(rate, 1);
        progressFill.style.width = `${pct.toFixed(1)}%`;
        progressText.textContent = pct >= 100
          ? 'Processing…'
          : `${Math.floor(pct)}% · ${formatBytes(ev.loaded)} of ${formatBytes(ev.total)} · ${formatBytes(rate)}/s${secs > 2 ? ` · ${formatTime(eta)} left` : ''}`;
      });

      const done = () => { xhr = null; submitBtn.disabled = false; progress.hidden = true; progressFill.style.width = '0'; };

      xhr.addEventListener('load', () => {
        let res = null;
        try { res = JSON.parse(xhr.responseText); } catch { res = null; }
        if (xhr.status < 300 && res && res.ok) {
          xhr = null;
          progressText.textContent = 'Done! Opening your asset…';
          window.location.href = res.url;
          return;
        }
        done();
        if (res && res.errors) {
          const messages = Object.entries(res.errors);
          messages.forEach(([field]) => {
            const el = form.querySelector(`[name="${field}"]`);
            if (el) el.setAttribute('aria-invalid', 'true');
          });
          if (res.errors.file) dropzone.classList.add('has-error');
          showError(messages.map(([, m]) => m).join(' '));
        } else {
          showError((res && res.error) || `Upload failed (${xhr.status}). Please try again.`);
        }
      });
      xhr.addEventListener('error', () => { done(); showError('Network error — check your connection and try again.'); });
      xhr.addEventListener('abort', () => { done(); showError('Upload cancelled.'); });
      xhr.send(data);
    });
  }
})();
