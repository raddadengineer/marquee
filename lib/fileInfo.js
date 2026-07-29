// Trims a Radarr movieFile / Sonarr episodeFile object down to what the
// "current file" info step needs — same shape from both since they share the
// same underlying quality/mediaInfo structure.
function mapFileInfo(f) {
  if (!f) return null;
  return {
    quality: f.quality?.quality?.name || null,
    size: f.size ?? null,
    resolution: f.mediaInfo?.resolution || null,
    videoCodec: f.mediaInfo?.videoCodec || null,
    audioCodec: f.mediaInfo?.audioCodec || null,
    releaseGroup: f.releaseGroup || null,
    dateAdded: f.dateAdded || null
  };
}

module.exports = { mapFileInfo };
