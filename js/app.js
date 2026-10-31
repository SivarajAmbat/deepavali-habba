/* Deepavali Habba – Bangalore photo album
 * Plain JavaScript, no frameworks. Shows a password-protected landing page, then the
 * photo grid. Photos are listed from manifest.json and served from /images.
 */
(() => {
  'use strict';

  const MANIFEST_URL = 'manifest.json';

  // Access check: SHA-256 of (SALT + password). The password itself is not stored in the page.
  // Note: this is a client-side gate only. Image files are public URLs, so anyone who knows
  // a photo's address can open it without the password.
  const ACCESS_SALT = 'Habba-Deepavali-BLR-2026';
  const ACCESS_HASH = '30ef01c14c61d2d479cd4d021d84d32d1f5f727ac019dc1910a74777284cbedd';
  const SESSION_KEY = 'habba-unlocked';

  const $ = (sel) => document.querySelector(sel);

  const ui = {
    gate: $('#gate'),
    gateForm: $('#gateForm'),
    gatePassword: $('#gatePassword'),
    gateToggle: $('#gateToggle'),
    gateError: $('#gateError'),
    gateSubmit: $('#gateSubmit'),
    gateCard: $('#gateCard'),
    app: $('#app'),
    loading: $('#loading'),
    errorBox: $('#errorBox'),
    countLine: $('#countLine'),
    refreshBtn: $('#refreshBtn'),
    selectionBar: $('#selectionBar'),
    selCount: $('#selCount'),
    selAll: $('#selAll'),
    selClear: $('#selClear'),
    downloadBtn: $('#downloadBtn'),
    grid: $('#grid'),
    empty: $('#empty'),
    lightbox: $('#lightbox'),
    lbImg: $('#lbImg'),
    lbCounter: $('#lbCounter'),
    lbDownload: $('#lbDownload'),
    lbClose: $('#lbClose'),
    lbPrev: $('#lbPrev'),
    lbNext: $('#lbNext'),
    toast: $('#toast'),
  };

  const state = {
    event: {},
    photos: [],      // [{ file, title }]
    visible: [],     // photos currently shown (lightbox uses this order)
    selected: new Set(),
    lightboxIndex: -1,
  };

  /* ---------- Helpers ---------- */

  const esc = (value) =>
    String(value ?? '').replace(/[&<>"']/g, (c) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
    }[c]));

  const fileName = (path) => path.split('/').pop();

  const prettyName = (path) =>
    fileName(path)
      .replace(/\.[^.]+$/, '')
      .replace(/[-_]+/g, ' ')
      .replace(/\b\w/g, (c) => c.toUpperCase());

  const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;

  const slug = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'photos';

  function showToast(message) {
    ui.toast.textContent = message;
    ui.toast.hidden = false;
    clearTimeout(showToast.timer);
    showToast.timer = setTimeout(() => { ui.toast.hidden = true; }, 3200);
  }

  function triggerDownload(blob, name) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  /* ---------- Access gate ---------- */

  async function sha256Hex(text) {
    if (!window.crypto || !window.crypto.subtle) {
      throw new Error('Secure browsing (https or localhost) is required to unlock the album.');
    }
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
    return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
  }

  function wasUnlocked() {
    try { return sessionStorage.getItem(SESSION_KEY) === '1'; } catch (e) { return false; }
  }

  function rememberUnlocked() {
    try { sessionStorage.setItem(SESSION_KEY, '1'); } catch (e) { /* storage unavailable */ }
  }

  function showAlbum() {
    ui.gate.hidden = true;
    ui.app.hidden = false;
    document.body.classList.add('in-album');
    loadManifest(false);
  }

  function showGateError(message) {
    ui.gateError.textContent = message;
    ui.gateError.hidden = false;
    ui.gateCard.classList.remove('shake');
    void ui.gateCard.offsetWidth; // restart the animation
    ui.gateCard.classList.add('shake');
  }

  async function handleGateSubmit(e) {
    e.preventDefault();
    const password = ui.gatePassword.value;
    if (!password) {
      showGateError('Please enter the album password.');
      return;
    }
    ui.gateSubmit.disabled = true;
    try {
      const hash = await sha256Hex(ACCESS_SALT + password);
      if (hash === ACCESS_HASH) {
        ui.gateError.hidden = true;
        rememberUnlocked();
        showAlbum();
      } else {
        showGateError('That password is not correct. Please try again.');
        ui.gatePassword.select();
      }
    } catch (err) {
      showGateError(err.message);
    } finally {
      ui.gateSubmit.disabled = false;
    }
  }

  /* ---------- Data ---------- */

  async function loadManifest(fromRefresh) {
    ui.loading.hidden = false;
    ui.errorBox.hidden = true;
    try {
      const res = await fetch(`${MANIFEST_URL}?t=${Date.now()}`, { cache: 'no-store' });
      if (!res.ok) throw new Error(`manifest.json could not be loaded (HTTP ${res.status}).`);
      const data = await res.json();
      if (!data || !Array.isArray(data.photos)) {
        throw new Error('manifest.json must contain a "photos" array.');
      }
      state.event = data.event || {};
      state.photos = data.photos
        .filter((p) => p && p.file)
        .map((p) => ({ file: String(p.file), title: p.title || prettyName(p.file) }))
        .sort((a, b) =>
          fileName(a.file).localeCompare(fileName(b.file), undefined, { numeric: true, sensitivity: 'base' }));
      state.selected = new Set(
        [...state.selected].filter((f) => state.photos.some((p) => p.file === f))
      );
      ui.loading.hidden = true;
      render();
      if (fromRefresh) showToast('Photographs refreshed');
    } catch (err) {
      ui.loading.hidden = true;
      ui.errorBox.hidden = false;
      ui.errorBox.textContent =
        `Could not load photographs. ${err.message} ` +
        'Make sure manifest.json is in the site root and the site is opened over http(s), not as a local file.';
    }
  }

  /* ---------- Rendering ---------- */

  function render() {
    const title = state.event.title || 'Deepavali Habba – Bangalore';
    document.title = title;
    state.visible = state.photos;
    ui.grid.innerHTML = state.visible.map(tileHtml).join('');
    ui.empty.hidden = state.visible.length > 0;
    ui.countLine.textContent = state.visible.length
      ? plural(state.visible.length, 'photograph')
      : '';
    updateSelectionUI();
  }

  function tileHtml(p, i) {
    return `
      <div class="tile" role="button" tabindex="0" data-index="${i}" data-file="${esc(p.file)}"
           aria-label="Open ${esc(p.title)}">
        <img src="${esc(p.file)}" alt="${esc(p.title)}" loading="lazy" decoding="async">
        <span class="missing-label">Image not found</span>
        <button type="button" class="tile-check" aria-label="Select photograph" aria-pressed="false">✓</button>
      </div>`;
  }

  function updateSelectionUI() {
    const n = state.selected.size;
    ui.selectionBar.hidden = n === 0;
    ui.selCount.textContent = `${n} selected`;
    ui.downloadBtn.textContent = n > 1 ? `Download ZIP (${n})` : 'Download';
    ui.grid.querySelectorAll('.tile').forEach((tile) => {
      const on = state.selected.has(tile.dataset.file);
      tile.classList.toggle('selected', on);
      tile.querySelector('.tile-check').setAttribute('aria-pressed', String(on));
    });
  }

  function toggleSelect(file) {
    if (state.selected.has(file)) state.selected.delete(file);
    else state.selected.add(file);
    updateSelectionUI();
  }

  /* ---------- Downloads ---------- */

  let downloading = false;

  async function fetchBytes(file) {
    const res = await fetch(file);
    if (!res.ok) throw new Error(`${fileName(file)} (HTTP ${res.status})`);
    return new Uint8Array(await res.arrayBuffer());
  }

  function uniqueName(name, used) {
    const dot = name.lastIndexOf('.');
    const base = dot > 0 ? name.slice(0, dot) : name;
    const ext = dot > 0 ? name.slice(dot) : '';
    let candidate = name;
    let i = 2;
    while (used.has(candidate)) candidate = `${base}-${i++}${ext}`;
    used.add(candidate);
    return candidate;
  }

  async function downloadSelected() {
    if (downloading || state.selected.size === 0) return;
    const files = [...state.selected];
    downloading = true;
    ui.downloadBtn.disabled = true;
    try {
      if (files.length === 1) {
        const bytes = await fetchBytes(files[0]);
        triggerDownload(new Blob([bytes]), fileName(files[0]));
      } else {
        const used = new Set();
        const entries = [];
        for (let i = 0; i < files.length; i++) {
          ui.downloadBtn.textContent = `Preparing ${i + 1} of ${files.length}…`;
          entries.push({ name: uniqueName(fileName(files[i]), used), data: await fetchBytes(files[i]) });
        }
        triggerDownload(buildZip(entries), `${slug(state.event.title || 'deepavali-habba')}-photos.zip`);
      }
    } catch (err) {
      showToast(`Download failed: ${err.message}`);
    } finally {
      downloading = false;
      ui.downloadBtn.disabled = false;
      updateSelectionUI();
    }
  }

  /* Minimal ZIP writer (store method) – JPEG/PNG files are already compressed. */
  const CRC_TABLE = (() => {
    const table = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      table[n] = c >>> 0;
    }
    return table;
  })();

  function crc32(bytes) {
    let c = 0xffffffff;
    for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  }

  function buildZip(entries) {
    const enc = new TextEncoder();
    const now = new Date();
    const dosTime = (now.getHours() << 11) | (now.getMinutes() << 5) | Math.floor(now.getSeconds() / 2);
    const dosDate = ((now.getFullYear() - 1980) << 9) | ((now.getMonth() + 1) << 5) | now.getDate();

    const parts = [];
    const central = [];
    let offset = 0;

    entries.forEach((e) => {
      const nameBytes = enc.encode(e.name);
      const crc = crc32(e.data);
      const size = e.data.length;

      const local = new DataView(new ArrayBuffer(30));
      local.setUint32(0, 0x04034b50, true);
      local.setUint16(4, 20, true);
      local.setUint16(6, 0x0800, true);
      local.setUint16(8, 0, true);
      local.setUint16(10, dosTime, true);
      local.setUint16(12, dosDate, true);
      local.setUint32(14, crc, true);
      local.setUint32(18, size, true);
      local.setUint32(22, size, true);
      local.setUint16(26, nameBytes.length, true);
      local.setUint16(28, 0, true);
      parts.push(new Uint8Array(local.buffer), nameBytes, e.data);

      const cd = new DataView(new ArrayBuffer(46));
      cd.setUint32(0, 0x02014b50, true);
      cd.setUint16(4, 20, true);
      cd.setUint16(6, 20, true);
      cd.setUint16(8, 0x0800, true);
      cd.setUint16(10, 0, true);
      cd.setUint16(12, dosTime, true);
      cd.setUint16(14, dosDate, true);
      cd.setUint32(16, crc, true);
      cd.setUint32(20, size, true);
      cd.setUint32(24, size, true);
      cd.setUint16(28, nameBytes.length, true);
      cd.setUint16(30, 0, true);
      cd.setUint16(32, 0, true);
      cd.setUint16(34, 0, true);
      cd.setUint16(36, 0, true);
      cd.setUint32(38, 0, true);
      cd.setUint32(42, offset, true);
      central.push(new Uint8Array(cd.buffer), nameBytes);

      offset += 30 + nameBytes.length + size;
    });

    const centralSize = central.reduce((sum, b) => sum + b.length, 0);
    const end = new DataView(new ArrayBuffer(22));
    end.setUint32(0, 0x06054b50, true);
    end.setUint16(8, entries.length, true);
    end.setUint16(10, entries.length, true);
    end.setUint32(12, centralSize, true);
    end.setUint32(16, offset, true);

    return new Blob([...parts, ...central, new Uint8Array(end.buffer)], { type: 'application/zip' });
  }

  /* ---------- Lightbox ---------- */

  function openLightbox(index) {
    if (!state.visible[index]) return;
    state.lightboxIndex = index;
    ui.lightbox.hidden = false;
    document.body.style.overflow = 'hidden';
    showLightboxPhoto();
    ui.lbClose.focus();
  }

  function closeLightbox() {
    ui.lightbox.hidden = true;
    document.body.style.overflow = '';
    state.lightboxIndex = -1;
  }

  function stepLightbox(delta) {
    const n = state.visible.length;
    if (!n) return;
    state.lightboxIndex = (state.lightboxIndex + delta + n) % n;
    showLightboxPhoto();
  }

  function showLightboxPhoto() {
    const p = state.visible[state.lightboxIndex];
    if (!p) return;
    ui.lbImg.src = p.file;
    ui.lbImg.alt = p.title;
    ui.lbCounter.textContent = `${state.lightboxIndex + 1} / ${state.visible.length}`;
    ui.lbDownload.href = p.file;
    ui.lbDownload.download = fileName(p.file);
    const multiple = state.visible.length > 1;
    ui.lbPrev.hidden = !multiple;
    ui.lbNext.hidden = !multiple;
  }

  /* ---------- Events ---------- */

  ui.gateForm.addEventListener('submit', handleGateSubmit);
  ui.gateToggle.addEventListener('click', () => {
    const show = ui.gatePassword.type === 'password';
    ui.gatePassword.type = show ? 'text' : 'password';
    ui.gateToggle.setAttribute('aria-label', show ? 'Hide password' : 'Show password');
    ui.gateToggle.setAttribute('aria-pressed', String(show));
  });
  ui.gatePassword.addEventListener('input', () => { ui.gateError.hidden = true; });

  ui.refreshBtn.addEventListener('click', () => loadManifest(true));

  ui.grid.addEventListener('click', (e) => {
    const tile = e.target.closest('.tile');
    if (!tile) return;
    if (e.target.closest('.tile-check')) toggleSelect(tile.dataset.file);
    else openLightbox(Number(tile.dataset.index));
  });

  ui.grid.addEventListener('keydown', (e) => {
    if ((e.key === 'Enter' || e.key === ' ') && e.target.classList.contains('tile')) {
      e.preventDefault();
      openLightbox(Number(e.target.dataset.index));
    }
  });

  // Image load failures do not bubble, so listen in the capture phase.
  ui.grid.addEventListener('error', (e) => {
    if (e.target.tagName === 'IMG') e.target.closest('.tile')?.classList.add('missing');
  }, true);

  ui.selAll.addEventListener('click', () => {
    state.visible.forEach((p) => state.selected.add(p.file));
    updateSelectionUI();
  });
  ui.selClear.addEventListener('click', () => {
    state.selected.clear();
    updateSelectionUI();
  });
  ui.downloadBtn.addEventListener('click', downloadSelected);

  ui.lbClose.addEventListener('click', closeLightbox);
  ui.lbPrev.addEventListener('click', () => stepLightbox(-1));
  ui.lbNext.addEventListener('click', () => stepLightbox(1));
  ui.lightbox.addEventListener('click', (e) => {
    if (e.target === ui.lightbox || e.target.classList.contains('lb-stage')) closeLightbox();
  });
  document.addEventListener('keydown', (e) => {
    if (ui.lightbox.hidden) return;
    if (e.key === 'Escape') closeLightbox();
    else if (e.key === 'ArrowLeft') stepLightbox(-1);
    else if (e.key === 'ArrowRight') stepLightbox(1);
  });

  /* ---------- Start ---------- */

  if (wasUnlocked()) {
    showAlbum();
  } else {
    ui.gate.hidden = false;
    setTimeout(() => ui.gatePassword.focus(), 50);
  }
})();
