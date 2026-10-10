/* ClipFX in the browser. Every page works without this file; it adds the search palette, theme
   switching, motion, loading states, toasts, copy and share, live countdowns, profile photos and
   the direct-to-storage uploader. */
(function () {
  'use strict';

  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
  const root = document.documentElement;
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  root.classList.add('js');

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

  // ---- Toasts ---------------------------------------------------------------------------

  const toastBox = $('[data-toasts]');
  const ICON_OK = '<svg class="i" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m5 12.5 4.5 4.5L19 7.5"/></svg>';
  const ICON_ERR = '<svg class="i" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 4 2.8 19.5h18.4z"/><path d="M12 10v4M12 17h.01"/></svg>';
  function dismissToast(el) {
    if (!el || el.classList.contains('is-leaving')) return;
    el.classList.add('is-leaving');
    setTimeout(() => el.remove(), 260);
  }
  function toast(message, type = 'ok') {
    if (!toastBox || !message) return;
    const el = document.createElement('div');
    el.className = `toast ${type === 'error' ? 'toast-error' : 'toast-ok'}`;
    el.setAttribute('role', 'status');
    el.innerHTML = `${type === 'error' ? ICON_ERR : ICON_OK}<span></span>`;
    el.querySelector('span').textContent = message;
    toastBox.appendChild(el);
    while (toastBox.children.length > 3) toastBox.firstElementChild.remove();
    setTimeout(() => dismissToast(el), 3200);
  }
  // Messages rendered by the server (after a form post) fade away on their own.
  $$('[data-toast]').forEach((el) => setTimeout(() => dismissToast(el), 5000));
  document.addEventListener('click', (e) => {
    const x = e.target.closest('[data-dismiss]');
    if (x) dismissToast(x.closest('.toast'));
  });

  // ---- Theme ------------------------------------------------------------------------------

  function currentTheme() {
    const set = root.getAttribute('data-theme');
    if (set) return set;
    return window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
  }
  $$('[data-theme-toggle]').forEach((btn) => btn.addEventListener('click', () => {
    const next = currentTheme() === 'dark' ? 'light' : 'dark';
    root.setAttribute('data-theme', next);
    document.cookie = `theme=${next}; path=/; max-age=31536000; samesite=lax`;
    const meta = $$('meta[name="theme-color"]');
    meta.forEach((m) => m.setAttribute('content', next === 'dark' ? '#07080d' : '#f5f7fb'));
  }));

  // ---- Header, menus, page progress -------------------------------------------------------

  const header = $('[data-header]');
  if (header) {
    const onScroll = () => header.classList.toggle('is-scrolled', window.scrollY > 4);
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
  }

  const menus = $$('[data-menu]');
  const closeMenus = (except) => menus.forEach((m) => { if (m !== except) m.removeAttribute('open'); });
  menus.forEach((m) => m.addEventListener('toggle', () => { if (m.open) closeMenus(m); }));
  document.addEventListener('click', (e) => { if (!e.target.closest('[data-menu]')) closeMenus(); });

  // A thin bar across the top while the next page loads.
  const bar = $('[data-progress-bar]');
  function startProgress() {
    if (!bar) return;
    bar.classList.remove('is-done');
    void bar.offsetWidth;
    bar.classList.add('is-active');
  }
  function endProgress() {
    if (!bar || !bar.classList.contains('is-active')) return;
    bar.classList.remove('is-active');
    bar.classList.add('is-done');
  }
  window.addEventListener('pageshow', () => {
    endProgress();
    $$('.is-loading').forEach((b) => { b.classList.remove('is-loading'); b.disabled = false; });
  });
  document.addEventListener('click', (e) => {
    const a = e.target.closest('a[href]');
    if (!a || e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    if (a.target === '_blank' || a.hasAttribute('download') || a.hasAttribute('data-palette-open')) return;
    const url = new URL(a.href, location.href);
    if (url.origin !== location.origin || (url.pathname === location.pathname && url.search === location.search)) return;
    if (/\/download$/.test(url.pathname)) return;
    startProgress();
    if (a.hasAttribute('data-loading') && a.classList.contains('btn')) a.classList.add('is-loading');
  });

  // ---- Search palette -------------------------------------------------------------------------

  const palette = $('[data-palette]');
  function openPalette() {
    if (!palette || typeof palette.showModal !== 'function') return false;
    closeMenus();
    if (!palette.open) palette.showModal();
    const input = $('input', palette);
    input.focus();
    input.select();
    return true;
  }
  $$('[data-palette-open]').forEach((el) => el.addEventListener('click', (e) => { if (openPalette()) e.preventDefault(); }));
  if (palette) {
    $('[data-palette-close]', palette).addEventListener('click', () => palette.close());
    palette.addEventListener('click', (e) => { if (e.target === palette) palette.close(); });
  }
  document.addEventListener('keydown', (e) => {
    const typing = /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement.tagName) || document.activeElement.isContentEditable;
    if ((e.key === '/' && !typing) || (e.key.toLowerCase() === 'k' && (e.metaKey || e.ctrlKey))) {
      if (openPalette()) e.preventDefault();
    }
    if (e.key === 'Escape') {
      const open = menus.find((m) => m.open);
      if (open) { open.removeAttribute('open'); $('summary', open).focus(); }
    }
  });

  // ---- Forms: confirmations, loading states, auto-submitting filters ----------------------------

  document.addEventListener('submit', (e) => {
    const f = e.target;
    if (f.dataset.confirm && !window.confirm(f.dataset.confirm)) { e.preventDefault(); return; }
    if (e.defaultPrevented || f.hasAttribute('data-upload-form') || f.hasAttribute('data-save-form')) return;
    const btn = e.submitter || $('[type="submit"]', f);
    if (btn && btn.classList.contains('btn')) {
      btn.classList.add('is-loading');
      // Disabled after the event so the browser still sends the button's value.
      setTimeout(() => { btn.disabled = true; }, 0);
    }
    if ((f.method || 'get').toLowerCase() === 'get' || !f.target) startProgress();
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

  // ---- Motion: reveal on scroll, image fade-in, count-up --------------------------------------------

  const reveal = $$('[data-reveal]');
  if ('IntersectionObserver' in window && !reduceMotion) {
    const io = new IntersectionObserver((entries) => {
      entries.forEach((en) => {
        if (!en.isIntersecting) return;
        en.target.classList.add('is-in');
        io.unobserve(en.target);
      });
    }, { rootMargin: '0px 0px -40px 0px', threshold: 0.05 });
    // Stagger siblings so a grid fills in left to right.
    const counts = new Map();
    reveal.forEach((el) => {
      const n = counts.get(el.parentElement) || 0;
      counts.set(el.parentElement, n + 1);
      el.style.setProperty('--d', `${Math.min(n, 8) * 45}ms`);
      io.observe(el);
    });
  } else {
    reveal.forEach((el) => el.classList.add('is-in'));
  }

  $$('.card-media img, .row-thumb img').forEach((img) => {
    const done = () => img.parentElement.classList.add('is-loaded');
    if (img.complete && img.naturalWidth) done();
    else {
      img.addEventListener('load', done, { once: true });
      img.addEventListener('error', done, { once: true });
    }
  });

  // The hero monitor's timecode runs at 24 fps like a playing clip.
  $$('[data-timecode]').forEach((el) => {
    if (reduceMotion) return;
    const start = performance.now() - 12 * 1000 - 4 * (1000 / 24);
    const pad = (n) => String(n).padStart(2, '0');
    const tick = (t) => {
      const f = Math.floor((t - start) / (1000 / 24));
      const sec = Math.floor(f / 24);
      el.textContent = `${pad(Math.floor(sec / 3600))}:${pad(Math.floor(sec / 60) % 60)}:${pad(sec % 60)}:${pad(f % 24)}`;
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });

  $$('[data-count]').forEach((el) => {
    const target = Number(el.dataset.count);
    if (!target || reduceMotion || target > 1e6) return;
    const start = performance.now();
    const dur = 900;
    const step = (t) => {
      const p = Math.min(1, (t - start) / dur);
      const v = Math.round(target * (1 - (1 - p) ** 3));
      el.textContent = v >= 1000 ? `${(v / 1000).toFixed(v < 10000 ? 1 : 0).replace(/\.0$/, '')}k` : String(v);
      if (p < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  });

  // ---- Live countdowns ("expires in 4m 12s") ----------------------------------------------------------

  function remaining(ms) {
    if (ms <= 0) return 'now';
    const s = Math.floor(ms / 1000);
    const d = Math.floor(s / 86400);
    const h = Math.floor((s % 86400) / 3600);
    const m = Math.floor((s % 3600) / 60);
    const sec = s % 60;
    if (d) return `in ${d}d ${h}h`;
    if (h) return `in ${h}h ${m}m`;
    if (m) return `in ${m}m ${String(sec).padStart(2, '0')}s`;
    return `in ${sec}s`;
  }
  const timers = $$('[data-expires]');
  if (timers.length) {
    const tick = () => timers.forEach((el) => {
      const left = Number(el.dataset.expires) - Date.now();
      el.textContent = remaining(left);
      el.title = new Date(Number(el.dataset.expires)).toLocaleString();
    });
    tick();
    setInterval(tick, 1000);
  }

  // ---- Copy & share -------------------------------------------------------------------------------

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
    const btn = e.target.closest('[data-copy], [data-share]');
    if (!btn) return;
    // Native share sheet on phones; copying the link everywhere else.
    if (btn.hasAttribute('data-share') && navigator.share && window.matchMedia('(pointer: coarse)').matches) {
      navigator.share({ title: btn.dataset.shareTitle, url: btn.dataset.shareUrl }).catch(() => {});
      return;
    }
    const text = btn.dataset.copy || btn.dataset.shareUrl;
    if (!text) return;
    const ok = await copyText(text);
    toast(ok ? 'Copied to clipboard' : 'Couldn\'t copy. Select the text and copy it.', ok ? 'ok' : 'error');
  });

  $$('[data-select-on-focus]').forEach((el) => el.addEventListener('focus', () => el.select()));

  // ---- Password visibility -----------------------------------------------------------------------

  $$('[data-toggle-password]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const input = document.getElementById(btn.dataset.togglePassword);
      const show = input.type === 'password';
      input.type = show ? 'text' : 'password';
      btn.setAttribute('aria-label', show ? 'Hide password' : 'Show password');
      btn.setAttribute('aria-pressed', String(show));
    });
  });

  // ---- Video previews when hovering a card ------------------------------------------------------------

  if (window.matchMedia('(hover: hover) and (pointer: fine)').matches && !reduceMotion) {
    $$('.card[data-preview]').forEach((card) => {
      let video = null;
      let timer = null;
      card.addEventListener('mouseenter', () => {
        timer = setTimeout(() => {
          video = document.createElement('video');
          Object.assign(video, { src: card.dataset.preview, muted: true, loop: true, playsInline: true, preload: 'auto' });
          video.setAttribute('aria-hidden', 'true');
          video.style.opacity = '0';
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

  // ---- Save without a reload ----------------------------------------------------------------------

  $$('[data-save-form]').forEach((f) => {
    f.addEventListener('submit', async (e) => {
      e.preventDefault();
      const btn = $('[data-save-btn]', f);
      btn.classList.add('is-loading');
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
        toast(data.saved ? 'Saved to your list' : 'Removed from saved');
      } catch {
        f.submit();
      } finally {
        btn.classList.remove('is-loading');
      }
    });
  });

  // ---- Tag preview ---------------------------------------------------------------------------------

  $$('[data-tags-input]').forEach((input) => {
    const preview = $('[data-tags-preview]', input.parentElement);
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

  // ---- Link settings: expiry controls ------------------------------------------------------------------

  // Reads the expiry, limit and password fields into what the API expects.
  function linkSettings(form) {
    const val = (name) => { const el = form.elements[name]; return el ? el.value : ''; };
    const expiry = (form.querySelector('[name=expiry]:checked') || {}).value || 'never';
    const out = { expiry, maxDownloads: val('maxDownloads'), password: val('password') };
    if (form.elements.removePassword) out.removePassword = form.elements.removePassword.checked;
    if (expiry === 'after') {
      const minutes = Math.round(Number(val('expiryAmount')) * Number(val('expiryUnit') || 1));
      out.expiresIn = minutes > 0 ? String(minutes) : '';
    }
    if (form.elements.manageKey) out.manageKey = form.elements.manageKey.value;
    return out;
  }

  $$('[data-expiry]').forEach((box) => {
    const form = box.closest('form');
    const after = $('[data-expiry-after]', box);
    const quick = $('[data-expiry-quick]', box);
    const hidden = $('[data-expires-in]', box);
    const amount = $('[name=expiryAmount]', box);
    const unit = $('[name=expiryUnit]', box);
    const sync = () => {
      const mode = (form.querySelector('[name=expiry]:checked') || {}).value;
      const on = mode === 'after';
      after.hidden = !on;
      quick.hidden = !on;
      const minutes = Math.round(Number(amount.value) * Number(unit.value || 1));
      hidden.value = on && minutes > 0 ? String(minutes) : '';
      $$('[data-minutes]', quick).forEach((b) => b.classList.toggle('is-on', on && Number(b.dataset.minutes) === minutes));
    };
    $$('[name=expiry]', form).forEach((r) => r.addEventListener('change', sync));
    [amount, unit].forEach((el) => el.addEventListener('input', sync));
    $$('[data-minutes]', quick).forEach((b) => b.addEventListener('click', () => {
      const m = Number(b.dataset.minutes);
      if (m % 1440 === 0) { amount.value = m / 1440; unit.value = '1440'; } else if (m % 60 === 0) { amount.value = m / 60; unit.value = '60'; } else { amount.value = m; unit.value = '1'; }
      sync();
    }));
    sync();
  });

  // ---- Profile photo ----------------------------------------------------------------------------------

  const avatarBox = $('[data-avatar-edit]');
  if (avatarBox) {
    const input = $('[data-avatar-input]', avatarBox);
    const csrf = avatarBox.dataset.csrf;
    const post = async (path, body) => {
      const res = await fetch(path, {
        method: 'POST', credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json', 'X-CSRF-Token': csrf },
        body: JSON.stringify(body || {}),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.ok) throw new Error(data.error || 'Upload failed.');
      return data;
    };
    input.addEventListener('change', async () => {
      const file = input.files[0];
      if (!file) return;
      if (file.size > 5 * 1024 * 1024) { toast('That image is over 5 MB.', 'error'); input.value = ''; return; }
      const preview = $('[data-avatar-preview]', avatarBox);
      const local = URL.createObjectURL(file);
      preview.innerHTML = '<span class="avatar xl"><img alt=""></span>';
      $('img', preview).src = local;
      avatarBox.classList.add('is-busy');
      const label = $('label.btn', avatarBox);
      label.classList.add('is-loading');
      try {
        const { uploads } = await post('/api/uploads', { files: [{ field: 'avatar', name: file.name, size: file.size }] });
        const t = uploads[0];
        const put = await fetch(t.url, { method: 'PUT', headers: t.headers, body: file });
        if (!put.ok) throw new Error('Upload failed.');
        await post('/api/me/avatar', { upload: t.id });
        toast('Profile photo updated');
        setTimeout(() => location.reload(), 600);
      } catch (err) {
        toast(err.message, 'error');
        avatarBox.classList.remove('is-busy');
        label.classList.remove('is-loading');
      }
    });
  }

  // ---- Upload and edit form -------------------------------------------------------------------------

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
        headers: {
          'Content-Type': 'application/json', Accept: 'application/json', 'X-CSRF-Token': form.dataset.csrf,
          ...(form.dataset.manageKey ? { 'X-Manage-Key': form.dataset.manageKey } : {}),
        },
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
        ...linkSettings(form),
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
      submitBtn.classList.add('is-loading');
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
        progressText.textContent = 'Done';
        window.location.href = isEdit ? (form.dataset.redirect || saved.url)
          : `${saved.url}?uploaded=1${saved.manageKey ? `&key=${encodeURIComponent(saved.manageKey)}` : ''}`;
      } catch (err) {
        busy = false;
        submitBtn.disabled = false;
        submitBtn.classList.remove('is-loading');
        progress.hidden = true;
        if (cancelled || err.message === 'cancelled') { showError('Upload cancelled.'); return; }
        if (err.errors) showFieldErrors(err.errors);
        showError(err.message === 'network' ? 'Network error. Check your connection and try again.' : err.message);
        toast(err.message === 'network' ? 'Upload failed: network error' : 'Upload failed', 'error');
      }
    });
  }
})();
