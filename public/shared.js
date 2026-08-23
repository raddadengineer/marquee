// Small utilities shared by both index.html (app.js) and admin.html (admin.js).
// Loaded before either page-specific script.

async function api(path, opts = {}) {
  const res = await fetch(path, { credentials: 'include', headers: { 'Content-Type': 'application/json' }, ...opts });
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || res.statusText);
  return res.json();
}

function dotClass(bad) {
  return 'state-dot' + (bad ? ' paused' : '');
}
function escapeHtml(str = '') {
  return str.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
function timeAgo(ts) {
  // Accepts either an epoch-ms number (Tautulli/login log) or an ISO date string
  // (Overseerr's createdAt) — normalize through Date so both work.
  const mins = Math.round((Date.now() - new Date(ts).getTime()) / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.round(hrs / 24)}d ago`;
}
function formatDate(iso) {
  if (!iso) return 'TBA';
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}
function formatSpeed(kbps) {
  return kbps >= 1024 ? `${(kbps / 1024).toFixed(1)} MB/s` : `${kbps} KB/s`;
}
// mm:ss below an hour, h:mm:ss at or above — same threshold Tautulli's own
// activity view uses for its elapsed/total counters.
function formatDuration(ms) {
  const totalSec = Math.max(0, Math.round(ms / 1000));
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const sec = totalSec % 60;
  const ss = String(sec).padStart(2, '0');
  return h ? `${h}:${String(m).padStart(2, '0')}:${ss}` : `${m}:${ss}`;
}
function formatEta(seconds) {
  if (seconds >= 3600) return `${Math.round(seconds / 3600)}h left`;
  if (seconds >= 60) return `${Math.round(seconds / 60)}m left`;
  return `${seconds}s left`;
}
function formatBytes(bytes) {
  if (!bytes) return '';
  const gb = bytes / (1024 ** 3);
  // Release/download sizes never got big enough for this to matter before —
  // whole-volume disk space (admin Stack panel) is the first place values
  // routinely cross into TB.
  return gb >= 1000 ? (gb / 1024).toFixed(1) + ' TB' : gb.toFixed(1) + ' GB';
}
function titleCase(str) {
  return str.replace(/\w\S*/g, w => w[0].toUpperCase() + w.slice(1));
}

// Replaces the browser's native confirm() (a plain unstyled OS dialog) with
// the app's own themed modal — same Promise<boolean> shape, so every call
// site just becomes `if (!await confirmDialog('...')) return;`. Relies on
// both pages having a #confirm-modal with #confirm-message/#confirm-cancel-btn/
// #confirm-ok-btn (see index.html/admin.html).
function confirmDialog(message) {
  return new Promise(resolve => {
    const modal = document.getElementById('confirm-modal');
    const okBtn = document.getElementById('confirm-ok-btn');
    const cancelBtn = document.getElementById('confirm-cancel-btn');
    document.getElementById('confirm-message').textContent = message;
    modal.classList.remove('hidden');

    function cleanup(result) {
      modal.classList.add('hidden');
      okBtn.removeEventListener('click', onOk);
      cancelBtn.removeEventListener('click', onCancel);
      resolve(result);
    }
    function onOk() { cleanup(true); }
    function onCancel() { cleanup(false); }
    okBtn.addEventListener('click', onOk);
    cancelBtn.addEventListener('click', onCancel);
  });
}

// Clicking a modal's backdrop closes it, sitewide — applies automatically to
// every ".modal" on the page (both index.html and admin.html), no per-modal
// wiring needed. Triggers the modal's own close button rather than just
// toggling .hidden directly, so any extra cleanup a specific modal's close
// handler does (e.g. resetting the request modal back to its Search tab)
// still runs the same way it would from clicking the X. e.target === modal
// only when the click actually landed on the backdrop itself, not on the
// card or anything inside it.
document.querySelectorAll('.modal').forEach(modal => {
  modal.addEventListener('click', e => {
    if (e.target !== modal) return;
    modal.querySelector('.pill-btn-icon')?.click();
  });
});

// ---------- Theme System ----------
const DEFAULT_CUSTOM_COLORS = {
  bg: '#0F172A',
  card: '#1E293B',
  text: '#F8FAFC',
  accent: '#38BDF8',
  secondary: '#F43F5E'
};

const MARQUEE_THEMES = [
  { id: 'marquee-light', name: 'Marquee Glass', desc: 'Soft translucent glass & ambient light', primary: '#2F6FED', card: 'rgba(255,255,255,0.7)', accent: '#0F8F76' },
  { id: 'midnight-cyber', name: 'Midnight Cyber', desc: 'Neon cyan & magenta dark mode', primary: '#00F0FF', card: 'rgba(18,22,34,0.75)', accent: '#FF007A' },
  { id: 'oled-black', name: 'OLED Pure Black', desc: 'High-contrast pitch black & crisp amber', primary: '#FFC658', card: '#000000', accent: '#E08A1E' },
  { id: 'nordic-slate', name: 'Nordic Slate', desc: 'Cool slate blue & icy teal', primary: '#88C0D0', card: 'rgba(46,52,64,0.85)', accent: '#81A1C1' },
  { id: 'sunset-amber', name: 'Sunset Amber', desc: 'Warm dark copper & gold', primary: '#E0A21E', card: 'rgba(26,20,18,0.85)', accent: '#D97706' },
  { id: 'custom', name: 'Custom Colors', desc: 'Personalized custom color scheme', primary: '#38BDF8', card: '#1E293B', accent: '#F43F5E' }
];

function getCustomColors() {
  try {
    const stored = localStorage.getItem('marquee-custom-colors');
    return stored ? { ...DEFAULT_CUSTOM_COLORS, ...JSON.parse(stored) } : DEFAULT_CUSTOM_COLORS;
  } catch {
    return DEFAULT_CUSTOM_COLORS;
  }
}

function hexToRgba(hex, alpha = 0.8) {
  if (!hex || !hex.startsWith('#')) return hex;
  const h = hex.replace('#', '');
  const r = parseInt(h.substring(0, 2), 16) || 0;
  const g = parseInt(h.substring(2, 4), 16) || 0;
  const b = parseInt(h.substring(4, 6), 16) || 0;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function applyCustomColors(colors = getCustomColors()) {
  const root = document.documentElement;
  root.style.setProperty('--custom-bg', colors.bg);
  root.style.setProperty('--custom-card', hexToRgba(colors.card, 0.82));
  root.style.setProperty('--custom-text', colors.text);
  root.style.setProperty('--custom-accent', colors.accent);
  root.style.setProperty('--custom-accent-transparent', hexToRgba(colors.accent, 0.25));
  root.style.setProperty('--custom-secondary', colors.secondary);
  root.style.setProperty('--custom-sec-transparent', hexToRgba(colors.secondary, 0.25));
  root.style.setProperty('--custom-input-bg', hexToRgba(colors.bg, 0.9));
}

function saveCustomColors(colors) {
  const updated = { ...getCustomColors(), ...colors };
  localStorage.setItem('marquee-custom-colors', JSON.stringify(updated));
  applyCustomColors(updated);
  return updated;
}

function getTheme() {
  return localStorage.getItem('marquee-theme') || 'marquee-light';
}

function setTheme(themeId) {
  const valid = MARQUEE_THEMES.some(t => t.id === themeId);
  const target = valid ? themeId : 'marquee-light';
  document.documentElement.setAttribute('data-theme', target);
  localStorage.setItem('marquee-theme', target);
  if (target === 'custom') {
    applyCustomColors();
  }
  window.dispatchEvent(new CustomEvent('themechanged', { detail: target }));
  return target;
}

const PRESET_PALETTES = [
  { name: 'Deep Neon', bg: '#0F172A', card: '#1E293B', text: '#F8FAFC', accent: '#38BDF8', secondary: '#F43F5E' },
  { name: 'Emerald Forest', bg: '#064E3B', card: '#047857', text: '#ECFDF5', accent: '#34D399', secondary: '#F59E0B' },
  { name: 'Rose Quartz', bg: '#4C1D95', card: '#5B21B6', text: '#F5F3FF', accent: '#F472B6', secondary: '#38BDF8' },
  { name: 'Cyber Gold', bg: '#18181B', card: '#27272A', text: '#FAFAFA', accent: '#FACC15', secondary: '#FB923C' }
];

function renderCustomPanel(container) {
  const c = getCustomColors();
  let panel = container.querySelector('.custom-theme-panel');
  if (!panel) {
    panel = document.createElement('div');
    panel.className = 'custom-theme-panel';
    container.appendChild(panel);
  }

  panel.innerHTML = `
    <div class="discover-label">Custom Palette Colors</div>
    <div class="custom-color-grid">
      <div class="custom-color-item">
        <span class="custom-color-label">Background</span>
        <div class="custom-color-picker-wrap">
          <input type="color" class="custom-color-input" id="cc-bg" value="${c.bg}">
          <span class="custom-color-hex">${c.bg}</span>
        </div>
      </div>
      <div class="custom-color-item">
        <span class="custom-color-label">Cards & Modals</span>
        <div class="custom-color-picker-wrap">
          <input type="color" class="custom-color-input" id="cc-card" value="${c.card}">
          <span class="custom-color-hex">${c.card}</span>
        </div>
      </div>
      <div class="custom-color-item">
        <span class="custom-color-label">Primary Accent</span>
        <div class="custom-color-picker-wrap">
          <input type="color" class="custom-color-input" id="cc-accent" value="${c.accent}">
          <span class="custom-color-hex">${c.accent}</span>
        </div>
      </div>
      <div class="custom-color-item">
        <span class="custom-color-label">Secondary Highlight</span>
        <div class="custom-color-picker-wrap">
          <input type="color" class="custom-color-input" id="cc-secondary" value="${c.secondary}">
          <span class="custom-color-hex">${c.secondary}</span>
        </div>
      </div>
      <div class="custom-color-item">
        <span class="custom-color-label">Text Color</span>
        <div class="custom-color-picker-wrap">
          <input type="color" class="custom-color-input" id="cc-text" value="${c.text}">
          <span class="custom-color-hex">${c.text}</span>
        </div>
      </div>
    </div>
    <div class="custom-presets-row">
      <span class="custom-color-label" style="width:100%; margin-top:0.4rem;">Quick Presets:</span>
      ${PRESET_PALETTES.map((p, i) => `
        <button class="preset-chip" data-preset-idx="${i}">${escapeHtml(p.name)}</button>
      `).join('')}
    </div>
  `;

  const bindPicker = (id, key) => {
    const input = panel.querySelector(`#cc-${id}`);
    if (!input) return;
    input.addEventListener('input', e => {
      const val = e.target.value;
      input.nextElementSibling.textContent = val;
      saveCustomColors({ [key]: val });
    });
  };

  bindPicker('bg', 'bg');
  bindPicker('card', 'card');
  bindPicker('accent', 'accent');
  bindPicker('secondary', 'secondary');
  bindPicker('text', 'text');

  panel.querySelectorAll('.preset-chip').forEach(btn => {
    btn.addEventListener('click', () => {
      const idx = Number(btn.dataset.presetIdx);
      const p = PRESET_PALETTES[idx];
      if (p) {
        saveCustomColors({ bg: p.bg, card: p.card, text: p.text, accent: p.accent, secondary: p.secondary });
        renderThemePicker();
      }
    });
  });
}

