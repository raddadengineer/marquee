const axios = require('axios');
const { extractTmdbId } = require('./guid');

async function getMetadata(ratingKey) {
  const { data } = await axios.get(`${process.env.TAUTULLI_URL}/api/v2`, {
    params: { apikey: process.env.TAUTULLI_API_KEY, cmd: 'get_metadata', rating_key: ratingKey }
  });
  return data.response.data;
}

// Resolves a Plex rating key (movie or episode) to what Overseerr needs to file
// an issue: the *show's* tmdbId for an episode (Overseerr tracks issues against
// the show itself, with problemSeason/problemEpisode alongside — there's no
// separate per-episode Media record), or the movie's own tmdbId directly.
async function resolveForIssue(ratingKey) {
  const item = await getMetadata(ratingKey);
  if (item.media_type === 'episode') {
    const show = await getMetadata(item.grandparent_rating_key);
    return {
      mediaType: 'tv',
      tmdbId: extractTmdbId(show.guids),
      title: item.grandparent_title,
      season: Number(item.parent_media_index),
      episode: Number(item.media_index)
    };
  }
  return {
    mediaType: 'movie',
    tmdbId: extractTmdbId(item.guids),
    title: item.title,
    season: undefined,
    episode: undefined
  };
}

module.exports = { resolveForIssue };
