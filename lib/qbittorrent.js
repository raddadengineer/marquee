const axios = require('axios');

// qBittorrent's WebUI historically had no API-key auth — only a session
// cookie from a real username/password login. qBittorrent >= 5.2.0 (WebAPI
// >= 2.14.1) added real stateless API-key auth (Authorization: Bearer
// <key>) — confirmed against the actual deployed version (v5.2.3) and
// against qBittorrent's own docs before wiring this in: API keys can't hit
// the auth endpoints at all, so when one's configured this skips the
// login/session-cookie flow entirely rather than layering on top of it.
let sidCookie = null;
let authDisabled = false;

function getBaseUrl() {
  return (process.env.QBITTORRENT_URL || '').replace(/\/+$/, '');
}

function apiKeyHeader() {
  const key = process.env.QBITTORRENT_API_KEY;
  return key ? { Authorization: `Bearer ${key}` } : null;
}

async function login() {
  const baseUrl = getBaseUrl();
  if (!baseUrl) throw new Error('QBITTORRENT_URL is not configured');

  // Skip login if API key is provided
  if (process.env.QBITTORRENT_API_KEY) return;

  const username = process.env.QBITTORRENT_USERNAME || '';
  const password = process.env.QBITTORRENT_PASSWORD || '';

  try {
    const { headers, data } = await axios.post(
      `${baseUrl}/api/v2/auth/login`,
      new URLSearchParams({ username, password }),
      {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          Referer: baseUrl,
          Origin: baseUrl
        },
        timeout: 5000
      }
    );

    const setCookie = headers['set-cookie']?.[0];
    if (setCookie) {
      sidCookie = setCookie.split(';')[0];
      authDisabled = false;
    } else if (data === 'Ok.' || data === 'Ok' || typeof data === 'string') {
      // Authentication is disabled or bypassed in qBittorrent settings
      sidCookie = null;
      authDisabled = true;
    } else {
      throw new Error('qBittorrent login did not return a session cookie');
    }
  } catch (err) {
    if (err.response?.status === 200) {
      authDisabled = true;
      sidCookie = null;
      return;
    }
    throw err;
  }
}

async function authedGet(path) {
  const apiKeyHdr = apiKeyHeader();
  if (apiKeyHdr) {
    return (await axios.get(`${process.env.QBITTORRENT_URL}${path}`, { headers: apiKeyHdr })).data;
  }
  const get = () => axios.get(`${process.env.QBITTORRENT_URL}${path}`, { headers: { Cookie: sidCookie } });
  if (!sidCookie) await login();
  try {
    return (await get()).data;
  } catch (err) {
    if (err.response?.status === 403 || err.response?.status === 401) {
      // Session expired or unauthenticated — re-login and retry
      await login();
      return (await get()).data;
    }
    throw err;
  }
}

