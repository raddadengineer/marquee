const express = require('express');
const fs = require('fs');
const path = require('path');
const requireAuth = require('./requireAuth');
const requireOwner = require('./requireOwner');
const { parseFields, applyUpdates, isSecretKey, isBooleanValue } = require('../lib/envFile');
const { SERVICES } = require('../lib/serviceRegistry');
const serviceHealth = require('../lib/serviceHealth');
const router = express.Router();

const ENV_PATH = path.join(__dirname, '..', '.env');

// Changing these breaks the container's own reachability (the internal port
// no longer matches Docker's own port mapping / healthcheck, or the compose
// project's container name reference) — recoverable only from a terminal,
// which defeats the point of this page. Shown read-only instead of editable.
const READONLY_KEYS = new Set(['PORT', 'HOST_PORT', 'CONTAINER_NAME']);

// Every key any SERVICES entry claims — whatever's left over is "deployment"
// config (site branding, session/cookie behavior, port, etc.), not tied to a
// specific integration.
const SERVICE_KEYS = new Set(SERVICES.flatMap(s => s.fields.map(f => f.key)));

function toClientField(f) {
  const secret = isSecretKey(f.key);
  return {
    key: f.key,
    label: f.label,
    description: f.description,
    readOnly: READONLY_KEYS.has(f.key),
    isSecret: secret,
    isBoolean: !secret && isBooleanValue(f.value),
    hasValue: !!f.value,
    value: secret ? undefined : f.value
  };
}

function currentValues() {
  if (!fs.existsSync(ENV_PATH)) return null;
  const map = new Map();
  for (const f of parseFields(fs.readFileSync(ENV_PATH, 'utf8'))) map.set(f.key, f.value);
  return map;
}

// Health grid for the Settings modal's service cards. Runs a real live check
// against each configured integration (in parallel) — see lib/serviceHealth.js
// for exactly what each one does and why.
router.get('/services', requireAuth, requireOwner, async (req, res) => {
  try {
    const health = await serviceHealth.checkAll();
    res.json(SERVICES.map(s => ({ key: s.key, label: s.label, health: health[s.key] })));
  } catch (err) {
    console.error('settings services health error:', err.message);
    res.status(502).json({ error: 'Could not run health checks' });
  }
});

// One service's editable fields, for its "Edit" popup — fetched lazily
// rather than shipping every service's fields (including which secrets are
// set) on every page load.
router.get('/services/:key', requireAuth, requireOwner, (req, res) => {
  const service = SERVICES.find(s => s.key === req.params.key);
  if (!service) return res.status(404).json({ error: 'Unknown service' });
  const values = currentValues();
  if (!values) return res.status(404).json({ error: '.env not found — this deployment may not have it mounted into the container' });
  res.json({
    key: service.key,
    label: service.label,
    fields: service.fields.map(f => toClientField({ ...f, value: values.get(f.key) || '' }))
  });
});

// Everything not claimed by a specific integration — site branding, session/
// cookie behavior, port, etc. — for the "Edit Deployment Settings" popup.
router.get('/deployment', requireAuth, requireOwner, (req, res) => {
  if (!fs.existsSync(ENV_PATH)) {
    return res.status(404).json({ error: '.env not found — this deployment may not have it mounted into the container' });
  }
  const fields = parseFields(fs.readFileSync(ENV_PATH, 'utf8')).filter(f => !SERVICE_KEYS.has(f.key));
  res.json(fields.map(f => toClientField({ key: f.key, label: f.key, description: f.description, value: f.value })));
});

const PRIVACY_KEYS = new Set([
  'PRIVACY_STREAM_USER_IDENTITY',
  'PRIVACY_STREAM_MEDIA_CONTENT',
  'PRIVACY_STREAM_TECHNICAL',
  'PRIVACY_CUSTOM_USER_LABEL',
  'PRIVACY_CUSTOM_MOVIE_LABEL',
  'PRIVACY_CUSTOM_SHOW_LABEL',
  'PRIVACY_STREAM_ALLOW_SELF_VIEW',
  'PRIVACY_STREAM_OWN_ONLY',
  'PRIVACY_SYSTEM_METRICS',
  'PRIVACY_HIDE_SYSTEM_VERSIONS',
  'PRIVACY_STATS',
  'PRIVACY_HIDE_REQUESTER',
  'PRIVACY_MY_REQUESTS_ONLY',
  'VISIBILITY_NOW_PLAYING',
  'VISIBILITY_TOP_WATCHED',
  'VISIBILITY_STORAGE',
  'VISIBILITY_GRAB_STATUS',
  'VISIBILITY_RECENTLY_ADDED',
  'VISIBILITY_AIRING_TODAY',
  'VISIBILITY_UPCOMING'
]);

router.get('/privacy', requireAuth, requireOwner, (req, res) => {
  const values = currentValues() || new Map();
  const privacy = {};
  for (const k of PRIVACY_KEYS) {
    privacy[k] = values.get(k) || process.env[k] || '';
  }
  res.json(privacy);
});

router.post('/', requireAuth, requireOwner, (req, res) => {
  const { changes } = req.body;
  if (!changes || typeof changes !== 'object' || Array.isArray(changes)) {
    return res.status(400).json({ error: 'Invalid payload' });
  }
  if (!fs.existsSync(ENV_PATH)) {
    return res.status(404).json({ error: '.env not found — this deployment may not have it mounted into the container' });
  }

  const text = fs.readFileSync(ENV_PATH, 'utf8');
  const knownKeys = new Set(parseFields(text).map(f => f.key));
  const allowedKeys = new Set([...knownKeys, ...SERVICE_KEYS, ...PRIVACY_KEYS]);

  const updates = {};
  for (const [key, value] of Object.entries(changes)) {
    if (!allowedKeys.has(key) || READONLY_KEYS.has(key) || typeof value !== 'string') continue;
    updates[key] = value;
  }
  if (!Object.keys(updates).length) {
    return res.status(400).json({ error: 'No valid changes to apply' });
  }

  fs.writeFileSync(ENV_PATH, applyUpdates(text, updates), 'utf8');
  res.json({ status: 'ok', restarting: true });

  // Node only loads env vars once, at process start — Docker Compose's
  // env_file re-reads the (now-updated) file only when the container
  // actually restarts. There's no in-process "reload env" to do instead;
  // exiting and letting the existing restart:unless-stopped policy bring it
  // back up is the only way these changes actually take effect. The short
  // delay just gives this response time to flush to the client first.
  setTimeout(() => process.exit(0), 500);
});

module.exports = router;
