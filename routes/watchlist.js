const express = require('express');
const requireAuth = require('./requireAuth');
const { adminClient, mapDiscoverItem } = require('../lib/overseerrClient');
const plexWatchlist = require('../lib/plexWatchlist');
const router = express.Router();

// Reads through the signed-in user's own Plex token (not the admin token) so
// this is always *their* personal Watchlist, not the server owner's. Each item
// is cross-referenced against Overseerr for title/poster/availability, so the
// response is the same shape as /api/overseerr/discover and /search and the
// frontend can reuse that rendering + request flow as-is.
router.get('/', requireAuth, async (req, res) => {
  try {
    const watchlist = await plexWatchlist.getWatchlist(req.session.user.plexToken);
    const resolved = await Promise.all(watchlist.map(async ({ mediaType, tmdbId }) => {
      try {
        const { data } = await adminClient.get(`/${mediaType}/${tmdbId}`);
        return mapDiscoverItem({ ...data, mediaType });
      } catch (e) {
        return null;
      }
    }));
    res.json(resolved.filter(Boolean));
  } catch (err) {
    console.error('watchlist error', err.response?.data || err.message);
    res.status(502).json({ error: 'Could not load your Plex Watchlist' });
  }
});

module.exports = router;
