const { test } = require('node:test');
const assert = require('node:assert/strict');
const { classifyQueueRecord, isFileFromThisGrab } = require('../lib/grabStatus');

test('classifyQueueRecord reports failed with the joined statusMessages when tracked status is not ok', () => {
  const rec = {
    trackedDownloadStatus: 'warning',
    statusMessages: [{ title: 'x', messages: ['TheXEM needs manual input.'] }],
    downloadId: 'abc-123'
  };
  const result = classifyQueueRecord(rec);
  assert.equal(result.stage, 'failed');
  assert.equal(result.reason, 'TheXEM needs manual input.');
  assert.equal(result.downloadId, 'abc-123');
});

test('classifyQueueRecord falls back to errorMessage when statusMessages is empty', () => {
  const rec = { trackedDownloadStatus: 'error', statusMessages: [], errorMessage: 'Disk full' };
  const result = classifyQueueRecord(rec);
  assert.equal(result.stage, 'failed');
  assert.equal(result.reason, 'Disk full');
});

test('classifyQueueRecord falls back to a generic reason when nothing else is given', () => {
  const rec = { trackedDownloadStatus: 'warning' };
  const result = classifyQueueRecord(rec);
  assert.equal(result.stage, 'failed');
  assert.equal(result.reason, 'Import issue');
});

test('classifyQueueRecord reports importing once the download itself is complete', () => {
  const rec = { trackedDownloadStatus: 'ok', status: 'completed', size: 1000, sizeleft: 0 };
  assert.deepEqual(classifyQueueRecord(rec), { stage: 'importing' });
});

test('classifyQueueRecord reports downloading with progress and eta while still in progress', () => {
  const rec = { trackedDownloadStatus: 'ok', status: 'downloading', size: 1000, sizeleft: 400, timeleft: '00:05:30' };
  const result = classifyQueueRecord(rec);
  assert.equal(result.stage, 'downloading');
  assert.equal(result.progress, 60);
  assert.equal(result.eta, 330);
});

test('classifyQueueRecord handles a missing size gracefully (no progress rather than a crash)', () => {
  const rec = { trackedDownloadStatus: 'ok', status: 'downloading', size: 0, sizeleft: 0 };
  const result = classifyQueueRecord(rec);
  assert.equal(result.stage, 'downloading');
  assert.equal(result.progress, null);
});

test('isFileFromThisGrab assumes yes when no baseline was given', () => {
  assert.equal(isFileFromThisGrab({ dateAdded: '2020-01-01T00:00:00Z' }, 0), true);
});

test('isFileFromThisGrab rejects a file that predates the grab — the "replace a bad file" case', () => {
  const sinceMs = new Date('2026-07-29T12:00:00Z').getTime();
  const file = { dateAdded: '2026-07-01T00:00:00Z' }; // the old file already on disk, unrelated to this grab
  assert.equal(isFileFromThisGrab(file, sinceMs), false);
});

test('isFileFromThisGrab accepts a file added after the grab started', () => {
  const sinceMs = new Date('2026-07-29T12:00:00Z').getTime();
  const file = { dateAdded: '2026-07-29T12:00:05Z' };
  assert.equal(isFileFromThisGrab(file, sinceMs), true);
});

test('isFileFromThisGrab tolerates a small amount of clock skew', () => {
  const sinceMs = new Date('2026-07-29T12:00:00Z').getTime();
  const file = { dateAdded: '2026-07-29T11:59:55Z' }; // 5s "before", within the buffer
  assert.equal(isFileFromThisGrab(file, sinceMs), true);
});

test('isFileFromThisGrab rejects when there is no file at all', () => {
  assert.equal(isFileFromThisGrab(null, Date.now()), false);
});
