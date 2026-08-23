const test = require('node:test');
const assert = require('node:assert');
const {
  maskUsername,
  sanitizeSession,
  sanitizeDiskspace,
  sanitizeLeaderboard,
  DEFAULT_PRIVACY_CONFIG
} = require('../lib/privacy');

test('maskUsername masks usernames cleanly', () => {
  assert.strictEqual(maskUsername('JohnDoe'), 'J***e');
  assert.strictEqual(maskUsername('Al'), 'A***');
  assert.strictEqual(maskUsername(''), 'User ***');
  assert.strictEqual(maskUsername(null), 'User ***');
});

test('sanitizeSession lets owner see 100% full un-obfuscated details', () => {
  const session = { user: 'Alice', title: 'The Matrix', bitrate: 15000, ipAddress: '192.168.1.50' };
  const owner = { isOwner: true, username: 'Owner' };
  const config = { ...DEFAULT_PRIVACY_CONFIG, streamUserIdentity: 'mask_usernames' };
  const result = sanitizeSession(session, owner, config);
  assert.deepStrictEqual(result, session);
});

test('sanitizeSession masks username for non-owner when mask_usernames is active', () => {
  const session = { user: 'BobSmith', title: 'Inception' };
  const nonOwner = { isOwner: false, username: 'Carol' };
  const config = { ...DEFAULT_PRIVACY_CONFIG, streamUserIdentity: 'mask_usernames' };
  const result = sanitizeSession(session, nonOwner, config);
  assert.strictEqual(result.user, 'B***h');
  assert.strictEqual(result.title, 'Inception');
});

test('sanitizeSession replaces username with generic label when generic_labels is active', () => {
  const session = { user: 'Dave', thumb: 'https://avatar.jpg', title: 'Avatar' };
  const nonOwner = { isOwner: false, username: 'Carol' };
  const config = { ...DEFAULT_PRIVACY_CONFIG, streamUserIdentity: 'generic_labels' };
  const result = sanitizeSession(session, nonOwner, config);
  assert.strictEqual(result.user, 'Family Member');
  assert.strictEqual(result.thumb, undefined);
});

test('sanitizeSession hides media title when category_only is active', () => {
  const session = { user: 'Dave', mediaType: 'movie', title: 'Interstellar' };
  const nonOwner = { isOwner: false, username: 'Carol' };
  const config = { ...DEFAULT_PRIVACY_CONFIG, streamMediaContent: 'category_only' };
  const result = sanitizeSession(session, nonOwner, config);
  assert.strictEqual(result.title, 'Watching a Movie');
});

test('sanitizeSession strips transcode details when hide_all_transcode is active', () => {
  const session = { user: 'Dave', bitrate: 12000, transcodeDecision: 'transcode', player: 'Plex Web' };
  const nonOwner = { isOwner: false, username: 'Carol' };
  const config = { ...DEFAULT_PRIVACY_CONFIG, streamTechnical: 'hide_all_transcode' };
  const result = sanitizeSession(session, nonOwner, config);
  assert.strictEqual(result.bitrate, undefined);
  assert.strictEqual(result.transcodeDecision, undefined);
  assert.strictEqual(result.player, undefined);
});

test('sanitizeSession allows self view un-obfuscated when streamAllowSelfView is true', () => {
  const session = { user: 'Carol', title: 'Batman' };
  const selfUser = { isOwner: false, username: 'Carol' };
  const config = { ...DEFAULT_PRIVACY_CONFIG, streamUserIdentity: 'mask_usernames', streamAllowSelfView: true };
  const result = sanitizeSession(session, selfUser, config);
  assert.strictEqual(result.user, 'Carol');
});

test('sanitizeDiskspace masks paths when mask_paths is configured', () => {
  const diskspace = [
    { label: '/mnt/user/data/media', freeBytes: 100 },
    { label: '/mnt/user/downloads', freeBytes: 200 }
  ];
  const nonOwner = { isOwner: false };
  const config = { ...DEFAULT_PRIVACY_CONFIG, systemMetrics: 'mask_paths' };
  const result = sanitizeDiskspace(diskspace, nonOwner, config);
  assert.strictEqual(result[0].label, 'Volume 1');
  assert.strictEqual(result[1].label, 'Volume 2');
});

test('sanitizeLeaderboard anonymizes top users when anonymous_leaderboard is configured', () => {
  const topUsers = [
    { username: 'Alice', plays: 40 },
    { username: 'Bob', plays: 30 }
  ];
  const nonOwner = { isOwner: false };
  const config = { ...DEFAULT_PRIVACY_CONFIG, statsLeaderboard: 'anonymous_leaderboard' };
  const result = sanitizeLeaderboard(topUsers, nonOwner, config);
  assert.strictEqual(result[0].username, 'User #1');
  assert.strictEqual(result[1].username, 'User #2');
});
