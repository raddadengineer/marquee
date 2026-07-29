const express = require('express');
const axios = require('axios');
const requireAuth = require('./requireAuth');
const nowPlaying = require('../lib/nowPlaying');
const { imageUrl } = require('../lib/plexImage');
const { isConfigured } = require('../lib/services');
const router = express.Router();

router.use((req, res, next) => {
  if (!isConfigured('tautulli')) {
    return res.status(503).json({ error: 'Tautulli is not configured', unconfigured: true });
  }
  next();
});

// Helper: lists every Plex library Tautulli knows about, with its section_id.
// Hit this once to find the IDs you need for TAUTULLI_SECTION_* in .env.
router.get('/libraries', requireAuth, async (req, res) => {
  try {
    const { data } = await axios.get(`${process.env.TAUTULLI_URL}/api/v2`, {
      params: { apikey: process.env.TAUTULLI_API_KEY, cmd: 'get_libraries' }
    });
    const libraries = (data.response.data || []).map(l => ({
      sectionId: l.section_id,
      name: l.section_name,
      type: l.section_type // movie | show | artist | photo
    }));
    res.json(libraries);
  } catch (err) {
    console.error('tautulli libraries error:', err.code || err.response?.status, err.message);
    res.status(502).json({ error: 'Could not reach Tautulli' });
  }
});

// Served from the shared now-playing cache (see lib/nowPlaying.js) rather than
// hitting Tautulli directly — it's kept fresh by Plex's own push notifications,
// so this is both instant and just as current.
router.get('/now-playing', requireAuth, (req, res) => {
  res.json(nowPlaying.getSnapshot());
});

