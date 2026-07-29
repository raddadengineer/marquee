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

module.exports = { classifyQueueRecord };
