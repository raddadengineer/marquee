const express = require('express');
const axios = require('axios');
const requireAuth = require('./requireAuth');
const nowPlaying = require('../lib/nowPlaying');
const { imageUrl } = require('../lib/plexImage');
const { computeStreak, computeTopWatched, computeRank } = require('../lib/myStats');
const router = express.Router();

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

async function fetchThumb(ratingKey) {
  try {
    const { data } = await axios.get(`${process.env.TAUTULLI_URL}/api/v2`, {
      params: { apikey: process.env.TAUTULLI_API_KEY, cmd: 'get_metadata', rating_key: ratingKey }
    });
    return data.response.data?.thumb || null;
  } catch (e) {
    return null;
  }
}

router.get('/recently-added', requireAuth, async (req, res) => {
  const { TAUTULLI_SECTION_MOVIES, TAUTULLI_SECTION_TV, TAUTULLI_SECTION_ANIME } = process.env;
  try {
    // If none of the section env vars are set, fall back to one combined list
    // (original behavior) so this doesn't break an existing setup.
    if (!TAUTULLI_SECTION_MOVIES && !TAUTULLI_SECTION_TV && !TAUTULLI_SECTION_ANIME) {
      const all = await fetchRecentlyAdded();
      return res.json({ all });
    }

    const [movies, tv, anime] = await Promise.all([
      TAUTULLI_SECTION_MOVIES ? fetchRecentlyAdded(TAUTULLI_SECTION_MOVIES) : [],
      TAUTULLI_SECTION_TV ? fetchRecentlyAdded(TAUTULLI_SECTION_TV) : [],
      TAUTULLI_SECTION_ANIME ? fetchRecentlyAdded(TAUTULLI_SECTION_ANIME) : []
    ]);
    res.json({ movies, tv, anime });
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
    const homeStats = (timeRange, statsCount) => axios.get(`${process.env.TAUTULLI_URL}/api/v2`, {
      params: { apikey: process.env.TAUTULLI_API_KEY, cmd: 'get_home_stats', time_range: timeRange, stats_type: 'plays', stats_count: statsCount }
    });
    const [main, animeExtended] = await Promise.all([homeStats(30, 20), homeStats(90, 50)]);
    const rowsFor = (payload, statId) => (payload.data.response.data || []).find(s => s.stat_id === statId)?.rows || [];
    const { TAUTULLI_SECTION_TV, TAUTULLI_SECTION_ANIME } = process.env;

    const tvRows = rowsFor(main, 'top_tv');
    const topTv = (TAUTULLI_SECTION_TV
      ? tvRows.filter(r => String(r.section_id) === TAUTULLI_SECTION_TV)
      : tvRows
    ).slice(0, 3);
    const animeRows = rowsFor(animeExtended, 'top_tv');
    const topAnime = (TAUTULLI_SECTION_ANIME
      ? animeRows.filter(r => String(r.section_id) === TAUTULLI_SECTION_ANIME)
      : []
    ).slice(0, 3);
    const topMovies = rowsFor(main, 'top_movies').slice(0, 3);
    const topUsers = rowsFor(main, 'top_users').slice(0, 3);

    res.json({
      user: topUsers.map(u => ({
        name: u.friendly_name || u.user,
        plays: u.total_plays,
        // Already a public plex.tv avatar URL — no proxying needed.
        avatar: u.user_thumb || null
      })),
      movie: topMovies.map(m => ({ title: m.title, plays: m.total_plays, thumb: imageUrl(m.thumb) })),
      tv: topTv.map(t => ({ title: t.title, plays: t.total_plays, thumb: imageUrl(t.thumb) })),
      anime: topAnime.map(t => ({ title: t.title, plays: t.total_plays, thumb: imageUrl(t.thumb) }))
    });
  } catch (err) {
    console.error('tautulli top-of-month error:', err.code || err.response?.status, err.message);
    res.status(502).json({ error: 'Could not reach Tautulli' });
  }
});

// Personal, per-signed-in-user stats behind a "My Stats" tab next to My
// Requests/Watchlist — hours watched + plays this month come from Tautulli's
// own get_user_watch_time_stats (one call covers both windows), while binge
// streak and most-watched are computed here from raw get_history rows (see
// lib/myStats.js) since Tautulli has no per-user equivalent of its own
// get_home_stats leaderboard. Family rank reuses that same get_home_stats
// call Top of the Month already relies on, just widened to 365 days and
// matched against this user's id instead of only taking the top 3.
router.get('/my-stats', requireAuth, async (req, res) => {
  const userId = req.session.user.id;
  try {
    const oneYearAgo = new Date(Date.now() - 365 * 86400000).toISOString().slice(0, 10);
    const apikey = process.env.TAUTULLI_API_KEY;
    const base = `${process.env.TAUTULLI_URL}/api/v2`;

    const [watchTime, historyRes, homeStats] = await Promise.all([
      axios.get(base, { params: { apikey, cmd: 'get_user_watch_time_stats', user_id: userId, query_days: '30,365' } }),
      axios.get(base, { params: { apikey, cmd: 'get_history', user_id: userId, after: oneYearAgo, length: 1000, order_column: 'date', order_dir: 'desc' } }),
      axios.get(base, { params: { apikey, cmd: 'get_home_stats', time_range: 365, stats_type: 'plays', stats_count: 50 } })
    ]);

    const windows = watchTime.data.response.data || [];
    const yearStats = windows.find(w => String(w.query_days) === '365') || {};
    const monthStats = windows.find(w => String(w.query_days) === '30') || {};

    const historyRows = historyRes.data.response.data.data || [];
    const streakDays = computeStreak(historyRows);
    // get_history has no grandparent_thumb (unlike get_recently_added), so
    // the real poster is fetched per top-3 result only, same fetch-on-demand
    // pattern fetchSeriesSummary above already uses for missing overviews.
    const topGroups = computeTopWatched(historyRows);
    const topWatched = await Promise.all(topGroups.map(async g => ({
      title: g.title,
      plays: g.plays,
      thumb: imageUrl(await fetchThumb(g.ratingKey))
    })));

    const topUsersRows = (homeStats.data.response.data || []).find(s => s.stat_id === 'top_users')?.rows || [];
    const position = computeRank(topUsersRows, userId);

    res.json({
      hours: Math.round((yearStats.total_time || 0) / 3600),
      playsThisMonth: monthStats.total_plays || 0,
      streakDays,
      rank: position ? { position, of: topUsersRows.length } : null,
      topWatched
    });
  } catch (err) {
    console.error('tautulli my-stats error:', err.code || err.response?.status, err.message);
    res.status(502).json({ error: 'Could not reach Tautulli' });
  }
});

module.exports = router;
