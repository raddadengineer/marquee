const { test } = require('node:test');
const assert = require('node:assert/strict');
const { computeStreak, computeTopWatched, computeRank } = require('../lib/myStats');

const NOW = new Date('2026-07-27T18:00:00Z').getTime(); // a Monday, 18:00 UTC
const daysAgoTs = n => Math.floor((NOW - n * 86400000) / 1000); // Tautulli's `date` is unix seconds

test('computeStreak counts today + consecutive prior days when today already has a play', () => {
  const rows = [{ date: daysAgoTs(0) }, { date: daysAgoTs(1) }, { date: daysAgoTs(2) }];
  assert.equal(computeStreak(rows, NOW), 3);
});

test('computeStreak still counts an ongoing streak when today has no plays yet', () => {
  const rows = [{ date: daysAgoTs(1) }, { date: daysAgoTs(2) }];
  assert.equal(computeStreak(rows, NOW), 2);
});

test('computeStreak stops at the first gap', () => {
  const rows = [{ date: daysAgoTs(0) }, { date: daysAgoTs(1) }, { date: daysAgoTs(5) }];
  assert.equal(computeStreak(rows, NOW), 2);
});

test('computeStreak is 0 when neither today nor yesterday has a play', () => {
  const rows = [{ date: daysAgoTs(3) }];
  assert.equal(computeStreak(rows, NOW), 0);
});

test('computeStreak is 0 for no history at all', () => {
  assert.equal(computeStreak([], NOW), 0);
});

test('computeTopWatched groups episodes under their show and counts each play', () => {
  const rows = [
    { grandparent_rating_key: 10, grandparent_title: 'Hana-Kimi' },
    { grandparent_rating_key: 10, grandparent_title: 'Hana-Kimi' },
    { rating_key: 20, title: 'Supergirl' }
  ];
  const result = computeTopWatched(rows);
  assert.deepEqual(result, [
    { ratingKey: 10, title: 'Hana-Kimi', plays: 2 },
    { ratingKey: 20, title: 'Supergirl', plays: 1 }
  ]);
});

test('computeTopWatched sorts by plays descending and respects the limit', () => {
  const rows = [
    { rating_key: 1, title: 'A' },
    { rating_key: 2, title: 'B' }, { rating_key: 2, title: 'B' },
    { rating_key: 3, title: 'C' }, { rating_key: 3, title: 'C' }, { rating_key: 3, title: 'C' }
  ];
  const result = computeTopWatched(rows, 2);
  assert.deepEqual(result.map(r => r.title), ['C', 'B']);
});

test('computeRank finds a 1-based position by user_id', () => {
  const rows = [{ user_id: 5, total_plays: 40 }, { user_id: 9, total_plays: 22 }, { user_id: 3, total_plays: 10 }];
  assert.equal(computeRank(rows, 9), 2);
  assert.equal(computeRank(rows, '3'), 3);
});

test('computeRank returns null when the user has no plays in the window', () => {
  const rows = [{ user_id: 5, total_plays: 40 }];
  assert.equal(computeRank(rows, 99), null);
});
