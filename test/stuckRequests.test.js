const { test } = require('node:test');
const assert = require('node:assert/strict');
const { annotateAndSort } = require('../lib/stuckRequests');

const NOW = new Date('2026-07-27T12:00:00Z').getTime();
const daysAgo = n => new Date(NOW - n * 86400000).toISOString();

test('annotateAndSort marks items under the threshold as not stuck', () => {
  const result = annotateAndSort([{ title: 'Fresh', date: daysAgo(1) }], NOW, 3);
  assert.equal(result[0].daysSinceRelease, 1);
  assert.equal(result[0].stuck, false);
});

test('annotateAndSort marks items at or past the threshold as stuck', () => {
  const result = annotateAndSort([{ title: 'Overdue', date: daysAgo(5) }], NOW, 3);
  assert.equal(result[0].daysSinceRelease, 5);
  assert.equal(result[0].stuck, true);
});

test('annotateAndSort sorts most-overdue first, keeping fresh items in the same list', () => {
  const result = annotateAndSort([
    { title: 'A', date: daysAgo(1) },
    { title: 'B', date: daysAgo(10) },
    { title: 'C', date: daysAgo(6) }
  ], NOW, 3);
  assert.deepEqual(result.map(r => r.title), ['B', 'C', 'A']);
  assert.deepEqual(result.map(r => r.stuck), [true, true, false]);
});

test('annotateAndSort defaults to a 3-day threshold', () => {
  const result = annotateAndSort([{ title: 'Exactly at default', date: daysAgo(3) }], NOW);
  assert.equal(result[0].stuck, true);
});
