const { test } = require('node:test');
const assert = require('node:assert/strict');
const { maxEtaById } = require('../lib/downloadQueueIds');

test('maxEtaById parses hh:mm:ss timeleft into seconds', () => {
  const result = maxEtaById([{ movieId: 1, timeleft: '01:02:03' }], 'movieId');
  assert.equal(result.get(1), 3723);
});

test('maxEtaById takes the max eta across multiple records sharing an id (season pack)', () => {
  const result = maxEtaById([
    { seriesId: 5, timeleft: '00:10:00' },
    { seriesId: 5, timeleft: '00:45:00' },
    { seriesId: 5, timeleft: '00:20:00' }
  ], 'seriesId');
  assert.equal(result.get(5), 2700);
});

test('maxEtaById ignores records with no parseable timeleft rather than treating them as 0', () => {
  const result = maxEtaById([
    { movieId: 2, timeleft: null },
    { movieId: 2, timeleft: '' },
    { movieId: 2, timeleft: 'garbage' }
  ], 'movieId');
  assert.equal(result.has(2), false);
});

test('maxEtaById keeps separate ids independent', () => {
  const result = maxEtaById([
    { movieId: 1, timeleft: '00:05:00' },
    { movieId: 2, timeleft: '00:15:00' }
  ], 'movieId');
  assert.equal(result.get(1), 300);
  assert.equal(result.get(2), 900);
});
