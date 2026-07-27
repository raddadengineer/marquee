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
