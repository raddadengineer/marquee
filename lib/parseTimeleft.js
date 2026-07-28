// SABnzbd and Radarr/Sonarr (see lib/sabnzbd.js and lib/downloadQueueIds.js)
// both report time remaining as an "hh:mm:ss" string — same .NET TimeSpan
// convention Radarr/Sonarr use, coincidentally matching SABnzbd's own format.
function parseTimeleft(hms) {
  if (!hms) return null;
  const parts = hms.split(':').map(Number);
  if (parts.some(Number.isNaN) || parts.length !== 3) return null;
  const [h, m, s] = parts;
  return h * 3600 + m * 60 + s;
}

module.exports = parseTimeleft;
