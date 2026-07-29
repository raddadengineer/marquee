const parseTimeleft = require('./parseTimeleft');

// Classifies a single Radarr/Sonarr queue record into the stage the
// post-grab tracking UI shows. Uses the same trackedDownloadStatus/status
// fields the existing Import Issues queue endpoint already keys off — this
// just maps them into a friendlier state machine (downloading -> importing
// -> done/failed) shown live on the row that was just grabbed, instead of
// only surfacing a problem after the fact in a separate panel.
function classifyQueueRecord(rec) {
  if (rec.trackedDownloadStatus && rec.trackedDownloadStatus !== 'ok') {
    return {
      stage: 'failed',
      reason: (rec.statusMessages || []).flatMap(s => s.messages || []).join('; ') || rec.errorMessage || 'Import issue',
      downloadId: rec.downloadId || null
    };
  }
  // The download itself is done but Radarr/Sonarr hasn't run its import pass
  // yet — a normal, usually brief, in-between state, not a problem.
  if (rec.status === 'completed') {
    return { stage: 'importing' };
  }
  const progress = rec.size ? Math.round(((rec.size - rec.sizeleft) / rec.size) * 100) : null;
  return { stage: 'downloading', progress, eta: parseTimeleft(rec.timeleft) };
}

// A file already existing when grab-status is polled isn't automatically
// confirmation THIS grab succeeded — the whole point of the "resolve an
// issue" flow is replacing a file that's already there, so hasFile is true
// both before and after a real replace. Only treat it as done once the
// file's own dateAdded is at/after the grab's start time — sinceMs is
// captured client-side the moment the grab was fired, with a small buffer
// for clock skew between this server and Radarr/Sonarr's own host clock.
const CLOCK_SKEW_BUFFER_MS = 10000;
function isFileFromThisGrab(file, sinceMs) {
  if (!sinceMs) return true; // no baseline given (e.g. an older caller) — can't tell, assume yes
  if (!file?.dateAdded) return false;
  return new Date(file.dateAdded).getTime() >= sinceMs - CLOCK_SKEW_BUFFER_MS;
}

module.exports = { classifyQueueRecord, isFileFromThisGrab };