function renderThemePicker() {
  const themeGrid = document.getElementById('theme-options-grid');
  const themeModal = document.getElementById('theme-modal');
  if (!themeGrid) return;
  const current = getTheme();
  const customCols = getCustomColors();

  themeGrid.innerHTML = MARQUEE_THEMES.map(t => {
    const isCustom = t.id === 'custom';
    const primary = isCustom ? customCols.accent : t.primary;
    const card = isCustom ? customCols.card : t.card;
    const accent = isCustom ? customCols.secondary : t.accent;

    return `
      <div class="theme-card ${t.id === current ? 'active' : ''}" data-theme-id="${t.id}">
        <div class="theme-card-head">
          <span class="theme-card-title">${escapeHtml(t.name)}</span>
          <div class="theme-swatches">
            <span class="theme-swatch" style="background:${primary};"></span>
            <span class="theme-swatch" style="background:${card};"></span>
            <span class="theme-swatch" style="background:${accent};"></span>
          </div>
        </div>
        <div class="theme-card-desc">${escapeHtml(t.desc)}</div>
      </div>
    `;
  }).join('');

  const modalCard = themeModal?.querySelector('.theme-modal-card');
  if (current === 'custom' && modalCard) {
    renderCustomPanel(modalCard);
  } else {
    modalCard?.querySelector('.custom-theme-panel')?.remove();
  }
}

function setupThemePicker() {
  const themeModal = document.getElementById('theme-modal');
  const themeGrid = document.getElementById('theme-options-grid');
  const themeBtn = document.getElementById('theme-btn');
  const closeThemeModalBtn = document.getElementById('close-theme-modal-btn');

  if (!themeBtn || !themeModal) return;

  themeBtn.addEventListener('click', () => {
    renderThemePicker();
    themeModal.classList.remove('hidden');
  });

  if (closeThemeModalBtn) {
    closeThemeModalBtn.addEventListener('click', () => themeModal.classList.add('hidden'));
  }

  if (themeGrid) {
    themeGrid.addEventListener('click', e => {
      const card = e.target.closest('.theme-card');
      if (!card) return;
      const id = card.dataset.themeId;
      if (id) {
        setTheme(id);
        renderThemePicker();
      }
    });
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', setupThemePicker);
} else {
  setupThemePicker();
}



