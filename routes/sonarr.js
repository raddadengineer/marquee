const express = require('express');
const axios = require('axios');
const requireAuth = require('./requireAuth');
const requireOwner = require('./requireOwner');
const { mapReleases } = require('../lib/releaseSearch');
const router = express.Router();

router.get('/today', requireAuth, async (req, res) => {
  try {
    const now = new Date();
    const localToday = localDateString(now);

    // Query a day of buffer on each side so a UTC/local timezone mismatch
    // can't silently cut off episodes airing near midnight, then filter
    // precisely to the container's actual local "today" below.
    const bufferStart = new Date(now); bufferStart.setDate(bufferStart.getDate() - 1);
    const bufferEnd = new Date(now); bufferEnd.setDate(bufferEnd.getDate() + 1);

    const { data } = await axios.get(`${process.env.SONARR_URL}/api/v3/calendar`, {
      params: {
        start: localDateString(bufferStart),
        end: localDateString(bufferEnd),
        includeSeries: true
      },
      headers: { 'X-Api-Key': process.env.SONARR_API_KEY }
    });

    const items = data
      .filter(ep => localDateString(new Date(ep.airDateUtc)) === localToday)
      .map(ep => ({
        series: ep.series?.title,
        episode: `S${String(ep.seasonNumber).padStart(2, '0')}E${String(ep.episodeNumber).padStart(2, '0')}`,
        title: ep.title,
        overview: ep.overview || ep.series?.overview || '',
        airTime: ep.airDateUtc,
        hasFile: ep.hasFile,
        poster: ep.series?.images?.find(i => i.coverType === 'poster')?.remoteUrl || null
      }))
      .sort((a, b) => new Date(a.airTime) - new Date(b.airTime));

    res.json(items);
  } catch (err) {
    console.error('sonarr error:', err.code || err.response?.status, err.message);
    res.status(502).json({ error: 'Could not reach Sonarr' });
  }
});

// Formats a Date as YYYY-MM-DD using the container's local timezone (set via
// the TZ env var) rather than UTC — this is what "today" actually means to you.
function localDateString(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

// Owner-only "resolve it right here" flow for a reported media issue — same
// idea as Radarr's /releases below, but Sonarr needs two lookups first
// (series by tvdbId, then the specific episode within that season) since
// release search is per-episode, not per-series.
router.get('/releases', requireAuth, requireOwner, async (req, res) => {
  const tvdbId = Number(req.query.tvdbId);
  const season = Number(req.query.season);
  const episode = Number(req.query.episode);
  if (!Number.isInteger(tvdbId) || tvdbId <= 0 || !Number.isInteger(season) || !Number.isInteger(episode)) {
    return res.status(400).json({ error: 'Invalid series/season/episode' });
  }
  try {
    const { data: seriesList } = await axios.get(`${process.env.SONARR_URL}/api/v3/series`, {
      params: { tvdbId },
      headers: { 'X-Api-Key': process.env.SONARR_API_KEY }
    });
    const series = seriesList[0];
    if (!series) return res.status(404).json({ error: 'Series not tracked in Sonarr' });

    const { data: episodes } = await axios.get(`${process.env.SONARR_URL}/api/v3/episode`, {
      params: { seriesId: series.id, seasonNumber: season },
      headers: { 'X-Api-Key': process.env.SONARR_API_KEY }
    });
    const ep = episodes.find(e => e.episodeNumber === episode);
    if (!ep) return res.status(404).json({ error: 'Episode not found in Sonarr' });

    const { data: releases } = await axios.get(`${process.env.SONARR_URL}/api/v3/release`, {
      params: { episodeId: ep.id },
      headers: { 'X-Api-Key': process.env.SONARR_API_KEY },
      timeout: 60000
    });
    res.json(mapReleases(releases));
  } catch (err) {
    console.error('sonarr release search error:', err.code || err.response?.status, err.message);
    res.status(502).json({ error: 'Could not search Sonarr indexers' });
  }
});

router.post('/releases/grab', requireAuth, requireOwner, async (req, res) => {
  const { guid, indexerId } = req.body;
  if (typeof guid !== 'string' || !guid || !Number.isInteger(indexerId)) {
    return res.status(400).json({ error: 'Invalid release' });
  }
  try {
    await axios.post(`${process.env.SONARR_URL}/api/v3/release`, { guid, indexerId }, {
      headers: { 'X-Api-Key': process.env.SONARR_API_KEY }
    });
    res.json({ status: 'grabbed' });
  } catch (err) {
    console.error('sonarr grab error:', err.response?.data || err.message);
    res.status(502).json({ error: err.response?.data?.[0]?.errorMessage || 'Could not grab release' });
  }
});

// Sonarr's own view of in-progress downloads — surfaced here only when
// something's actually wrong (stuck import, download client reports an
// error, ...), not the whole queue.
router.get('/queue', requireAuth, requireOwner, async (req, res) => {
  try {
    const { data } = await axios.get(`${process.env.SONARR_URL}/api/v3/queue`, {
      params: { includeSeries: true, includeEpisode: true, pageSize: 50 },
      headers: { 'X-Api-Key': process.env.SONARR_API_KEY }
    });
    const results = (data.records || [])
      .filter(r => r.trackedDownloadStatus && r.trackedDownloadStatus !== 'ok')
      .map(r => {
        const seriesTitle = r.series?.title;
        const epLabel = r.episode ? ` — S${r.episode.seasonNumber}E${r.episode.episodeNumber}` : '';
        return {
          id: r.id,
          title: seriesTitle ? `${seriesTitle}${epLabel}` : r.title,
          poster: r.series?.images?.find(i => i.coverType === 'poster')?.remoteUrl || null,
          status: r.trackedDownloadStatus,
          reason: (r.statusMessages || []).flatMap(s => s.messages || []).join('; ') || r.errorMessage || 'Import issue'
        };
      });
    res.json(results);
  } catch (err) {
    console.error('sonarr queue error:', err.code || err.response?.status, err.message);
    res.status(502).json({ error: 'Could not reach Sonarr' });
  }
});

router.delete('/queue/:id', requireAuth, requireOwner, async (req, res) => {
  if (!/^\d+$/.test(req.params.id)) return res.status(400).json({ error: 'Invalid id' });
  try {
    await axios.delete(`${process.env.SONARR_URL}/api/v3/queue/${req.params.id}`, {
      params: { removeFromClient: true, blocklist: true },
      headers: { 'X-Api-Key': process.env.SONARR_API_KEY }
    });
    res.json({ status: 'removed' });
  } catch (err) {
    console.error('sonarr queue delete error:', err.response?.status, err.message);
    res.status(502).json({ error: 'Could not remove item' });
  }
});

module.exports = router;
