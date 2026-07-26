const axios = require('axios');
const WebSocket = require('ws');
const { imageUrl } = require('./plexImage');
const sse = require('./sse');

// Single source of truth for "now playing" state, shared by the REST endpoint and
// every connected SSE client. Kept fresh two ways:
//  - Plex pushes session state over its own notification WebSocket (play/pause/stop/
//    progress), so most updates never need to touch Tautulli at all.
//  - A full re-fetch from Tautulli (for friendly names, quality, stream info) happens
//    only when a session we don't recognize appears, or one disappears — plus a rare
//    safety-net refresh in case a Plex event was ever missed.
let cache = new Map(); // sessionKey -> mapped session (each carries its own durationMs)
// Tautulli's own aggregate (get_activity's total_bandwidth) — not just a sum
// of each session's own bandwidth field, since Tautulli already accounts for
// LAN vs WAN correctly there. Only updates on a real Tautulli refresh (the
// lightweight Plex-push path in handlePlexNotification has no bandwidth
// data), so it briefly lags a play/stop event by up to one refresh cycle.
let totalBandwidthKbps = 0;

let refreshInFlight = null;
let lastRefreshAt = 0;
const MIN_REFRESH_INTERVAL_MS = 2000;

function mapSession(s) {
  return {
    sessionKey: s.session_key,
    ratingKey: s.rating_key,
    title: s.grandparent_title ? `${s.grandparent_title} — ${s.title}` : s.title,
    subtitle: s.media_type === 'episode' ? `S${s.parent_media_index}E${s.media_index}` : s.year,
    overview: s.summary || '',
    user: s.friendly_name || s.user,
    thumb: imageUrl(s.thumb),
    art: imageUrl(s.art),
    progress: Number(s.progress_percent) || 0,
    state: s.state, // playing | paused | buffering
    quality: s.stream_video_full_resolution || s.video_full_resolution,
    durationMs: Number(s.duration) || 0,
    // Deliberately excludes ip_address/ip_address_public and email — this is shown
    // to any signed-in family member, not just the person streaming.
    stream: {
      player: s.player,
      product: s.product,
      platform: s.platform,
      decision: s.transcode_decision,
      originalResolution: s.video_full_resolution,
      streamResolution: s.stream_video_full_resolution,
      videoCodec: s.stream_video_codec,
      audioCodec: s.stream_audio_codec,
      audioChannels: s.stream_audio_channel_layout,
      container: s.stream_container,
      bitrateKbps: Number(s.stream_bitrate) || null,
      bandwidthKbps: Number(s.bandwidth) || null,
      location: s.location
    }
  };
}

function snapshot() {
  return { sessions: [...cache.values()], totalBandwidthKbps };
}

async function refresh() {
  if (refreshInFlight) return refreshInFlight;
  refreshInFlight = (async () => {
    try {
      const { data } = await axios.get(`${process.env.TAUTULLI_URL}/api/v2`, {
        params: { apikey: process.env.TAUTULLI_API_KEY, cmd: 'get_activity' }
      });
      const sessions = data.response.data.sessions || [];
      cache = new Map(sessions.map(s => [s.session_key, mapSession(s)]));
      totalBandwidthKbps = Number(data.response.data.total_bandwidth) || 0;
      sse.broadcast('full', snapshot());
    } catch (err) {
      console.error('now-playing refresh error:', err.code || err.response?.status, err.message);
    } finally {
      refreshInFlight = null;
    }
  })();
  return refreshInFlight;
}

function scheduleRefresh() {
  const now = Date.now();
  if (now - lastRefreshAt < MIN_REFRESH_INTERVAL_MS) return;
  lastRefreshAt = now;
  refresh();
}

function handlePlexNotification(sessionKey, state, viewOffset) {
  const known = cache.get(sessionKey);
  if (known && known.durationMs && state !== 'stopped') {
    // Exact, not approximate — duration doesn't change mid-session, so this needs
    // no round trip to Tautulli.
    known.state = state;
    known.progress = Math.round((viewOffset / known.durationMs) * 100);
    sse.broadcast('update', { sessionKey, state: known.state, progress: known.progress });
    return;
  }
  // A session we don't recognize (new stream) or one that just stopped — either
  // needs a real refresh to pick up friendly name/quality, or to drop it entirely.
  scheduleRefresh();
}

function connectPlexSocket() {
  const wsUrl = `${process.env.PLEX_SERVER_URL.replace(/^http/, 'ws')}/:/websockets/notifications?X-Plex-Token=${process.env.PLEX_ADMIN_TOKEN}`;
  const socket = new WebSocket(wsUrl);

  socket.on('open', () => console.log('now-playing: connected to Plex notifications'));

  socket.on('message', raw => {
    let msg;
    try { msg = JSON.parse(raw); } catch { return; }
    const notif = msg.NotificationContainer;
    if (!notif || notif.type !== 'playing') return;
    for (const n of notif.PlaySessionStateNotification || []) {
      handlePlexNotification(n.sessionKey, n.state, Number(n.viewOffset) || 0);
    }
  });

  socket.on('close', () => {
    console.error('now-playing: Plex notification socket closed, reconnecting in 5s');
    setTimeout(connectPlexSocket, 5000);
  });
  socket.on('error', err => {
    console.error('now-playing: Plex notification socket error:', err.message);
    socket.close();
  });
}

function start() {
  refresh();
  connectPlexSocket();
  // Doubles as the safety net for a missed Plex event and as how the header's
  // bandwidth figure stays reasonably current — that field only ever updates
  // on a real Tautulli refresh, never from the lightweight per-event Plex
  // push path (see handlePlexNotification), so this interval is the only
  // thing that notices bitrate drifting on an otherwise-unchanged session.
  setInterval(refresh, 10000);
}

function addClient(res) {
  sse.addClient(res);
  res.write(`event: full\ndata: ${JSON.stringify(snapshot())}\n\n`);
}

function removeClient(res) {
  sse.removeClient(res);
}

module.exports = { start, addClient, removeClient, getSnapshot: snapshot };
