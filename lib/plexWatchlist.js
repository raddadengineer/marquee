const axios = require('axios');
const { extractTmdbId } = require('./guid');

const DISCOVER_URL = 'https://discover.provider.plex.tv';
const PAGE_SIZE = 50;
// A personal watchlist never realistically approaches this — just a sane cap so
// a pathological account can't turn one panel load into hundreds of outbound calls.
const MAX_ITEMS = 200;

// Plex's own type strings ('movie'/'show') differ from Overseerr's ('movie'/'tv').
const PLEX_TYPE_TO_OVERSEERR = { movie: 'movie', show: 'tv' };

async function fetchPage(token, start) {
  const { data } = await axios.get(`${DISCOVER_URL}/library/sections/watchlist/all`, {
    headers: { Accept: 'application/json', 'X-Plex-Token': token },
    params: { 'X-Plex-Container-Start': start, 'X-Plex-Container-Size': PAGE_SIZE }
  });
  return data.MediaContainer;
}

// The watchlist listing itself only gives back ratingKeys — the actual Guid
// (tmdb/imdb/tvdb ids) needs a separate per-item metadata lookup. Plex's discover
// metadata endpoint inconsistently wraps the result under either Metadata[] or
// Video[] depending on the item — a known quirk on Plex's end, not something we
// control, so both are checked.
async function fetchGuid(token, ratingKey) {
  try {
    const { data } = await axios.get(`${DISCOVER_URL}/library/metadata/${ratingKey}`, {
      headers: { Accept: 'application/json', 'X-Plex-Token': token }
    });
    const item = (data.MediaContainer.Metadata || data.MediaContainer.Video || [])[0];
    if (!item) return null;
    const mediaType = PLEX_TYPE_TO_OVERSEERR[item.type];
    const tmdbId = extractTmdbId((item.Guid || []).map(g => g.id));
    if (!mediaType || !tmdbId) return null;
    return { mediaType, tmdbId };
  } catch (e) {
    // One bad item shouldn't fail the whole watchlist — it's just left out.
    return null;
  }
}

// Returns [{ mediaType: 'movie'|'tv', tmdbId }] for everything on this user's own
// Plex Watchlist — deliberately just the identifiers, not display data. The
// caller cross-references Overseerr for title/poster/availability so the
// watchlist panel shows the same info as the rest of the request flow.
async function getWatchlist(token) {
  const first = await fetchPage(token, 0);
  const items = first.Metadata || [];
  const total = Math.min(first.totalSize || items.length, MAX_ITEMS);
  for (let start = PAGE_SIZE; start < total; start += PAGE_SIZE) {
    const page = await fetchPage(token, start);
    items.push(...(page.Metadata || []));
  }
  const resolved = await Promise.all(items.slice(0, MAX_ITEMS).map(i => fetchGuid(token, i.ratingKey)));
  return resolved.filter(Boolean);
}

module.exports = { getWatchlist };
