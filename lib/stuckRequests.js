// Radarr/Sonarr's own wanted/missing list (see fetchMissingMovies/
// fetchMissingEpisodes in routes/owner.js) already filters to things that
// have actually released with no file — but a release from yesterday is
// often just still propagating across indexers/scene groups, not genuinely
// stuck. THRESHOLD_DAYS draws the line between "give it time" and "worth
// flagging as stuck rather than just missing."
const THRESHOLD_DAYS = 3;

function daysSince(dateStr, now) {
  return Math.floor((now - new Date(dateStr).getTime()) / 86400000);
}

// Annotates every item with how overdue it is and whether that crosses the
// stuck threshold, sorted most-overdue first — surfaces genuinely stuck
// releases at the top of the same list rather than a separate one.
function annotateAndSort(items, now = Date.now(), thresholdDays = THRESHOLD_DAYS) {
  return items
    .map(item => {
      const daysSinceRelease = daysSince(item.date, now);
      return { ...item, daysSinceRelease, stuck: daysSinceRelease >= thresholdDays };
    })
    .sort((a, b) => b.daysSinceRelease - a.daysSinceRelease);
}

module.exports = { annotateAndSort };
