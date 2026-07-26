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
