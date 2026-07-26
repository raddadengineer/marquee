// Shared by anything that reads Plex-style Guid lists ("tmdb://123", "imdb://tt123", ...) —
// Tautulli's /get_metadata and Plex Discover's watchlist metadata both use this format.
function extractTmdbId(guids) {
  const match = (guids || []).find(g => g.startsWith('tmdb://'));
  return match ? Number(match.slice('tmdb://'.length)) : null;
}

module.exports = { extractTmdbId };
