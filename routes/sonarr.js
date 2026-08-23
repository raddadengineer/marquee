const express = require('express');
const axios = require('axios');
const requireAuth = require('./requireAuth');
const requireOwner = require('./requireOwner');
const { mapReleases } = require('../lib/releaseSearch');
const { mapFileInfo } = require('../lib/fileInfo');
const { isConfigured } = require('../lib/services');
const router = express.Router();

router.use((req, res, next) => {
  if (!isConfigured('sonarr')) {
    return res.status(503).json({ error: 'Sonarr is not configured', unconfigured: true });
  }
  next();
});

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

// Owner-only free-text search across Sonarr's own tracked library (not TMDB).
// Each result carries its own season list (Sonarr's series payload already
// includes per-season episode counts) so the frontend can drill straight into
// a season without a second round trip — release search is per-episode, so
// picking a season/episode still has to happen before /releases below.
router.get('/search', requireAuth, requireOwner, async (req, res) => {
  const q = (req.query.q || '').trim().toLowerCase();
  if (!q) return res.json([]);
  try {
    const { data } = await axios.get(`${process.env.SONARR_URL}/api/v3/series`, {
      headers: { 'X-Api-Key': process.env.SONARR_API_KEY }
    });
    const results = data
      .filter(s => s.title.toLowerCase().includes(q))
      .slice(0, 25)
      .map(s => ({
        mediaType: 'tv',
        seriesId: s.id,
        tvdbId: s.tvdbId,
        title: s.title,
        year: s.year,
        poster: s.images?.find(i => i.coverType === 'poster')?.remoteUrl || null,
        seasons: (s.seasons || [])
          .filter(se => se.seasonNumber > 0) // skip "Specials"
          .map(se => ({ seasonNumber: se.seasonNumber, episodeCount: se.statistics?.totalEpisodeCount || 0 }))
      }));
    res.json(results);
  } catch (err) {
    console.error('sonarr search error:', err.code || err.response?.status, err.message);
    res.status(502).json({ error: 'Could not reach Sonarr' });
  }
});

// Episodes within one season of an already-tracked series — the second step
// of the library-search drill-down (series -> season -> episode) before a
// specific episode can be handed to /releases below.
router.get('/episodes', requireAuth, requireOwner, async (req, res) => {
  const seriesId = Number(req.query.seriesId);
  const season = Number(req.query.season);
  if (!Number.isInteger(seriesId) || seriesId <= 0 || !Number.isInteger(season)) {
    return res.status(400).json({ error: 'Invalid series/season' });
  }
  try {
    const [{ data: episodes }, { data: files }] = await Promise.all([
      axios.get(`${process.env.SONARR_URL}/api/v3/episode`, {
        params: { seriesId, seasonNumber: season },
        headers: { 'X-Api-Key': process.env.SONARR_API_KEY }
      }),
      // Episode file details (quality/size/mediaInfo) live on a separate
      // resource, keyed by episodeFileId — fetched once for the whole series
      // and joined below rather than one request per episode.
      axios.get(`${process.env.SONARR_URL}/api/v3/episodefile`, {
        params: { seriesId },
        headers: { 'X-Api-Key': process.env.SONARR_API_KEY }
      })
    ]);
    const fileById = new Map(files.map(f => [f.id, f]));
    const results = episodes
      .sort((a, b) => a.episodeNumber - b.episodeNumber)
      .map(e => ({
        episodeNumber: e.episodeNumber,
        title: e.title,
        hasFile: e.hasFile,
        file: mapFileInfo(e.episodeFileId ? fileById.get(e.episodeFileId) : null)
      }));
    res.json(results);
  } catch (err) {
    console.error('sonarr episodes error:', err.code || err.response?.status, err.message);
    res.status(502).json({ error: 'Could not reach Sonarr' });
  }
});

// What's currently on disk for a tracked episode, shown before the owner
// decides to search for a replacement (e.g. from an open issue) — same
// series/episode lookup as /releases below, just returning file info instead
// of triggering an indexer search.
router.get('/file-info', requireAuth, requireOwner, async (req, res) => {
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

    let file = null;
    if (ep.episodeFileId) {
      const { data: epFile } = await axios.get(`${process.env.SONARR_URL}/api/v3/episodefile/${ep.episodeFileId}`, {
        headers: { 'X-Api-Key': process.env.SONARR_API_KEY }
      });
      file = mapFileInfo(epFile);
    }
    res.json({
      title: series.title,
      poster: series.images?.find(i => i.coverType === 'poster')?.remoteUrl || null,
      file
    });
  } catch (err) {
    console.error('sonarr file-info error:', err.code || err.response?.status, err.message);
    res.status(502).json({ error: 'Could not reach Sonarr' });
  }
});

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
          reason: (r.statusMessages || []).flatMap(s => s.messages || []).join('; ') || r.errorMessage || 'Import issue',
          // Needed to look up manual-import candidates for this specific download —
          // Sonarr's own /manualimport lookup is keyed by downloadId, not queue id.
          downloadId: r.downloadId || null
        };
      });
    res.json(results);
  } catch (err) {
    console.error('sonarr queue error:', err.code || err.response?.status, err.message);
    res.status(502).json({ error: 'Could not reach Sonarr' });
  }
});

