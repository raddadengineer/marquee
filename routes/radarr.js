const express = require('express');
const axios = require('axios');
const requireAuth = require('./requireAuth');
const requireOwner = require('./requireOwner');
const { mapReleases } = require('../lib/releaseSearch');
const router = express.Router();

router.get('/upcoming', requireAuth, async (req, res) => {
  try {
    const start = new Date().toISOString().slice(0, 10);
    const endDate = new Date();
    endDate.setDate(endDate.getDate() + 45);
    const end = endDate.toISOString().slice(0, 10);

    const { data } = await axios.get(`${process.env.RADARR_URL}/api/v3/calendar`, {
      params: { start, end },
      headers: { 'X-Api-Key': process.env.RADARR_API_KEY }
    });
    const items = data
      .map(m => ({
        title: m.title,
        releaseDate: m.physicalRelease || m.inCinemas || m.digitalRelease,
        overview: m.overview,
        hasFile: m.hasFile,
        poster: m.images?.find(i => i.coverType === 'poster')?.remoteUrl || null
      }))
      .sort((a, b) => new Date(a.releaseDate) - new Date(b.releaseDate));
    res.json(items);
  } catch (err) {
    console.error('radarr error:', err.code || err.response?.status, err.message);
    res.status(502).json({ error: 'Could not reach Radarr' });
  }
});

// Owner-only "resolve it right here" flow for a reported media issue: an
// interactive search against every indexer Radarr knows about, so a bad/wrong
// release can be replaced without leaving the dashboard. Can legitimately take
// tens of seconds — this is a live search, not a cached lookup.
router.get('/releases', requireAuth, requireOwner, async (req, res) => {
  const tmdbId = Number(req.query.tmdbId);
  if (!Number.isInteger(tmdbId) || tmdbId <= 0) {
    return res.status(400).json({ error: 'Invalid tmdbId' });
  }
  try {
    const { data: movies } = await axios.get(`${process.env.RADARR_URL}/api/v3/movie`, {
      params: { tmdbId },
      headers: { 'X-Api-Key': process.env.RADARR_API_KEY }
    });
    const movie = movies[0];
    if (!movie) return res.status(404).json({ error: 'Movie not tracked in Radarr' });

    const { data: releases } = await axios.get(`${process.env.RADARR_URL}/api/v3/release`, {
      params: { movieId: movie.id },
      headers: { 'X-Api-Key': process.env.RADARR_API_KEY },
      timeout: 60000
    });
    res.json(mapReleases(releases));
  } catch (err) {
    console.error('radarr release search error:', err.code || err.response?.status, err.message);
    res.status(502).json({ error: 'Could not search Radarr indexers' });
  }
});

router.post('/releases/grab', requireAuth, requireOwner, async (req, res) => {
  const { guid, indexerId } = req.body;
  if (typeof guid !== 'string' || !guid || !Number.isInteger(indexerId)) {
    return res.status(400).json({ error: 'Invalid release' });
  }
  try {
    await axios.post(`${process.env.RADARR_URL}/api/v3/release`, { guid, indexerId }, {
      headers: { 'X-Api-Key': process.env.RADARR_API_KEY }
    });
    res.json({ status: 'grabbed' });
  } catch (err) {
    console.error('radarr grab error:', err.response?.data || err.message);
    res.status(502).json({ error: err.response?.data?.[0]?.errorMessage || 'Could not grab release' });
  }
});

// Radarr's own view of in-progress downloads — surfaced here only when
// something's actually wrong (stuck import, download client reports an
// error, ...), not the whole queue, since a healthy download in progress
// isn't something the owner needs to act on.
router.get('/queue', requireAuth, requireOwner, async (req, res) => {
  try {
    const { data } = await axios.get(`${process.env.RADARR_URL}/api/v3/queue`, {
      params: { includeMovie: true, pageSize: 50 },
      headers: { 'X-Api-Key': process.env.RADARR_API_KEY }
    });
    const results = (data.records || [])
      .filter(r => r.trackedDownloadStatus && r.trackedDownloadStatus !== 'ok')
      .map(r => ({
        id: r.id,
        title: r.movie?.title || r.title,
        poster: r.movie?.images?.find(i => i.coverType === 'poster')?.remoteUrl || null,
        status: r.trackedDownloadStatus,
        reason: (r.statusMessages || []).flatMap(s => s.messages || []).join('; ') || r.errorMessage || 'Import issue'
      }));
    res.json(results);
  } catch (err) {
    console.error('radarr queue error:', err.code || err.response?.status, err.message);
    res.status(502).json({ error: 'Could not reach Radarr' });
  }
});

router.delete('/queue/:id', requireAuth, requireOwner, async (req, res) => {
  if (!/^\d+$/.test(req.params.id)) return res.status(400).json({ error: 'Invalid id' });
  try {
    await axios.delete(`${process.env.RADARR_URL}/api/v3/queue/${req.params.id}`, {
      params: { removeFromClient: true, blocklist: true },
      headers: { 'X-Api-Key': process.env.RADARR_API_KEY }
    });
    res.json({ status: 'removed' });
  } catch (err) {
    console.error('radarr queue delete error:', err.response?.status, err.message);
    res.status(502).json({ error: 'Could not remove item' });
  }
});

module.exports = router;
