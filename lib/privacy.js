// Sanitizes active streams, disk paths, user stats, and request lists according to admin privacy policies.

const DEFAULT_PRIVACY_CONFIG = {
  streamUserIdentity: 'full',          // 'full' | 'mask_usernames' | 'generic_labels' | 'hide_identity'
  customUserLabel: 'Family Member',     // string
  streamMediaContent: 'full_details',   // 'full_details' | 'show_name_only' | 'category_only' | 'blur_artwork'
  streamTechnical: 'full_technical',   // 'full_technical' | 'hide_network_ip' | 'hide_device_info' | 'hide_all_transcode' | 'custom'
  techShowIp: true,
  techShowDevice: true,
  techShowTranscode: true,
  techShowCodecs: true,
  techShowBitrate: true,
  techShowResolution: true,
  techShowReason: true,
  streamAllowSelfView: true,           // boolean
  streamOwnOnly: false,                // boolean
  systemMetrics: 'full_paths',         // 'full_paths' | 'mask_paths' | 'percent_only'
  hideSystemVersions: false,           // boolean
  statsLeaderboard: 'full_leaderboard',// 'full_leaderboard' | 'anonymous_leaderboard' | 'disable_leaderboard' | 'disable_mystats_tab'
  hideRequesterNames: false,           // boolean
  myRequestsOnly: false,               // boolean
  panelVisibility: {
    nowPlaying: true,
    topWatched: true,
    storage: true,
    grabStatus: true,
    recentlyAdded: true,
    airingToday: true,
    upcoming: true
  }
};

function getPrivacyConfigFromEnv() {
  const p = process.env;
  return {
    streamUserIdentity: p.PRIVACY_STREAM_USER_IDENTITY || 'full',
    customUserLabel: p.PRIVACY_CUSTOM_USER_LABEL || 'Family Member',
    streamMediaContent: p.PRIVACY_STREAM_MEDIA_CONTENT || 'full_details',
    streamTechnical: p.PRIVACY_STREAM_TECHNICAL || 'full_technical',
    techShowIp: p.PRIVACY_TECH_SHOW_IP !== 'false',
    techShowDevice: p.PRIVACY_TECH_SHOW_DEVICE !== 'false',
    techShowTranscode: p.PRIVACY_TECH_SHOW_TRANSCODE !== 'false',
    techShowCodecs: p.PRIVACY_TECH_SHOW_CODECS !== 'false',
    techShowBitrate: p.PRIVACY_TECH_SHOW_BITRATE !== 'false',
    techShowResolution: p.PRIVACY_TECH_SHOW_RESOLUTION !== 'false',
    techShowReason: p.PRIVACY_TECH_SHOW_REASON !== 'false',
    streamAllowSelfView: p.PRIVACY_STREAM_ALLOW_SELF_VIEW !== 'false',
    streamOwnOnly: p.PRIVACY_STREAM_OWN_ONLY === 'true',
    systemMetrics: p.PRIVACY_SYSTEM_METRICS || 'full_paths',
    hideSystemVersions: p.PRIVACY_HIDE_SYSTEM_VERSIONS === 'true',
    statsLeaderboard: p.PRIVACY_STATS || 'full_leaderboard',
    hideRequesterNames: p.PRIVACY_HIDE_REQUESTER === 'true',
    myRequestsOnly: p.PRIVACY_MY_REQUESTS_ONLY === 'true',
    panelVisibility: {
      nowPlaying: p.VISIBILITY_NOW_PLAYING !== 'false',
      topWatched: p.VISIBILITY_TOP_WATCHED !== 'false',
      storage: p.VISIBILITY_STORAGE !== 'false',
      grabStatus: p.VISIBILITY_GRAB_STATUS !== 'false',
      recentlyAdded: p.VISIBILITY_RECENTLY_ADDED !== 'false',
      airingToday: p.VISIBILITY_AIRING_TODAY !== 'false',
      upcoming: p.VISIBILITY_UPCOMING !== 'false'
    }
  };
}

function maskUsername(name) {
  if (!name || typeof name !== 'string') return 'User ***';
  if (name.length <= 2) return name[0] + '***';
  return name[0] + '***' + name[name.length - 1];
}

