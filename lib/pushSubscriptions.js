const sqlite3 = require('sqlite3');
const fs = require('fs');
const path = require('path');

// Separate from express-session's own sessions.sqlite and logins.sqlite —
// a push subscription needs to survive across sessions/sign-outs (that's the
// whole point: notify someone even when they're not actively signed in with
// an open tab), so it can't live in either of those.
const dbDir = process.env.SESSION_DB_DIR || '/app/data';
fs.mkdirSync(dbDir, { recursive: true });
const db = new sqlite3.Database(path.join(dbDir, 'push.sqlite'));
db.run(`CREATE TABLE IF NOT EXISTS push_subscriptions (
  endpoint TEXT PRIMARY KEY,
  plex_user_id TEXT NOT NULL,
  p256dh TEXT NOT NULL,
  auth TEXT NOT NULL,
  created_at INTEGER
)`);

// Upsert on endpoint — re-subscribing (e.g. after clearing browser data, or a
// push service rotating the endpoint) just refreshes the row instead of
// accumulating duplicates for what's really the same browser install.
function save(plexUserId, subscription) {
  return new Promise((resolve, reject) => {
    db.run(
      `INSERT INTO push_subscriptions (endpoint, plex_user_id, p256dh, auth, created_at)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(endpoint) DO UPDATE SET plex_user_id = excluded.plex_user_id,
         p256dh = excluded.p256dh, auth = excluded.auth`,
      [subscription.endpoint, String(plexUserId), subscription.keys.p256dh, subscription.keys.auth, Date.now()],
      err => (err ? reject(err) : resolve())
    );
  });
}

function remove(endpoint) {
  return new Promise((resolve, reject) => {
    db.run('DELETE FROM push_subscriptions WHERE endpoint = ?', [endpoint], err => (err ? reject(err) : resolve()));
  });
}

function all() {
  return new Promise((resolve, reject) => {
    db.all('SELECT endpoint, p256dh, auth FROM push_subscriptions', [], (err, rows) => (err ? reject(err) : resolve(rows)));
  });
}

module.exports = { save, remove, all };
