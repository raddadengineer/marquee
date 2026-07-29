const { test } = require('node:test');
const assert = require('node:assert/strict');
const { mapDiscoverItem } = require('../lib/overseerrClient');

test('mapDiscoverItem marks partially/fully available media as available', () => {
  for (const status of [4, 5]) {
    const item = mapDiscoverItem({ id: 1, mediaType: 'movie', title: 'A Movie', mediaInfo: { status } });
    assert.equal(item.availability, 'available');
  }
});

test('mapDiscoverItem marks pending/processing media as requested', () => {
  for (const status of [2, 3]) {
    const item = mapDiscoverItem({ id: 1, mediaType: 'movie', title: 'A Movie', mediaInfo: { status } });
    assert.equal(item.availability, 'requested');
  }
});

test('mapDiscoverItem marks untouched or unknown media as none', () => {
  assert.equal(mapDiscoverItem({ id: 1, mediaType: 'movie', title: 'A Movie' }).availability, 'none');
  assert.equal(mapDiscoverItem({ id: 1, mediaType: 'movie', title: 'A Movie', mediaInfo: { status: 1 } }).availability, 'none');
});

test('mapDiscoverItem falls back from title to name (tv detail responses use name)', () => {
  assert.equal(mapDiscoverItem({ id: 1, name: 'A Show' }).title, 'A Show');
  assert.equal(mapDiscoverItem({ id: 1, title: 'A Movie', name: 'ignored' }).title, 'A Movie');
});

test('mapDiscoverItem derives year from releaseDate or firstAirDate', () => {
  assert.equal(mapDiscoverItem({ id: 1, releaseDate: '2026-07-24' }).year, '2026');
  assert.equal(mapDiscoverItem({ id: 1, firstAirDate: '2019-01-05' }).year, '2019');
  assert.equal(mapDiscoverItem({ id: 1 }).year, '');
});

test('mapDiscoverItem builds a TMDB poster URL only when posterPath is present', () => {
  assert.equal(mapDiscoverItem({ id: 1, posterPath: '/abc.jpg' }).poster, 'https://image.tmdb.org/t/p/w300/abc.jpg');
  assert.equal(mapDiscoverItem({ id: 1 }).poster, null);
});
