const axios = require('axios');
const parseTimeleft = require('./parseTimeleft');

// Builds an id -> etaSeconds map from queue records, grouped by the given key
// (movieId/seriesId). A series can have several episode-level queue records
// under one seriesId (season pack) — the max is used, since the request
// isn't fully available until the slowest of them finishes. Records with no
// parseable timeleft are ignored rather than treated as 0.
function maxEtaById(records, key) {
  const etaById = new Map();
  for (const rec of records) {
    const eta = parseTimeleft(rec.timeleft);
    if (eta == null) continue;
    const id = rec[key];
    if (!etaById.has(id) || eta > etaById.get(id)) etaById.set(id, eta);
  }
  return etaById;
}

// Which Radarr movie ids / Sonarr series ids are actually sitting in the
// respective *arr app's download queue right now — used to tell "actively
// being fetched" apart from Overseerr's own PROCESSING media status, which
// gets set the moment a request is approved and handed off, regardless of
// whether a release was ever actually found/grabbed (an unreleased movie,
// for example, sits at PROCESSING for months with nothing happening).
async function getQueuedIds() {
  const [movieRecords, seriesRecords] = await Promise.all([
    axios.get(`${process.env.RADARR_URL}/api/v3/queue`, {
      params: { pageSize: 200 },
      headers: { 'X-Api-Key': process.env.RADARR_API_KEY }
    }).then(r => r.data.records).catch(() => []),
    axios.get(`${process.env.SONARR_URL}/api/v3/queue`, {
      params: { pageSize: 200 },
      headers: { 'X-Api-Key': process.env.SONARR_API_KEY }
    }).then(r => r.data.records).catch(() => [])
  ]);
  return {
    movieIds: new Set(movieRecords.map(rec => rec.movieId)),
    seriesIds: new Set(seriesRecords.map(rec => rec.seriesId)),
    movieEta: maxEtaById(movieRecords, 'movieId'),
    seriesEta: maxEtaById(seriesRecords, 'seriesId')
  };
}

module.exports = { getQueuedIds, maxEtaById };
