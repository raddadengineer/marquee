require('dotenv').config();
const express = require('express');
const session = require('express-session');
const sqlite3 = require('sqlite3');
const SQLiteStore = require('connect-sqlite3')(session);
const cookieParser = require('cookie-parser');
const path = require('path');
const fs = require('fs');
const { checkOrigin } = require('./lib/csrfOrigin');

const app = express();

app.set('trust proxy', 1); // needed for secure cookies to work when HTTPS is terminated by your reverse proxy

// Baseline hardening — cheap and worth having once this is reachable from the
// public internet rather than just the LAN.
app.use((req, res, next) => {
  res.set('X-Content-Type-Options', 'nosniff');
  res.set('X-Frame-Options', 'DENY'); // the sign-in page shouldn't be embeddable elsewhere
  res.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  next();
});

// CSRF protection: the session cookie's sameSite:'lax' already stops browsers
// from attaching it to a cross-site POST/PUT/DELETE, but that's an implicit
// side effect of a cookie setting, not something the server itself verifies —
// this makes it explicit. Every state-changing request must carry an Origin
// header whose host matches the request's own Host header (works the same
// whichever hostname/port this is actually reached on — Cloudflare domain or
// direct LAN IP — no hardcoded origin to keep in sync).
// Exempt: Overseerr's own webhook, which is called server-to-server (never
// carries a browser Origin) and is already authenticated by its own shared
// secret — see routes/overseerr.js's /webhook handler.
const CSRF_EXEMPT_PATHS = new Set(['/api/overseerr/webhook']);
const CSRF_ERROR_MESSAGES = {
  missing: 'Missing Origin header',
  invalid: 'Invalid Origin header',
  mismatch: 'Cross-origin request blocked'
};
app.use((req, res, next) => {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
  if (CSRF_EXEMPT_PATHS.has(req.path)) return next();

  const result = checkOrigin(req.headers.origin, req.headers.host);
  if (result === 'ok') return next();
  res.status(403).json({ error: CSRF_ERROR_MESSAGES[result] });
});

// Persists sessions to disk so the family isn't logged out on every
// `docker compose up -d --build` or container restart.
const sessionDbDir = process.env.SESSION_DB_DIR || '/app/data';
fs.mkdirSync(sessionDbDir, { recursive: true });
const sessionDb = new sqlite3.Database(path.join(sessionDbDir, 'sessions.sqlite'));

app.use(express.json());
app.use(cookieParser());
app.use(session({
  store: new SQLiteStore({ db: sessionDb }),
  secret: process.env.SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    sameSite: 'lax',
    maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days — this is a family dashboard, not a bank
    // Only mark the cookie secure once you're actually accessing this over HTTPS
    // (i.e. through your reverse proxy). Testing directly at http://host:4000
    // needs this OFF, or the browser silently refuses to store the cookie
    // and you'll get signed out on every refresh.
    secure: process.env.COOKIE_SECURE === 'true'
  }
}));

require('./lib/nowPlaying').start();

app.use('/api/auth', require('./routes/auth'));
app.use('/api/plex', require('./routes/plex'));
app.use('/api/tautulli', require('./routes/tautulli'));
app.use('/api/sonarr', require('./routes/sonarr'));
app.use('/api/radarr', require('./routes/radarr'));
app.use('/api/overseerr', require('./routes/overseerr'));
app.use('/api/watchlist', require('./routes/watchlist'));
app.use('/api/downloads', require('./routes/downloads'));
app.use('/api/owner', require('./routes/owner'));
app.use('/api/settings', require('./routes/settings'));
app.use('/api/prowlarr', require('./routes/prowlarr'));

// index.html carries a {{SITE_NAME}} placeholder so this same image can show a generic
// "Marquee" brand out of the box, or your own (e.g. via SITE_NAME=MyPlexHub in .env).
const siteName = process.env.SITE_NAME || 'Marquee';
// Pipe-separated so a deployment can brand the sign-in screen with its own personality
// without touching the code — the generic default is intentionally plain.
const taglines = (process.env.SITE_TAGLINES || 'Uplink to the home network.').split('|');
const taglinesJson = JSON.stringify(taglines).replace(/</g, '\\u003c');
// Cloudflare overrides our origin's Cache-Control for .js/.css with its own
// multi-hour edge TTL regardless of what we send — no-cache alone doesn't help.
// Busting the query string on every process start (i.e. every deploy) instead
// forces a real cache miss, since it's a URL Cloudflare has never cached before.
const assetVersion = String(Date.now());
// siteName/taglinesJson/assetVersion are all fixed for the life of the process,
// so both the disk read and the placeholder substitution are redundant on every
// request — do each exactly once at startup and just serve the resulting string.
// (index.html/manifest.webmanifest are read synchronously here, at startup only,
// which is fine — nothing is serving traffic yet.)
const renderedHtml = fs.readFileSync(path.join(__dirname, 'public', 'index.html'), 'utf8')
  .replaceAll('{{SITE_NAME}}', siteName)
  .replace('{{TAGLINES_JSON}}', taglinesJson)
  .replaceAll('{{ASSET_VERSION}}', assetVersion);
const renderedManifest = fs.readFileSync(path.join(__dirname, 'public', 'manifest.webmanifest'), 'utf8')
  .replaceAll('{{SITE_NAME}}', siteName);
// Owner-only control center — a separate page (not just a hidden panel) so
// it can grow without crowding the shared family dashboard. Actual access
// control happens server-side on every /api/owner, /api/*/queue,
// /api/*/releases, etc. route (requireAuth + requireOwner) — this page is
// just a shell, same as index.html.
const renderedAdminHtml = fs.readFileSync(path.join(__dirname, 'public', 'admin.html'), 'utf8')
  .replaceAll('{{SITE_NAME}}', siteName)
  .replaceAll('{{ASSET_VERSION}}', assetVersion);

app.get('/', (req, res) => {
  // Always revalidate the page shell itself, so it picks up the new asset
  // version immediately rather than also being stuck on a stale cached copy.
  res.set('Cache-Control', 'no-cache');
  res.type('html').send(renderedHtml);
});
app.get('/admin', (req, res) => {
  res.set('Cache-Control', 'no-cache');
  res.type('html').send(renderedAdminHtml);
});
// Same {{SITE_NAME}} templating as index.html, so an installed PWA's home-screen
// label matches whatever this deployment is branded as instead of the generic
// default baked into the static file.
app.get('/manifest.webmanifest', (req, res) => {
  res.set('Cache-Control', 'no-cache');
  res.type('application/manifest+json').send(renderedManifest);
});

app.use(express.static(path.join(__dirname, 'public'), {
  index: false,
  setHeaders: (res, filePath) => {
    // Icons are unversioned (no ?v= cache-buster like app.js/style.css get), but
    // also change rarely and deliberately — a week-long cache is a real win for
    // repeat visits without meaningfully risking a stale favicon/PWA icon.
    res.set('Cache-Control', filePath.includes(`${path.sep}icons${path.sep}`)
      ? 'public, max-age=604800'
      : 'no-cache');
  }
}));

const port = process.env.PORT || 4000;
app.listen(port, () => console.log(`${siteName} running on :${port}`));