async function fetchManualImportCandidates(downloadId) {
  const { data } = await axios.get(`${process.env.SONARR_URL}/api/v3/manualimport`, {
    params: { downloadId },
    headers: { 'X-Api-Key': process.env.SONARR_API_KEY }
  });
  return data.map(f => ({
    path: f.path,
    folderName: f.folderName,
    name: f.name,
    size: f.size,
    downloadId: f.downloadId,
    seriesId: f.series?.id || null,
    seriesTitle: f.series?.title || null,
    episodeIds: (f.episodes || []).map(e => e.id),
    episodeLabel: (f.episodes || []).map(e => `S${e.seasonNumber}E${e.episodeNumber}`).join(', '),
    quality: f.quality,
    languages: f.languages,
    releaseGroup: f.releaseGroup,
    indexerFlags: f.indexerFlags,
    rejections: (f.rejections || []).map(r => r.reason)
  }));
}

// "TBA title" is often just Sonarr's own metadata cache lagging behind the
// actual air date, not a real problem with the file — refreshing the series
// re-pulls episode titles from Sonarr's metadata source, which frequently
// clears this specific rejection within hours of air time. Confirmed live
// against a real stuck episode (Sparks of Tomorrow S01E04) before wiring this in.
const TBA_REJECTION_RE = /\bTBA\b/i;

async function refreshSeriesAndWait(seriesId) {
  const { data: cmd } = await axios.post(`${process.env.SONARR_URL}/api/v3/command`,
    { name: 'RefreshSeries', seriesIds: [seriesId] },
    { headers: { 'X-Api-Key': process.env.SONARR_API_KEY } }
  );
  const deadline = Date.now() + 20000;
  while (Date.now() < deadline) {
    await new Promise(r => setTimeout(r, 1000));
    const { data: status } = await axios.get(`${process.env.SONARR_URL}/api/v3/command/${cmd.id}`, {
      headers: { 'X-Api-Key': process.env.SONARR_API_KEY }
    });
    if (['completed', 'failed', 'aborted', 'cancelled'].includes(status.status)) return;
  }
}

// Candidate file(s) Sonarr found in a stuck download's folder, with whatever
// episode match it made and why it wouldn't import automatically (rejections)
// — e.g. a TBA episode title right after airing. The owner reviews this
// before forcing the import below, rather than it happening blind.
router.get('/manual-import', requireAuth, requireOwner, async (req, res) => {
  const downloadId = req.query.downloadId;
  if (typeof downloadId !== 'string' || !downloadId) {
    return res.status(400).json({ error: 'Invalid downloadId' });
  }
  try {
    let results = await fetchManualImportCandidates(downloadId);
    const seriesId = results[0]?.seriesId;
    const needsRefresh = seriesId && results.some(r => r.rejections.some(msg => TBA_REJECTION_RE.test(msg)));
    if (needsRefresh) {
      await refreshSeriesAndWait(seriesId);
      results = await fetchManualImportCandidates(downloadId);
    }
    res.json(results);
  } catch (err) {
    console.error('sonarr manual-import lookup error:', err.code || err.response?.status, err.message);
    res.status(502).json({ error: 'Could not look up import candidates' });
  }
});

// Forces the import through despite whatever rejection blocked it automatically
// — quality/languages/releaseGroup/indexerFlags/path/folderName/downloadId are
// passed straight back from the GET above (the owner never edits them), so
// this only re-affirms Sonarr's own suggested match rather than accepting an
// arbitrary client-constructed one.
router.post('/manual-import', requireAuth, requireOwner, async (req, res) => {
  const { path, folderName, seriesId, episodeIds, quality, languages, releaseGroup, indexerFlags, downloadId } = req.body;
  if (typeof path !== 'string' || !path || !Number.isInteger(seriesId) || seriesId <= 0 ||
      !Array.isArray(episodeIds) || !episodeIds.length || !episodeIds.every(Number.isInteger)) {
    return res.status(400).json({ error: 'Invalid import request' });
  }
  try {
    await axios.post(`${process.env.SONARR_URL}/api/v3/command`, {
      name: 'ManualImport',
      files: [{ path, folderName, seriesId, episodeIds, quality, languages, releaseGroup, indexerFlags, downloadId }],
      importMode: 'auto'
    }, {
      headers: { 'X-Api-Key': process.env.SONARR_API_KEY }
    });
    res.json({ status: 'importing' });
  } catch (err) {
    console.error('sonarr manual-import error:', err.response?.data || err.message);
    res.status(502).json({ error: 'Could not force the import' });
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
