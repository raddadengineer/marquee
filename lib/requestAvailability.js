// Four different things worth showing distinctly for a family member's own
// request: whether the request itself needs approval (requestStatus: 1
// pending, 2 approved, 3 declined), whether the underlying media is actually
// available yet (mediaStatus: 4/5 = available), whether it's genuinely
// sitting in Radarr/Sonarr's download queue right now, or whether it's just
// approved with nothing actually happening yet. That last case matters:
// Overseerr sets mediaStatus to PROCESSING the instant a request is approved
// and handed off, even for a movie that hasn't been released yet and has no
// release to grab — confirmed live (Clayface, releases 2027, empty Radarr
// queue) showing as "Downloading" — so PROCESSING alone can't be trusted as
// "downloading"; only actual presence in the *arr queue can.
function computeAvailability({ requestStatus, mediaStatus, inQueue }) {
  if (requestStatus === 3) return 'declined';
  if ([4, 5].includes(mediaStatus)) return 'available';
  if (requestStatus === 1) return 'pending';
  if (inQueue) return 'downloading';
  return 'approved';
}

module.exports = { computeAvailability };