async function authedPost(path, form) {
  const apiKeyHdr = apiKeyHeader();
  if (apiKeyHdr) {
    await axios.post(`${process.env.QBITTORRENT_URL}${path}`, new URLSearchParams(form), { headers: apiKeyHdr });
    return;
  }
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

// The DL/UP suffix matters: a "*UP" torrent is already fully downloaded, so
// whatever sub-state it's in (paused, stalled, queued, checking) while
// seeding isn't a download-queue concern — collapsed to 'seeding' regardless,
// rather than e.g. a torrent stalled-while-seeding looking identical to one
// actually stuck trying to download.
const STATE_MAP = {
  downloading: 'downloading', metaDL: 'downloading', forcedDL: 'downloading',
  // Pre-download disk allocation and post-completion file moves are still
  // "in progress, not done yet" from a queue-panel point of view.
  allocating: 'downloading', moving: 'downloading',
  // qBittorrent 5.0+ (WebAPI 2.11+) renamed pause/resume to stop/start and the
  // state strings changed to match (stoppedDL/stoppedUP) — confirmed live
  // against this instance. Kept the old pausedDL name too for anyone running
  // an older qBittorrent.
  pausedDL: 'paused', stoppedDL: 'paused',
  stalledDL: 'stalled',
  queuedDL: 'queued',
  checkingDL: 'checking', checkingResumeData: 'checking',
  error: 'error', missingFiles: 'error',
  uploading: 'seeding', forcedUP: 'seeding', pausedUP: 'seeding', stoppedUP: 'seeding',
  stalledUP: 'seeding', queuedUP: 'seeding', checkingUP: 'seeding'
};

async function getTorrents() {
  const torrents = await authedGet('/api/v2/torrents/info');
  if (!Array.isArray(torrents)) return [];
  return torrents.map(t => ({
    id: t.hash,
    name: t.name,
    type: 'torrent',
    state: STATE_MAP[t.state] || 'other',
    progress: Math.round((t.progress || 0) * 100),
    speedKbps: Math.round((t.dlspeed || 0) / 1024),
    // qBittorrent uses 8640000 (100 days) as a sentinel for "no ETA"
    etaSeconds: t.eta && t.eta < 8640000 ? t.eta : null,
    sizeBytes: t.size || t.total_size || 0
  }));
}

// Pure mapping, kept separate from the two live API calls so it's testable
// without a real qBittorrent instance.
function mapTorrentDetails(props, files) {
  return {
    seeds: props.seeds ?? 0,
    seedsTotal: props.seeds_total ?? 0,
    peers: props.peers ?? 0,
    peersTotal: props.peers_total ?? 0,
    connections: props.nb_connections ?? 0,
    connectionsLimit: props.nb_connections_limit ?? 0,
    downloadSpeedKbps: Math.round((props.dl_speed || 0) / 1024),
    uploadSpeedKbps: Math.round((props.up_speed || 0) / 1024),
    // Same 100-day sentinel qBittorrent uses in /torrents/info for "no ETA".
    etaSeconds: props.eta && props.eta < 8640000 ? props.eta : null,
    ratio: props.share_ratio ?? null,
    sizeBytes: props.total_size || 0,
    downloadedBytes: props.total_downloaded || 0,
    uploadedBytes: props.total_uploaded || 0,
    savePath: props.save_path || null,
    addedAt: props.addition_date ? new Date(props.addition_date * 1000).toISOString() : null,
    files: (Array.isArray(files) ? files : []).map(f => ({
      name: f.name,
      sizeBytes: f.size || 0,
      progress: Math.round((f.progress || 0) * 100),
      priority: f.priority
    }))
  };
}

async function getTorrentDetails(hash) {
  const query = new URLSearchParams({ hash }).toString();
  const [props, files] = await Promise.all([
    authedGet(`/api/v2/torrents/properties?${query}`),
    authedGet(`/api/v2/torrents/files?${query}`)
  ]);
  return mapTorrentDetails(props, files);
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

// Force start: bypasses qBittorrent's own queueing limits (max active
// downloads) and re-tries even after repeated errors — different from a
// plain Resume, which still respects those limits and won't budge a torrent
// that's just sitting queued/stalled behind them. Confirmed against
// qBittorrent's own WebAPI docs: POST /api/v2/torrents/setForceStart,
// hashes + value=true.
async function forceStartTorrent(hash) {
  await authedPost('/api/v2/torrents/setForceStart', { hashes: hash, value: true });
}

// All-time upload/download totals and seeding count — /api/v2/transfer/info's
// dl_info_data/up_info_data are session-only (reset on qBittorrent restart);
// the real all-time figures qBittorrent's own status bar shows as "Global
// ratio" live in /api/v2/sync/maindata's server_state instead (alltime_ul/
// alltime_dl) — confirmed live against a real instance before wiring this in.
async function getSeedingStats() {
  const [torrents, maindata] = await Promise.all([
    getTorrents(),
    authedGet('/api/v2/sync/maindata')
  ]);
  const seedingCount = torrents.filter(t => t.state === 'seeding').length;
  const uploadedBytes = maindata.server_state?.alltime_ul || 0;
  const downloadedBytes = maindata.server_state?.alltime_dl || 0;
  return {
    seedingCount,
    uploadedBytes,
    downloadedBytes,
    ratio: downloadedBytes > 0 ? uploadedBytes / downloadedBytes : null
  };
}

module.exports = {
  getTorrents, pauseTorrent, resumeTorrent, deleteTorrent, forceStartTorrent, getSeedingStats,
  getTorrentDetails, mapTorrentDetails
};
