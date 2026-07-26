const { test } = require('node:test');
const assert = require('node:assert/strict');
const { checkOrigin } = require('../lib/csrfOrigin');

test('matching origin and host is ok, regardless of scheme or which hostname is in use', () => {
  assert.equal(checkOrigin('https://skyn3t.me', 'skyn3t.me'), 'ok');
  assert.equal(checkOrigin('http://192.0.2.1:81', '192.0.2.1:81'), 'ok');
  assert.equal(checkOrigin('http://localhost:4000', 'localhost:4000'), 'ok');
});

test('a cross-origin request is a mismatch', () => {
  assert.equal(checkOrigin('https://evil.example.com', 'skyn3t.me'), 'mismatch');
});

test('a missing Origin header is rejected on a mutating request', () => {
  assert.equal(checkOrigin(undefined, 'skyn3t.me'), 'missing');
  assert.equal(checkOrigin('', 'skyn3t.me'), 'missing');
});

test('an unparseable Origin header is rejected rather than treated as same-origin', () => {
  assert.equal(checkOrigin('not-a-url', 'skyn3t.me'), 'invalid');
  assert.equal(checkOrigin('null', 'skyn3t.me'), 'invalid');
});