function sanitizeSession(session, requestingUser, config = getPrivacyConfigFromEnv()) {
  if (!session) return session;
  if (requestingUser?.isOwner) return session;

  const isSelf = requestingUser?.username && session.user === requestingUser.username;
  if (isSelf && config.streamAllowSelfView) return session;

  if (config.streamOwnOnly && !isSelf) return null;

  const s = { ...session };

  // 1. User identity
  if (config.streamUserIdentity === 'mask_usernames') {
    s.user = maskUsername(session.user);
  } else if (config.streamUserIdentity === 'generic_labels') {
    s.user = config.customUserLabel || 'Family Member';
    delete s.thumb;
    delete s.userThumb;
  } else if (config.streamUserIdentity === 'hide_identity') {
    delete s.user;
    delete s.thumb;
    delete s.userThumb;
  }

  // 2. Media content
  if (config.streamMediaContent === 'show_name_only' && (session.show || session.grandparentTitle)) {
    s.title = session.show || session.grandparentTitle || session.title;
    delete s.episodeTitle;
    delete s.parentTitle;
    delete s.grandparentTitle;
  } else if (config.streamMediaContent === 'category_only') {
    s.title = session.mediaType === 'movie' ? 'Watching a Movie' : 'Watching a TV Show';
    delete s.episodeTitle;
    delete s.parentTitle;
    delete s.grandparentTitle;
  }
  if (config.streamMediaContent === 'blur_artwork') {
    s.blurArtwork = true;
  }

  // 3. Technical details
  if (config.streamTechnical === 'hide_network_ip' || !config.techShowIp) {
    delete s.ipAddress;
    delete s.location;
  }
  if (config.streamTechnical === 'hide_device_info' || !config.techShowDevice) {
    delete s.player;
    delete s.platform;
    delete s.device;
  }
  if (config.streamTechnical === 'hide_all_transcode') {
    delete s.ipAddress;
    delete s.location;
    delete s.player;
    delete s.platform;
    delete s.device;
    delete s.transcodeDecision;
    delete s.videoDecision;
    delete s.audioDecision;
    delete s.bitrate;
    delete s.resolution;
  } else {
    if (!config.techShowTranscode) delete s.transcodeDecision;
    if (!config.techShowCodecs) { delete s.videoDecision; delete s.audioDecision; delete s.videoCodec; delete s.audioCodec; }
    if (!config.techShowBitrate) { delete s.bitrate; delete s.bandwidth; }
    if (!config.techShowResolution) delete s.resolution;
    if (!config.techShowReason) delete s.transcodeReason;
  }

  return s;
}

function sanitizeDiskspace(diskspaceList, requestingUser, config = getPrivacyConfigFromEnv()) {
  if (!Array.isArray(diskspaceList)) return diskspaceList;
  if (requestingUser?.isOwner) return diskspaceList;

  return diskspaceList.map((d, i) => {
    const item = { ...d };
    if (config.systemMetrics === 'mask_paths') {
      item.label = `Volume ${i + 1}`;
    } else if (config.systemMetrics === 'percent_only') {
      item.label = `Volume ${i + 1}`;
      delete item.sizeBytes;
      delete item.freeBytes;
      delete item.usedBytes;
      delete item.sizeFormatted;
      delete item.freeFormatted;
    }
    return item;
  });
}

function sanitizeLeaderboard(topList, requestingUser, config = getPrivacyConfigFromEnv()) {
  if (!Array.isArray(topList)) return topList;
  if (requestingUser?.isOwner) return topList;

  if (config.statsLeaderboard === 'disable_leaderboard') return [];

  if (config.statsLeaderboard === 'anonymous_leaderboard') {
    return topList.map((u, i) => ({
      ...u,
      username: `User #${i + 1}`,
      user_id: null,
      thumb: null
    }));
  }

  return topList;
}

module.exports = {
  DEFAULT_PRIVACY_CONFIG,
  getPrivacyConfigFromEnv,
  maskUsername,
  sanitizeSession,
  sanitizeDiskspace,
  sanitizeLeaderboard
};
