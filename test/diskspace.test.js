const { test } = require('node:test');
const assert = require('node:assert/strict');
const { groupByTotal, shortestLabelRows, combinedLabelRows } = require('../lib/diskspace');

test('groupByTotal collapses multiple mounts sharing the same total capacity into one group', () => {
  const result = groupByTotal([
    { label: 'movies', totalBytes: 100, freeBytes: 40 },
    { label: 'tv', totalBytes: 100, freeBytes: 40 },
    { label: 'tv2', totalBytes: 200, freeBytes: 80 }
  ]);
  assert.equal(result.length, 2);
});

test('shortestLabelRows picks the shortest label as the representative (Radarr/Sonarr mount-path fallback)', () => {
  const result = shortestLabelRows([
    { label: '/downloads/completed', totalBytes: 100, freeBytes: 40 },
    { label: '/config', totalBytes: 100, freeBytes: 40 },
    { label: '/', totalBytes: 100, freeBytes: 40 }
  ]);
  assert.equal(result.length, 1);
  assert.equal(result[0].path, '/');
});

test('combinedLabelRows joins every share name sharing a volume instead of hiding all but one', () => {
  const result = combinedLabelRows([
    { label: 'workouts', totalBytes: 100, freeBytes: 40 },
    { label: 'movies', totalBytes: 100, freeBytes: 38 },
    { label: 'tv', totalBytes: 100, freeBytes: 40 }
  ]);
  assert.equal(result.length, 1);
  assert.equal(result[0].path, 'movies, tv, workouts');
  // Minimum across the group, not an arbitrary member's.
  assert.equal(result[0].freeBytes, 38);
});

test('combinedLabelRows keeps genuinely different volumes separate', () => {
  const result = combinedLabelRows([
    { label: 'movies', totalBytes: 100, freeBytes: 40 },
    { label: 'tv2', totalBytes: 200, freeBytes: 80 }
  ]);
  assert.equal(result.length, 2);
});

test('rows compute usedPercent and sort by free space ascending', () => {
  const result = combinedLabelRows([
    { label: 'roomy', totalBytes: 2000, freeBytes: 1800 },
    { label: 'tight', totalBytes: 1000, freeBytes: 100 }
  ]);
  assert.deepEqual(result.map(r => r.path), ['tight', 'roomy']);
  assert.equal(result[0].usedPercent, 90);
  assert.equal(result[1].usedPercent, 10);
});

test('rows treat zero total capacity as 0% used rather than dividing by zero', () => {
  const result = combinedLabelRows([{ label: 'empty', totalBytes: 0, freeBytes: 0 }]);
  assert.equal(result[0].usedPercent, 0);
});
