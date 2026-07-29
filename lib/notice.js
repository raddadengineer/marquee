const sqlite3 = require('sqlite3');
const fs = require('fs');
const path = require('path');

// A single scheduled announcement (e.g. "down Monday night for maintenance"),
// not a list — one row, always id=1, upserted in place. Separate db file from
// sessions/logins. Opened lazily (not at module load, unlike lib/loginLog.js)
// so computeStatus below stays importable/unit-testable without touching the
// filesystem — SESSION_DB_DIR only actually exists inside the container.
let db = null;
function getDb() {
  if (db) return db;
  const dbDir = process.env.SESSION_DB_DIR || '/app/data';
  fs.mkdirSync(dbDir, { recursive: true });
  db = new sqlite3.Database(path.join(dbDir, 'notice.sqlite'));
  db.run(`CREATE TABLE IF NOT EXISTS notice (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    message TEXT NOT NULL,
    starts_at INTEGER,
    ends_at INTEGER,
    updated_at INTEGER
  )`);
  return db;
}

function get() {
  return new Promise((resolve, reject) => {
    getDb().get(
      'SELECT message, starts_at AS startsAt, ends_at AS endsAt, updated_at AS updatedAt FROM notice WHERE id = 1',
      (err, row) => err ? reject(err) : resolve(row || null)
    );
  });
}

function set({ message, startsAt, endsAt }) {
  return new Promise((resolve, reject) => {
    getDb().run(
      'INSERT OR REPLACE INTO notice (id, message, starts_at, ends_at, updated_at) VALUES (1, ?, ?, ?, ?)',
      [message, startsAt ?? null, endsAt ?? null, Date.now()],
      err => err ? reject(err) : resolve()
    );
  });
}

function clear() {
  return new Promise((resolve, reject) => {
    getDb().run('DELETE FROM notice WHERE id = 1', err => err ? reject(err) : resolve());
  });
}

// Pure — testable without touching the DB. A missing startsAt means "show
// immediately", a missing endsAt means "show until cleared".
function computeStatus(notice, now = Date.now()) {
  if (!notice) return 'none';
  if (notice.startsAt && now < notice.startsAt) return 'scheduled';
  if (notice.endsAt && now > notice.endsAt) return 'expired';
  return 'active';
}

module.exports = { get, set, clear, computeStatus };
