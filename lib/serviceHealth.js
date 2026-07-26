const axios = require('axios');
const fs = require('fs');
const uptimeKuma = require('./uptimeKuma');
const ups = require('./ups');

// Every check response shapes/fields confirmed live against real instances
// before wiring this in: Plex's "/" (version + machineIdentifier), Sonarr/
// Radarr's /api/v3/system/status (version), Overseerr's /api/v1/status
// (version), Tautulli's cmd=status (result/message, no version), qBittorrent's
// /api/v2/app/version (plain string, needs the same login flow as
// lib/qbittorrent.js), SABnzbd's mode=version (version field).

function describeError(e) {
  if (e.code === 'ECONNREFUSED') return 'Connection refused';
  if (e.code === 'ENOTFOUND') return 'Host not found';
  if (e.code === 'ETIMEDOUT' || e.code === 'ECONNABORTED') return 'Timed out';
  if (e.response?.status === 401 || e.response?.status === 403) return 'Authentication failed';
  if (e.response?.status) return `HTTP ${e.response.status}`;
  return e.message || 'Unreachable';
}

async function timed(fn) {
  const start = Date.now();
  try {
    const status = await fn();
    return { status: 'online', latencyMs: Date.now() - start, detail: status || 'Operational' };
  } catch (e) {
    return { status: 'error', message: describeError(e) };
  }
}

async function checkPlex() {
  if (!process.env.PLEX_SERVER_URL || !process.env.PLEX_ADMIN_TOKEN) return { status: 'unconfigured' };
  return timed(async () => {
    const { data } = await axios.get(`${process.env.PLEX_SERVER_URL}/`, {
      headers: { Accept: 'application/json', 'X-Plex-Token': process.env.PLEX_ADMIN_TOKEN },
      timeout: 5000
    });
    return data.MediaContainer?.version;
  });
}

async function checkTautulli() {
  if (!process.env.TAUTULLI_URL || !process.env.TAUTULLI_API_KEY) return { status: 'unconfigured' };
  return timed(async () => {
    const { data } = await axios.get(`${process.env.TAUTULLI_URL}/api/v2`, {
      params: { apikey: process.env.TAUTULLI_API_KEY, cmd: 'status' },
      timeout: 5000
    });
    if (data.response?.result !== 'success') throw new Error(data.response?.message || 'Unexpected response');
    return null; // no version in this call — falls back to "Operational"
  });
}

async function checkOverseerr() {
  if (!process.env.OVERSEERR_URL || !process.env.OVERSEERR_API_KEY) return { status: 'unconfigured' };
  return timed(async () => {
    const { data } = await axios.get(`${process.env.OVERSEERR_URL}/api/v1/status`, {
      headers: { 'X-Api-Key': process.env.OVERSEERR_API_KEY },
      timeout: 5000
    });
    return data.version;
  });
}

async function checkSonarr() {
  if (!process.env.SONARR_URL || !process.env.SONARR_API_KEY) return { status: 'unconfigured' };
  return timed(async () => {
    const { data } = await axios.get(`${process.env.SONARR_URL}/api/v3/system/status`, {
      headers: { 'X-Api-Key': process.env.SONARR_API_KEY },
      timeout: 5000
    });
    return data.version;
  });
}

async function checkRadarr() {
  if (!process.env.RADARR_URL || !process.env.RADARR_API_KEY) return { status: 'unconfigured' };
  return timed(async () => {
    const { data } = await axios.get(`${process.env.RADARR_URL}/api/v3/system/status`, {
      headers: { 'X-Api-Key': process.env.RADARR_API_KEY },
      timeout: 5000
    });
    return data.version;
  });
}

async function checkQbittorrent() {
  if (!process.env.QBITTORRENT_URL || !process.env.QBITTORRENT_USERNAME || !process.env.QBITTORRENT_PASSWORD) {
    return { status: 'unconfigured' };
  }
  return timed(async () => {
    const { headers } = await axios.post(
      `${process.env.QBITTORRENT_URL}/api/v2/auth/login`,
      new URLSearchParams({ username: process.env.QBITTORRENT_USERNAME, password: process.env.QBITTORRENT_PASSWORD }),
      { headers: { 'Content-Type': 'application/x-www-form-urlencoded', Referer: process.env.QBITTORRENT_URL }, timeout: 5000 }
    );
    const sid = headers['set-cookie']?.[0]?.split(';')[0];
    if (!sid) throw new Error('Login did not return a session');
    const { data } = await axios.get(`${process.env.QBITTORRENT_URL}/api/v2/app/version`, { headers: { Cookie: sid }, timeout: 5000 });
    return data;
  });
}

async function checkSabnzbd() {
  if (!process.env.SABNZBD_URL || !process.env.SABNZBD_API_KEY) return { status: 'unconfigured' };
  return timed(async () => {
    const { data } = await axios.get(`${process.env.SABNZBD_URL}/api`, {
      params: { mode: 'version', apikey: process.env.SABNZBD_API_KEY, output: 'json' },
      timeout: 5000
    });
    if (!data.version) throw new Error('Unexpected response');
    return data.version;
  });
}

async function checkUptimeKuma() {
  if (!process.env.UPTIME_KUMA_DATA_DIR || !process.env.UPTIME_KUMA_DB_PATH) return { status: 'unconfigured' };
  if (!fs.existsSync(process.env.UPTIME_KUMA_DB_PATH)) return { status: 'error', message: 'Database file not found' };
  return timed(async () => {
    const monitors = await uptimeKuma.getMonitors();
    return `${monitors.length} monitor${monitors.length === 1 ? '' : 's'}`;
  });
}

async function checkNutUps() {
  if (!process.env.NUT_HOST) return { status: 'unconfigured' };
  return timed(async () => {
    const status = await ups.getStatus();
    if (!status) throw new Error('No UPS data returned');
    return status.model || status.status;
  });
}

const CHECKS = {
  plex: checkPlex,
  tautulli: checkTautulli,
  overseerr: checkOverseerr,
  sonarr: checkSonarr,
  radarr: checkRadarr,
  qbittorrent: checkQbittorrent,
  sabnzbd: checkSabnzbd,
  uptimeKuma: checkUptimeKuma,
  nutUps: checkNutUps
};

async function checkAll() {
  const entries = await Promise.all(Object.entries(CHECKS).map(async ([key, fn]) => [key, await fn()]));
  return Object.fromEntries(entries);
}

module.exports = { checkAll };