// Live updates: an initial "full" event on connect, then "full" (session added/
// removed) or "update" (progress/state change on an existing session) events as
// they happen — no polling on the client.
router.get('/now-playing/stream', requireAuth, (req, res) => {
  res.set({ 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' });
  res.flushHeaders();
  nowPlaying.addClient(res);
  req.on('close', () => nowPlaying.removeClient(res));
});

// Tautulli logs a "newly added" event at whatever level Plex added it — a
// whole show, a whole season, or one episode at a time — so identifying
// "which show is this about" and "what's its poster" both depend on which of
// the three the row actually is.
function showIdentity(i) {
  if (i.media_type === 'episode') return { key: i.grandparent_rating_key, title: i.grandparent_title, thumb: i.grandparent_thumb };
  if (i.media_type === 'season') return { key: i.parent_rating_key, title: i.parent_title, thumb: i.parent_thumb };
  if (i.media_type === 'show') return { key: i.rating_key, title: i.title, thumb: i.thumb };
  return null; // movies aren't grouped
}
function seasonNumberFor(i) {
  if (i.media_type === 'episode') return i.parent_media_index;
  if (i.media_type === 'season') return i.media_index;
  return null;
}
function singleEventLabel(i) {
  if (i.media_type === 'episode') return `S${i.parent_media_index}E${i.media_index}`;
  if (i.media_type === 'season') return `Season ${i.media_index}`;
  return null;
}

async function fetchRecentlyAdded(sectionId) {
  const params = {
    apikey: process.env.TAUTULLI_API_KEY,
    cmd: 'get_recently_added',
    // Fetched well beyond the ~10 we'll display — grouping episodes of the same
    // show together (below) needs headroom, since a season-pack drop can
    // otherwise fill the whole raw feed with one show's episodes and crowd out
    // everything else before grouping gets a chance to help.
    count: 30
  };
  if (sectionId) params.section_id = sectionId;
  const { data } = await axios.get(`${process.env.TAUTULLI_URL}/api/v2`, { params });
  const rows = data.response.data.recently_added || [];

  // Groups every row belonging to the same show into one entry — a season
  // pack (or a backfill that logs a burst of individual episodes) collapses
  // into a single tile instead of flooding the row with one per episode.
  const groups = new Map();
  for (const i of rows) {
    const show = showIdentity(i);
    const key = show?.key || `solo-${i.rating_key}`;
    if (!groups.has(key)) {
      groups.set(key, {
        title: show ? show.title : i.title,
        thumb: imageUrl(show ? show.thumb : i.thumb),
        year: i.year,
        type: i.media_type,
        overview: i.summary || '',
        addedAt: Number(i.added_at) * 1000,
        singleLabel: singleEventLabel(i),
        seasons: new Set(),
        eventCount: 0
      });
    }
    const g = groups.get(key);
    g.addedAt = Math.max(g.addedAt, Number(i.added_at) * 1000);
    g.eventCount += 1;
    const seasonNum = seasonNumberFor(i);
    if (seasonNum) g.seasons.add(seasonNum);
  }

  const top = [...groups.entries()].slice(0, 10);
  return Promise.all(top.map(async ([key, g]) => {
    let title = g.title;
    if (g.eventCount === 1) {
      if (g.singleLabel) title = `${g.title} — ${g.singleLabel}`;
    } else {
      // Multiple rows collapsed together — name the season if they're all
      // from the same one, otherwise this spans a mixed batch.
      const seasons = [...g.seasons];
      title = seasons.length === 1 ? `${g.title} — Season ${seasons[0]}` : `${g.title} — new episodes`;
    }
    // A freshly-aired episode (or a season entry) often has no synopsis of
    // its own yet — Plex's metadata agent hasn't indexed one within hours of
    // airing, especially for anime. Same fallback Airing Today already uses
    // (episode overview -> series overview) rather than showing nothing.
    let overview = g.overview;
    if (!overview && !key.startsWith('solo-')) overview = await fetchSeriesSummary(key);
    return { title, year: g.year, type: g.type, overview, addedAt: g.addedAt, thumb: g.thumb };
  }));
}

async function fetchSeriesSummary(ratingKey) {
  try {
    const { data } = await axios.get(`${process.env.TAUTULLI_URL}/api/v2`, {
      params: { apikey: process.env.TAUTULLI_API_KEY, cmd: 'get_metadata', rating_key: ratingKey }
    });
    return data.response.data?.summary || '';
  } catch (e) {
    return '';
  }
}

function parseLibraryConfig() {
  const custom = process.env.TAUTULLI_LIBRARIES;
  if (custom && custom.trim()) {
    const pairs = custom.split(',').map(s => s.trim()).filter(Boolean);
    const result = [];
    for (const pair of pairs) {
      const parts = pair.split(':');
      if (parts.length >= 2) {
        const label = parts.slice(0, -1).join(':').trim();
        const sectionId = parts[parts.length - 1].trim();
        if (label && sectionId) {
          const key = label.toLowerCase().replace(/[^a-z0-9]+/g, '_');
          result.push({ key, label, sectionId });
        }
      }
    }
    if (result.length > 0) return result;
  }

  const { TAUTULLI_SECTION_MOVIES, TAUTULLI_SECTION_TV, TAUTULLI_SECTION_ANIME } = process.env;
  const legacy = [];
  if (TAUTULLI_SECTION_MOVIES) legacy.push({ key: 'movies', label: 'Movies', sectionId: TAUTULLI_SECTION_MOVIES });
  if (TAUTULLI_SECTION_TV) legacy.push({ key: 'tv', label: 'TV Shows', sectionId: TAUTULLI_SECTION_TV });
  if (TAUTULLI_SECTION_ANIME) legacy.push({ key: 'anime', label: 'Anime', sectionId: TAUTULLI_SECTION_ANIME });

  return legacy;
}

router.get('/recently-added', requireAuth, async (req, res) => {
  try {
    const config = parseLibraryConfig();
    if (config.length === 0) {
      const all = await fetchRecentlyAdded();
      return res.json({ all });
    }

    const results = await Promise.all(config.map(async lib => {
      const items = await fetchRecentlyAdded(lib.sectionId);
      return {
        key: lib.key,
        label: lib.label,
        sectionId: lib.sectionId,
        items
      };
    }));

    const responseData = { libraries: results };
    for (const r of results) {
      responseData[r.key] = r.items;
    }
    res.json(responseData);
  } catch (err) {
    console.error('tautulli error:', err.code || err.response?.status, err.message);
    res.status(502).json({ error: 'Could not reach Tautulli' });
  }
});

// Personalized per signed-in user via Tautulli's user_id filter — Tautulli uses
// the Plex account id directly as its own user_id, so no separate mapping is
// needed (verified against real data). History can contain multiple rows for
// the same item (resumed sessions, rewatches), so this dedupes by rating_key,
// keeping only the most recent (get_history is already newest-first).
router.get('/recently-watched', requireAuth, async (req, res) => {
  try {
    const { data } = await axios.get(`${process.env.TAUTULLI_URL}/api/v2`, {
      params: {
        apikey: process.env.TAUTULLI_API_KEY,
        cmd: 'get_history',
        user_id: req.session.user.id,
        length: 40,
        order_column: 'date',
        order_dir: 'desc'
      }
    });
    const rows = data.response.data.data || [];
    const seen = new Set();
    const items = [];
    for (const r of rows) {
      if (seen.has(r.rating_key)) continue;
      seen.add(r.rating_key);
      items.push({
        ratingKey: r.rating_key,
        title: r.grandparent_title ? `${r.grandparent_title} — S${r.parent_media_index}E${r.media_index}` : r.title,
        thumb: imageUrl(r.thumb),
        progress: Math.round(r.percent_complete) || 0,
        finished: r.watched_status >= 1,
        watchedAt: Number(r.stopped || r.date) * 1000
      });
      if (items.length >= 15) break;
    }
    res.json(items);
  } catch (err) {
    console.error('tautulli recently-watched error:', err.code || err.response?.status, err.message);
    res.status(502).json({ error: 'Could not reach Tautulli' });
  }
});

// get_history doesn't include a synopsis, unlike get_recently_added/get_activity —
// fetched on demand (only when a Recently Watched row is actually clicked) rather
// than upfront for the whole list.
router.get('/metadata/:ratingKey', requireAuth, async (req, res) => {
  try {
    const { data } = await axios.get(`${process.env.TAUTULLI_URL}/api/v2`, {
      params: { apikey: process.env.TAUTULLI_API_KEY, cmd: 'get_metadata', rating_key: req.params.ratingKey }
    });
    res.json({ overview: data.response.data?.summary || '' });
  } catch (err) {
    console.error('tautulli metadata error:', err.code || err.response?.status, err.message);
    res.status(502).json({ error: 'Could not reach Tautulli' });
  }
});

// Rolling 30-day leaderboard, top 3 (gold/silver/bronze) each: viewer, movie, TV
// show, anime. Tautulli's top_tv stat combines every "show"-type library
// together, so TV and Anime are split out here by section_id rather than two
// separate calls. Anime gets its own wider 90-day/larger-pool call — it's much
// lower-volume than regular TV, so a 30-day top-20 combined list usually
// surfaces only one anime title (regular TV dominates the shared ranking).
router.get('/top-of-month', requireAuth, async (req, res) => {
  try {
    const fetchStats = (sectionId = null, timeRange = 30) => axios.get(`${process.env.TAUTULLI_URL}/api/v2`, {
      params: {
        apikey: process.env.TAUTULLI_API_KEY,
        cmd: 'get_home_stats',
        time_range: timeRange,
        stats_type: 'plays',
        stats_count: 20,
        ...(sectionId ? { section_id: sectionId } : {})
      }
    });

    const [mainRes] = await Promise.all([fetchStats(null, 30)]);
    const rowsFor = (payload, statId) => (payload.data?.response?.data || []).find(s => s.stat_id === statId)?.rows || [];

    const topUsers = rowsFor(mainRes, 'top_users').slice(0, 3).map(u => ({
      name: u.friendly_name || u.user,
      plays: u.total_plays,
      avatar: u.user_thumb || null
    }));

    const config = parseLibraryConfig();
    const tiles = [
      { label: 'Top Viewer', isUser: true, items: topUsers }
    ];

    if (config.length > 0) {
      const sectionStats = await Promise.all(config.map(async lib => {
        try {
          const { data } = await fetchStats(lib.sectionId, 30);
          const statBlocks = data?.response?.data || [];
          let rows = [];
          for (const block of statBlocks) {
            if (block.rows && block.rows.length) {
              rows = rows.concat(block.rows);
            }
          }
          const seen = new Set();
          const items = [];
          for (const r of rows) {
            const key = r.rating_key || r.title;
            if (!seen.has(key)) {
              seen.add(key);
              items.push({ title: r.title, plays: r.total_plays, thumb: imageUrl(r.thumb) });
            }
            if (items.length >= 3) break;
          }
          return { label: `Top ${lib.label}`, items };
        } catch {
          return { label: `Top ${lib.label}`, items: [] };
        }
      }));
      tiles.push(...sectionStats);
    } else {
      const topMovies = rowsFor(mainRes, 'top_movies').slice(0, 3).map(m => ({ title: m.title, plays: m.total_plays, thumb: imageUrl(m.thumb) }));
      const topTv = rowsFor(mainRes, 'top_tv').slice(0, 3).map(t => ({ title: t.title, plays: t.total_plays, thumb: imageUrl(t.thumb) }));
      if (topMovies.length) tiles.push({ label: 'Top Movie', items: topMovies });
      if (topTv.length) tiles.push({ label: 'Top TV Show', items: topTv });
    }

    const legacyMovies = tiles.find(t => t.label.toLowerCase().includes('movie'))?.items || [];
    const legacyTv = tiles.find(t => t.label.toLowerCase().includes('tv'))?.items || [];

    res.json({
      tiles,
      user: topUsers,
      movie: legacyMovies,
      tv: legacyTv,
      anime: []
    });
  } catch (err) {
    console.error('tautulli top-of-month error:', err.code || err.response?.status, err.message);
    res.status(502).json({ error: 'Could not reach Tautulli' });
  }
});

module.exports = router;
