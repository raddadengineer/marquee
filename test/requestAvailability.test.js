const { test } = require('node:test');
const assert = require('node:assert/strict');
const { computeAvailability } = require('../lib/requestAvailability');

test('a declined request is always declined, regardless of media/queue state', () => {
  assert.equal(computeAvailability({ requestStatus: 3, mediaStatus: 5, inQueue: true }), 'declined');
});

test('available/partially-available media wins even over a pending-approval request', () => {
  assert.equal(computeAvailability({ requestStatus: 1, mediaStatus: 4, inQueue: false }), 'available');
  assert.equal(computeAvailability({ requestStatus: 2, mediaStatus: 5, inQueue: false }), 'available');
});

test('a not-yet-approved request shows as pending', () => {
  assert.equal(computeAvailability({ requestStatus: 1, mediaStatus: 1, inQueue: false }), 'pending');
});

test('an approved request only shows downloading when actually in the *arr queue', () => {
  assert.equal(computeAvailability({ requestStatus: 2, mediaStatus: 3, inQueue: true }), 'downloading');
});

test('regression: approved + Overseerr PROCESSING but nothing in the real queue is "approved", not "downloading"', () => {
  // Confirmed live against Clayface (releases 2027, empty Radarr queue) — Overseerr
  // marks media PROCESSING (3) the instant a request is approved, whether or not
  // anything can actually be grabbed yet.
  assert.equal(computeAvailability({ requestStatus: 2, mediaStatus: 3, inQueue: false }), 'approved');
});

test('an approved request with no media status info yet still resolves to approved, not downloading', () => {
  assert.equal(computeAvailability({ requestStatus: 2, mediaStatus: undefined, inQueue: false }), 'approved');
});
