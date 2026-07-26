const axios = require('axios');

// Which Radarr movie ids / Sonarr series ids are actually sitting in the
// respective *arr app's download queue right now — used to tell "actively
// being fetched" apart from Overseerr's own PROCESSING media status, which
// gets set the moment a request is approved and handed off, regardless of
// whether a release was ever actually found/grabbed (an unreleased movie,
// for example, sits at PROCESSING for months with nothing happening).
async function getQueuedIds() {
  const [movieIds, seriesIds] = await Promise.all([
    axios.get(`${process.env.RADARR_URL}/api/v3/queue`, {
      params: { pageSize: 200 },
      headers: { 'X-Api-Key': process.env.RADARR_API_KEY }
    }).then(r => new Set(r.data.records.map(rec => rec.movieId))).catch(() => new Set()),
    axios.get(`${process.env.SONARR_URL}/api/v3/queue`, {
      params: { pageSize: 200 },
      headers: { 'X-Api-Key': process.env.SONARR_API_KEY }
    }).then(r => new Set(r.data.records.map(rec => rec.seriesId))).catch(() => new Set())
  ]);
  return { movieIds, seriesIds };
}

module.exports = { getQueuedIds };
