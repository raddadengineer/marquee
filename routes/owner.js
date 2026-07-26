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

module.exports = router;
