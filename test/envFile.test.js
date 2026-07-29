const { test } = require('node:test');
const assert = require('node:assert/strict');
const { parseFields, applyUpdates, isSecretKey, isBooleanValue } = require('../lib/envFile');

const SAMPLE = `# ---- Server ----
PORT=4000
SESSION_SECRET=abc123

# ---- Plex ----
# Admin/owner token for your Plex server
PLEX_ADMIN_TOKEN=xyz789
COOKIE_SECURE=true

SITE_NAME=Marquee
`;

test('parseFields groups fields under the nearest section header', () => {
  const fields = parseFields(SAMPLE);
  assert.equal(fields.find(f => f.key === 'PORT').section, 'Server');
  assert.equal(fields.find(f => f.key === 'PLEX_ADMIN_TOKEN').section, 'Plex');
  assert.equal(fields.find(f => f.key === 'SITE_NAME').section, 'Plex'); // still under Plex — no new header before it
});

test('parseFields attaches a comment directly above a field as its description', () => {
  const fields = parseFields(SAMPLE);
  assert.equal(fields.find(f => f.key === 'PLEX_ADMIN_TOKEN').description, "Admin/owner token for your Plex server");
  assert.equal(fields.find(f => f.key === 'PORT').description, null);
});

test('parseFields unquotes quoted values', () => {
  const fields = parseFields('SITE_TAGLINES="Uplink to the home network.|Another one"\n');
  assert.equal(fields[0].value, 'Uplink to the home network.|Another one');
});

test('isSecretKey matches API keys, tokens, passwords, and secrets regardless of service prefix', () => {
  for (const key of ['SESSION_SECRET', 'PLEX_ADMIN_TOKEN', 'RADARR_API_KEY', 'QBITTORRENT_PASSWORD', 'OVERSEERR_WEBHOOK_SECRET']) {
    assert.equal(isSecretKey(key), true, key);
  }
});

test('isSecretKey does not flag ordinary config keys', () => {
  for (const key of ['SITE_NAME', 'PLEX_CLIENT_ID', 'PLEX_SERVER_URL', 'COOKIE_SECURE', 'HOST_PORT']) {
    assert.equal(isSecretKey(key), false, key);
  }
});

test('isBooleanValue only matches literal true/false', () => {
  assert.equal(isBooleanValue('true'), true);
  assert.equal(isBooleanValue('false'), true);
  assert.equal(isBooleanValue('yes'), false);
  assert.equal(isBooleanValue('4000'), false);
});

test('applyUpdates changes only the targeted keys, leaving comments/blanks/order untouched', () => {
  const result = applyUpdates(SAMPLE, { SITE_NAME: 'MyPlexHub', COOKIE_SECURE: 'false' });
  assert.match(result, /SITE_NAME=MyPlexHub/);
  assert.match(result, /COOKIE_SECURE=false/);
  assert.match(result, /# ---- Server ----/);
  assert.match(result, /# Admin\/owner token for your Plex server/);
  assert.match(result, /PORT=4000/); // untouched
  assert.match(result, /SESSION_SECRET=abc123/); // untouched
});

test('applyUpdates quotes a value that contains whitespace, but leaves simple values unquoted', () => {
  const result = applyUpdates('SITE_NAME=Marquee\n', { SITE_NAME: 'My Plex Hub' });
  assert.match(result, /SITE_NAME="My Plex Hub"/);
  const unchanged = applyUpdates('SITE_NAME=Marquee\n', { SITE_NAME: 'Marquee2' });
  assert.match(unchanged, /SITE_NAME=Marquee2\n/);
});

test('applyUpdates appends a key that is not yet present in the file', () => {
  // e.g. QBITTORRENT_API_KEY being set for the first time on a deployment
  // whose .env predates that field existing at all.
  const result = applyUpdates(SAMPLE, { QBITTORRENT_API_KEY: 'abc123' });
  assert.match(result, /QBITTORRENT_API_KEY=abc123$/);
  assert.match(result, /PORT=4000/); // existing content still untouched
});

test('applyUpdates appends new keys and updates existing ones in the same call', () => {
  const result = applyUpdates(SAMPLE, { SITE_NAME: 'MyPlexHub', NEW_KEY: 'value' });
  assert.match(result, /SITE_NAME=MyPlexHub/);
  assert.match(result, /NEW_KEY=value$/);
});
