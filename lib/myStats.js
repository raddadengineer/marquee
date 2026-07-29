// Pure helpers for the per-user "My Stats" tab — Tautulli's get_history
// returns raw session-level rows, so the grouping/streak logic that turns
// those into display-ready numbers lives here (testable without hitting the
// API), same split as lib/stuckRequests.js.

function dayKey(unixSeconds) {
  return new Date(unixSeconds * 1000).toISOString().slice(0, 10);
}

// Longest run of consecutive calendar days (UTC) with at least one play,
// counted backward from today. A day with zero plays "so far" (i.e. today,
// still in progress) doesn't break an existing streak the way a genuinely
// empty day does — so if nothing's logged yet today but yesterday had a
// play, the streak still counts as live and starts counting from yesterday.
function computeStreak(historyRows, now = Date.now()) {
  const days = new Set(historyRows.map(r => dayKey(r.date)));
  const todayKey = new Date(now).toISOString().slice(0, 10);
  let cursor = days.has(todayKey) ? new Date(now) : new Date(now - 86400000);
  let streak = 0;
  while (days.has(cursor.toISOString().slice(0, 10))) {
    streak += 1;
    cursor = new Date(cursor.getTime() - 86400000);
  }
  return streak;
}

// Groups episode-level rows under their parent show (same idea as
// showIdentity() in routes/tautulli.js) so a season binge counts toward the
// show once, not fragmented into per-episode entries. Movies have no parent,
// so they group by their own rating_key. No poster/thumb is resolved here —
// the Most Watched list is text-only (medal + title + play count), so there's
// no need to round-trip get_metadata per result the way an earlier version did.
function computeTopWatched(historyRows, limit = 3) {
  const groups = new Map();
  for (const r of historyRows) {
    const key = r.grandparent_rating_key || r.rating_key;
    if (!groups.has(key)) {
      groups.set(key, { title: r.grandparent_title || r.title, plays: 0 });
    }
    groups.get(key).plays += 1;
  }
  return [...groups.values()].sort((a, b) => b.plays - a.plays).slice(0, limit);
}

// 1-based position in a plays-sorted leaderboard, or null if this user isn't
// in it at all (e.g. zero plays in the window, so Tautulli never listed them).
function computeRank(topUsersRows, userId) {
  const idx = topUsersRows.findIndex(u => String(u.user_id) === String(userId));
  return idx === -1 ? null : idx + 1;
}

// Tautulli's get_plays_by_dayofweek/get_plays_by_hourofday share this same
// { categories: [...], series: [{ name, data: [...] }] } shape — this reads
// out just the Movies/TV series (Live TV is intentionally dropped; this
// deployment has no live sessions, so that series is always all-zero) and
// converts seconds to hours, rounded to one decimal for display.
function parseActivitySeries(categories, series) {
  const dataFor = name => series.find(s => s.name === name)?.data || [];
  const movies = dataFor('Movies');
  const tv = dataFor('TV');
  const toHours = secs => Math.round(((secs || 0) / 3600) * 10) / 10;
  return categories.map((label, i) => ({ label, movies: toHours(movies[i]), tv: toHours(tv[i]) }));
}

module.exports = { computeStreak, computeTopWatched, computeRank, parseActivitySeries };
