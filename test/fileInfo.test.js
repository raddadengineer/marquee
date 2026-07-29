const { test } = require('node:test');
const assert = require('node:assert/strict');
const { mapFileInfo } = require('../lib/fileInfo');

test('mapFileInfo returns null when there is no file', () => {
  assert.equal(mapFileInfo(null), null);
  assert.equal(mapFileInfo(undefined), null);
});

test('mapFileInfo trims a real Radarr/Sonarr file object down to display fields', () => {
  const result = mapFileInfo({
    size: 6422111149,
    dateAdded: '2026-02-03T17:51:10Z',
    releaseGroup: 'RiPER',
    quality: { quality: { name: 'WEBDL-1080p' } },
    mediaInfo: { resolution: '1920x1080', videoCodec: 'h264', audioCodec: 'EAC3' }
  });
  assert.deepEqual(result, {
    quality: 'WEBDL-1080p',
    size: 6422111149,
    resolution: '1920x1080',
    videoCodec: 'h264',
    audioCodec: 'EAC3',
    releaseGroup: 'RiPER',
    dateAdded: '2026-02-03T17:51:10Z'
  });
});

test('mapFileInfo fills in nulls for missing nested fields instead of throwing', () => {
  const result = mapFileInfo({ size: 100 });
  assert.equal(result.quality, null);
  assert.equal(result.resolution, null);
  assert.equal(result.videoCodec, null);
  assert.equal(result.audioCodec, null);
  assert.equal(result.releaseGroup, null);
  assert.equal(result.dateAdded, null);
  assert.equal(result.size, 100);
});
