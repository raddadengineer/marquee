const express = require('express');
const axios = require('axios');
const requireAuth = require('./requireAuth');
const requireOwner = require('./requireOwner');
const settle = require('../lib/settle');
const uptimeKuma = require('../lib/uptimeKuma');
const ups = require('../lib/ups');
const loginLog = require('../lib/loginLog');
const router = express.Router();

router.get('/status', requireAuth, requireOwner, async (req, res) => {
  const [monitors, upsStatus] = await Promise.all([
    settle('uptime-kuma read', uptimeKuma.getMonitors(), []),
    settle('UPS query', ups.getStatus(), null)
  ]);
  res.json({ monitors, ups: upsStatus });
});

router.get('/logins', requireAuth, requireOwner, async (req, res) => {
  try {
    const logins = await loginLog.recent(20);
    res.json(logins.map(l => ({ username: l.username, thumb: l.thumb, isOwner: !!l.is_owner, at: l.at })));
  } catch (err) {
    console.error('login log read error', err.message);
    res.status(500).json({ error: 'Could not read sign-in history' });
  }
});

// Monitored movies/episodes that have actually been released but still have
// no file — i.e. things genuinely worth manually searching for, not stuff
// that's simply not out yet. The shape returned matches exactly what the
// release-search modal expects (mediaType/tmdbId or tvdbId+season+episode/
// title), so "Search" on a row can open it directly with no translation step.
async function fetchMissingMovies() {
  const { data } = await axios.get(`${process.env.RADARR_URL}/api/v3/wanted/missing`, {
    params: { pageSize: 50, sortKey: 'releaseDate', sortDirection: 'descending' },
    headers: { 'X-Api-Key': process.env.RADARR_API_KEY }
  });
  return data.records
    .filter(m => m.isAvailable)
    .map(m => ({
      mediaType: 'movie',
      tmdbId: m.tmdbId,
      title: m.title,
      overview: m.overview || '',
      poster: m.images?.find(i => i.coverType === 'poster')?.remoteUrl || null,
      date: m.releaseDate || m.inCinemas || null
    }));
}

async function fetchMissingEpisodes() {
  const { data } = await axios.get(`${process.env.SONARR_URL}/api/v3/wanted/missing`, {
    params: { pageSize: 50, includeSeries: true, sortKey: 'airDateUtc', sortDirection: 'descending' },
    headers: { 'X-Api-Key': process.env.SONARR_API_KEY }
  });
  const now = Date.now();
  return data.records
    .filter(e => e.airDateUtc && new Date(e.airDateUtc).getTime() <= now)
    .map(e => ({
      mediaType: 'tv',
      tvdbId: e.series?.tvdbId,
      season: e.seasonNumber,
      episode: e.episodeNumber,
      title: e.series?.title,
      // Episodes carry no synopsis of their own from this endpoint — only the
      // series does — and the episode's own title is often still "TBA" for
      // anything not yet announced in detail.
      episodeTitle: e.title || null,
      overview: e.series?.overview || '',
      poster: e.series?.images?.find(i => i.coverType === 'poster')?.remoteUrl || null,
      date: e.airDateUtc
    }));
}

router.get('/wanted', requireAuth, requireOwner, async (req, res) => {
  const [movies, episodes] = await Promise.all([
    settle('radarr wanted', fetchMissingMovies(), []),
    settle('sonarr wanted', fetchMissingEpisodes(), [])
  ]);
  const combined = [...movies, ...episodes].sort((a, b) => new Date(b.date) - new Date(a.date));
  res.json(combined);
});

// Radarr and Sonarr both report every mount point their own container sees —
// confirmed live that this setup has them sharing several (/, /config,
// /downloads/completed all report identical byte counts from both services,
// since they're the same underlying host volumes). Grouped by matching
// (total, free) byte pairs rather than by path string, so the dashboard
// shows one row per actual physical volume instead of the same disk 2-3
// times under different mount names.
router.get('/diskspace', requireAuth, requireOwner, async (req, res) => {
  const [radarr, sonarr] = await Promise.all([
    settle('radarr diskspace', axios.get(`${process.env.RADARR_URL}/api/v3/diskspace`, {
      headers: { 'X-Api-Key': process.env.RADARR_API_KEY }
    }).then(r => r.data), []),
    settle('sonarr diskspace', axios.get(`${process.env.SONARR_URL}/api/v3/diskspace`, {
      headers: { 'X-Api-Key': process.env.SONARR_API_KEY }
    }).then(r => r.data), [])
  ]);

  const groups = new Map();
  for (const d of [...radarr, ...sonarr]) {
    // Grouped by total capacity alone, not (total, free) — confirmed live
    // that free space drifts by a few hundred KB between the Radarr and
    // Sonarr calls (made moments apart), so requiring an exact free-byte
    // match too was splitting the same physical volume into two rows.
    // Total capacity doesn't fluctuate, and two genuinely different volumes
    // having byte-for-byte identical total capacity is effectively never
    // going to happen in practice.
    const key = d.totalSpace;
    const existing = groups.get(key);
    // Prefer the shortest path as the representative label for a group ("/"
    // over "/config" over "/downloads/completed") — reads as the more
    // meaningful description of the same volume.
    if (!existing || d.path.length < existing.path.length) {
      groups.set(key, d);
    }
  }

  const results = [...groups.values()]
    .map(d => ({
      path: d.label || d.path,
      freeBytes: d.freeSpace,
      totalBytes: d.totalSpace,
      usedPercent: d.totalSpace ? Math.round((1 - d.freeSpace / d.totalSpace) * 100) : 0
    }))
    .sort((a, b) => a.freeBytes - b.freeBytes);

  res.json(results);
});

module.exports = router;
