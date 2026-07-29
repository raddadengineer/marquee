// Radarr/Sonarr both report every mount point their own container sees —
// multiple root folders routinely point at the same underlying physical
// volume, so grouping by total capacity is how this collapses those down to
// one row per actual volume.
function groupByTotal(volumes) {
  const groups = new Map();
  for (const v of volumes) {
    const key = v.totalBytes;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(v);
  }
  return [...groups.values()];
}

function toDisplayRows(rows) {
  return rows
    .map(v => ({
      path: v.label,
      freeBytes: v.freeBytes,
      totalBytes: v.totalBytes,
      usedPercent: v.totalBytes ? Math.round((1 - v.freeBytes / v.totalBytes) * 100) : 0
    }))
    .sort((a, b) => a.freeBytes - b.freeBytes);
}

// Radarr/Sonarr fallback: labels are container mount-point paths ("/",
// "/config", "/downloads/completed") — implementation detail, not something
// worth showing all of. The shortest one reads as the cleanest generic
// description of the volume ("/" over "/config").
function shortestLabelRows(volumes) {
  const rows = groupByTotal(volumes).map(group =>
    group.reduce((a, b) => (b.label.length < a.label.length ? b : a))
  );
  return toDisplayRows(rows);
}

// Real media-storage source: each label is a share name the user actually
// recognizes (movies, tv, comics...) — combining them makes it clear which
// shares live on the same physical volume, instead of one name silently
// hiding the others. Free space is the minimum across the group rather than
// an arbitrary member's — a small, conservative floor if it drifts between
// shares queried a moment apart, same reasoning as the old exact-match issue
// this dedup was built to avoid.
function combinedLabelRows(volumes) {
  const rows = groupByTotal(volumes).map(group => {
    const sorted = [...group].sort((a, b) => a.label.localeCompare(b.label));
    return {
      label: sorted.map(v => v.label).join(', '),
      totalBytes: sorted[0].totalBytes,
      freeBytes: Math.min(...sorted.map(v => v.freeBytes))
    };
  });
  return toDisplayRows(rows);
}

module.exports = { groupByTotal, shortestLabelRows, combinedLabelRows };
