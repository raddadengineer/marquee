const { test } = require('node:test');
const assert = require('node:assert/strict');
const { computeStatus } = require('../lib/notice');

test('no notice is "none"', () => {
  assert.equal(computeStatus(null, 1000), 'none');
});

test('no startsAt/endsAt means active immediately and forever', () => {
  assert.equal(computeStatus({ message: 'hi', startsAt: null, endsAt: null }, 1000), 'active');
});

test('before startsAt is "scheduled"', () => {
  assert.equal(computeStatus({ message: 'hi', startsAt: 2000, endsAt: null }, 1000), 'scheduled');
});

test('at or after startsAt (no end) is "active"', () => {
  assert.equal(computeStatus({ message: 'hi', startsAt: 1000, endsAt: null }, 1000), 'active');
  assert.equal(computeStatus({ message: 'hi', startsAt: 1000, endsAt: null }, 5000), 'active');
});

test('after endsAt is "expired"', () => {
  assert.equal(computeStatus({ message: 'hi', startsAt: null, endsAt: 1000 }, 1001), 'expired');
});

test('between startsAt and endsAt is "active"', () => {
  assert.equal(computeStatus({ message: 'hi', startsAt: 1000, endsAt: 2000 }, 1500), 'active');
});

test('exactly at endsAt is still "active", one ms later is "expired"', () => {
  assert.equal(computeStatus({ message: 'hi', startsAt: null, endsAt: 2000 }, 2000), 'active');
  assert.equal(computeStatus({ message: 'hi', startsAt: null, endsAt: 2000 }, 2001), 'expired');
});
