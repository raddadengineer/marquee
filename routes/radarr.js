const express = require('express');
const axios = require('axios');
const requireAuth = require('./requireAuth');
const requireOwner = require('./requireOwner');
const { mapReleases } = require('../lib/releaseSearch');
const { mapFileInfo } = require('../lib/fileInfo');
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

// Owner-only free-text search across Radarr's own tracked library (not TMDB) —
// lets the owner jump straight to an indexer search for anything already being
// managed, not just what Wanted/Missing happens to flag (e.g. re-grabbing a
// bad rip, or upgrading something that already has a file).
router.get('/search', requireAuth, requireOwner, async (req, res) => {
  const q = (req.query.q || '').trim().toLowerCase();
  if (!q) return res.json([]);
  try {
    const { data } = await axios.get(`${process.env.RADARR_URL}/api/v3/movie`, {
      headers: { 'X-Api-Key': process.env.RADARR_API_KEY }
    });
    const results = data
      .filter(m => m.title.toLowerCase().includes(q))
      .slice(0, 25)
      .map(m => ({
        mediaType: 'movie',
        tmdbId: m.tmdbId,
        title: m.title,
        year: m.year,
        hasFile: m.hasFile,
        poster: m.images?.find(i => i.coverType === 'poster')?.remoteUrl || null,
        file: mapFileInfo(m.movieFile)
      }));
    res.json(results);
  } catch (err) {
    console.error('radarr search error:', err.code || err.response?.status, err.message);
    res.status(502).json({ error: 'Could not reach Radarr' });
  }
});

// What's currently on disk for a tracked movie, shown before the owner
// decides to search for a replacement (e.g. from an open issue) — same
// tmdbId lookup as /releases below, just returning file info instead of
// triggering an indexer search.
router.get('/file-info', requireAuth, requireOwner, async (req, res) => {
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
    res.json({
      title: movie.title,
      poster: movie.images?.find(i => i.coverType === 'poster')?.remoteUrl || null,
      file: mapFileInfo(movie.movieFile)
    });
  } catch (err) {
    console.error('radarr file-info error:', err.code || err.response?.status, err.message);
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
        reason: (r.statusMessages || []).flatMap(s => s.messages || []).join('; ') || r.errorMessage || 'Import issue',
        // Needed to look up manual-import candidates for this specific download —
        // Radarr's own /manualimport lookup is keyed by downloadId, not queue id.
        downloadId: r.downloadId || null
      }));
    res.json(results);
  } catch (err) {
    console.error('radarr queue error:', err.code || err.response?.status, err.message);
    res.status(502).json({ error: 'Could not reach Radarr' });
  }
});

// Candidate file(s) Radarr found in a stuck download's folder, with whatever
// movie match it made and why it wouldn't import automatically (rejections) —
// e.g. "movie already has a file" or a custom-format/quality rule. The owner
// reviews this before forcing the import below, rather than it happening blind.
router.get('/manual-import', requireAuth, requireOwner, async (req, res) => {
  const downloadId = req.query.downloadId;
  if (typeof downloadId !== 'string' || !downloadId) {
    return res.status(400).json({ error: 'Invalid downloadId' });
  }
  try {
    const { data } = await axios.get(`${process.env.RADARR_URL}/api/v3/manualimport`, {
      params: { downloadId },
      headers: { 'X-Api-Key': process.env.RADARR_API_KEY }
    });
    const results = data.map(f => ({
      path: f.path,
      folderName: f.folderName,
      name: f.name,
      size: f.size,
      downloadId: f.downloadId,
      movieId: f.movie?.id || null,
      movieTitle: f.movie?.title || null,
      quality: f.quality,
      languages: f.languages,
      releaseGroup: f.releaseGroup,
      indexerFlags: f.indexerFlags,
      rejections: (f.rejections || []).map(r => r.reason)
    }));
    res.json(results);
  } catch (err) {
    console.error('radarr manual-import lookup error:', err.code || err.response?.status, err.message);
    res.status(502).json({ error: 'Could not look up import candidates' });
  }
});

// Forces the import through despite whatever rejection blocked it automatically
// — quality/languages/releaseGroup/indexerFlags/path/folderName/downloadId are
// passed straight back from the GET above (the owner never edits them), so
// this only re-affirms Radarr's own suggested match rather than accepting an
// arbitrary client-constructed one.
router.post('/manual-import', requireAuth, requireOwner, async (req, res) => {
  const { path, folderName, movieId, quality, languages, releaseGroup, indexerFlags, downloadId } = req.body;
  if (typeof path !== 'string' || !path || !Number.isInteger(movieId) || movieId <= 0) {
    return res.status(400).json({ error: 'Invalid import request' });
  }
  try {
    await axios.post(`${process.env.RADARR_URL}/api/v3/command`, {
      name: 'ManualImport',
      files: [{ path, folderName, movieId, quality, languages, releaseGroup, indexerFlags, downloadId }],
      importMode: 'auto'
    }, {
      headers: { 'X-Api-Key': process.env.RADARR_API_KEY }
    });
    res.json({ status: 'importing' });
  } catch (err) {
    console.error('radarr manual-import error:', err.response?.data || err.message);
    res.status(502).json({ error: 'Could not force the import' });
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
