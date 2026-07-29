const { test } = require('node:test');
const assert = require('node:assert/strict');
const { mapTorrentDetails } = require('../lib/qbittorrent');

test('mapTorrentDetails trims a real qBittorrent properties+files response down to display fields', () => {
  const props = {
    seeds: 12, seeds_total: 40,
    peers: 3, peers_total: 8,
    nb_connections: 5, nb_connections_limit: 200,
    dl_speed: 2048000, up_speed: 512000,
    eta: 900,
    share_ratio: 1.5,
    total_size: 5000000000,
    total_downloaded: 2500000000,
    total_uploaded: 1000000000,
    save_path: '/downloads/movies',
    addition_date: 1780000000
  };
  const files = [
    { name: 'Movie.mkv', size: 4900000000, progress: 0.5, priority: 1 },
    { name: 'Movie.nfo', size: 1200, progress: 1, priority: 1 }
  ];
  const result = mapTorrentDetails(props, files);
  assert.equal(result.seeds, 12);
  assert.equal(result.seedsTotal, 40);
  assert.equal(result.peers, 3);
  assert.equal(result.peersTotal, 8);
  assert.equal(result.connections, 5);
  assert.equal(result.connectionsLimit, 200);
  assert.equal(result.downloadSpeedKbps, 2000);
  assert.equal(result.uploadSpeedKbps, 500);
  assert.equal(result.etaSeconds, 900);
  assert.equal(result.ratio, 1.5);
  assert.equal(result.sizeBytes, 5000000000);
  assert.equal(result.downloadedBytes, 2500000000);
  assert.equal(result.uploadedBytes, 1000000000);
  assert.equal(result.savePath, '/downloads/movies');
  assert.equal(result.addedAt, new Date(1780000000 * 1000).toISOString());
  assert.deepEqual(result.files, [
    { name: 'Movie.mkv', sizeBytes: 4900000000, progress: 50, priority: 1 },
    { name: 'Movie.nfo', sizeBytes: 1200, progress: 100, priority: 1 }
  ]);
});

test('mapTorrentDetails treats the 100-day sentinel as no ETA, same as the queue-list mapping', () => {
  const result = mapTorrentDetails({ eta: 8640000 }, []);
  assert.equal(result.etaSeconds, null);
});

test('mapTorrentDetails fills in defaults for missing fields instead of throwing', () => {
  const result = mapTorrentDetails({}, undefined);
  assert.equal(result.seeds, 0);
  assert.equal(result.ratio, null);
  assert.equal(result.savePath, null);
  assert.equal(result.addedAt, null);
  assert.deepEqual(result.files, []);
});
