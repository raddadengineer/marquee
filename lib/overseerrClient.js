const axios = require('axios');

// Shared by any route that reads Overseerr's TMDB-shaped data (search, discover,
// watchlist, ...). Built once (not a function re-called per request) — the config
// never changes, and some call sites construct one of these per item in a
// Promise.all over a whole list, so recreating it each time was pure waste.
const adminClient = axios.create({
  baseURL: `${process.env.OVERSEERR_URL}/api/v1`,
  headers: { 'X-Api-Key': process.env.OVERSEERR_API_KEY }
});

// Trims an Overseerr movie/tv object (from /search, /discover, or a direct
// /movie/{id} or /tv/{id} lookup) down to what the frontend needs, with the
// same availability computation everywhere. Detail-endpoint responses don't
// carry their own mediaType field (the caller already knows it from the URL
// it fetched), so callers of those must spread `mediaType` in themselves.
function mapDiscoverItem(r) {
  return {
    id: r.id,
    mediaType: r.mediaType,
    title: r.title || r.name,
    year: (r.releaseDate || r.firstAirDate || '').slice(0, 4),
    overview: r.overview,
    poster: r.posterPath ? `https://image.tmdb.org/t/p/w300${r.posterPath}` : null,
    // Wide landscape image — used for the dashboard's cycling hero background,
    // not the request/discover cards (which use the portrait poster above).
    backdrop: r.backdropPath ? `https://image.tmdb.org/t/p/w1280${r.backdropPath}` : null,
    // Overseerr media status: 4 = partially available, 5 = available — i.e.
    // actually already in Plex, distinct from just having been requested
    // (2 = pending, 3 = processing) or never touched (everything else).
    availability: [4, 5].includes(r.mediaInfo?.status) ? 'available'
      : [2, 3].includes(r.mediaInfo?.status) ? 'requested'
      : 'none'
  };
}

module.exports = { adminClient, mapDiscoverItem };
