const { test } = require('node:test');
const assert = require('node:assert/strict');
const { classifyQueueRecord } = require('../lib/grabStatus');

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
