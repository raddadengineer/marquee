const { test } = require('node:test');
const assert = require('node:assert/strict');
const { extractTmdbId } = require('../lib/guid');

test('extractTmdbId finds a tmdb:// entry among mixed guids', () => {
  assert.equal(extractTmdbId(['imdb://tt1234567', 'tmdb://949838', 'tvdb://374854']), 949838);
});

test('extractTmdbId returns null when no tmdb guid is present', () => {
  assert.equal(extractTmdbId(['imdb://tt1234567', 'tvdb://374854']), null);
});

test('extractTmdbId returns null for an empty or missing list', () => {
  assert.equal(extractTmdbId([]), null);
  assert.equal(extractTmdbId(undefined), null);
  assert.equal(extractTmdbId(null), null);
});
