const axios = require('axios');

// qBittorrent's WebUI has no API-key auth — only a session cookie from a real
// username/password login. Cached here and refreshed on demand rather than
// logging in on every request.
let sidCookie = null;

async function login() {
  const { headers } = await axios.post(
    `${process.env.QBITTORRENT_URL}/api/v2/auth/login`,
    new URLSearchParams({ username: process.env.QBITTORRENT_USERNAME, password: process.env.QBITTORRENT_PASSWORD }),
    { headers: { 'Content-Type': 'application/x-www-form-urlencoded', Referer: process.env.QBITTORRENT_URL } }
  );
  const setCookie = headers['set-cookie']?.[0];
  sidCookie = setCookie ? setCookie.split(';')[0] : null;
  if (!sidCookie) throw new Error('qBittorrent login did not return a session cookie');
}

async function authedGet(path) {
  const get = () => axios.get(`${process.env.QBITTORRENT_URL}${path}`, { headers: { Cookie: sidCookie } });
  if (!sidCookie) await login();
  try {
    return (await get()).data;
  } catch (err) {
    if (err.response?.status !== 403) throw err;
    // Session expired — log in once more and retry.
    await login();
    return (await get()).data;
  }
}

async function authedPost(path, form) {
  const post = () => axios.post(`${process.env.QBITTORRENT_URL}${path}`, new URLSearchParams(form), {
    headers: { Cookie: sidCookie, 'Content-Type': 'application/x-www-form-urlencoded' }
  });
  if (!sidCookie) await login();
  try {
    await post();
  } catch (err) {
    if (err.response?.status !== 403) throw err;
    await login();
    await post();
  }
}

const STATE_MAP = {
  downloading: 'downloading', metaDL: 'downloading', forcedDL: 'downloading',
  // qBittorrent 5.0+ (WebAPI 2.11+) renamed pause/resume to stop/start and the
  // state strings changed to match (stoppedDL/stoppedUP) — confirmed live
  // against this instance. Kept the old pausedDL/pausedUP names too for
  // anyone running an older qBittorrent.
  pausedDL: 'paused', pausedUP: 'paused', stoppedDL: 'paused', stoppedUP: 'paused',
  stalledDL: 'stalled', stalledUP: 'stalled',
  uploading: 'seeding', forcedUP: 'seeding',
  queuedDL: 'queued', queuedUP: 'queued',
  checkingDL: 'checking', checkingUP: 'checking', checkingResumeData: 'checking',
  error: 'error', missingFiles: 'error'
};

async function getTorrents() {
  const torrents = await authedGet('/api/v2/torrents/info');
  return torrents.map(t => ({
    id: t.hash,
    name: t.name,
    type: 'torrent',
    state: STATE_MAP[t.state] || 'other',
    progress: Math.round((t.progress || 0) * 100),
    speedKbps: Math.round((t.dlspeed || 0) / 1024),
    // qBittorrent uses 8640000 (100 days) as a sentinel for "no ETA"
    etaSeconds: t.eta && t.eta < 8640000 ? t.eta : null,
    sizeBytes: t.size || 0
  }));
}

// qBittorrent 5.0 (WebAPI 2.11+) renamed pause/resume to stop/start —
// confirmed live against this instance (the old /torrents/pause endpoint
// 404s here, /torrents/stop is what actually works).
async function pauseTorrent(hash) {
  await authedPost('/api/v2/torrents/stop', { hashes: hash });
}
async function resumeTorrent(hash) {
  await authedPost('/api/v2/torrents/start', { hashes: hash });
}
async function deleteTorrent(hash, deleteFiles) {
  await authedPost('/api/v2/torrents/delete', { hashes: hash, deleteFiles: !!deleteFiles });
}

module.exports = { getTorrents, pauseTorrent, resumeTorrent, deleteTorrent };
