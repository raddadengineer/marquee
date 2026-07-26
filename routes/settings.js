const express = require('express');
const fs = require('fs');
const path = require('path');
const requireAuth = require('./requireAuth');
const requireOwner = require('./requireOwner');
const { parseFields, applyUpdates, isSecretKey, isBooleanValue } = require('../lib/envFile');
const router = express.Router();

const ENV_PATH = path.join(__dirname, '..', '.env');

// Changing these breaks the container's own reachability (the internal port
// no longer matches Docker's own port mapping / healthcheck, or the compose
// project's container name reference) — recoverable only from a terminal,
// which defeats the point of this page. Shown read-only instead of editable.
const READONLY_KEYS = new Set(['PORT', 'HOST_PORT', 'CONTAINER_NAME']);

router.get('/', requireAuth, requireOwner, (req, res) => {
  if (!fs.existsSync(ENV_PATH)) {
    return res.status(404).json({ error: '.env not found — this deployment may not have it mounted into the container' });
  }
  const fields = parseFields(fs.readFileSync(ENV_PATH, 'utf8'));
  res.json(fields.map(f => {
    const secret = isSecretKey(f.key);
    return {
      key: f.key,
      section: f.section,
      description: f.description,
      readOnly: READONLY_KEYS.has(f.key),
      isSecret: secret,
      isBoolean: !secret && isBooleanValue(f.value),
      hasValue: !!f.value,
      // Secrets are never sent to the browser, not even to prefill the form —
      // only whether one is currently set (hasValue above).
      value: secret ? undefined : f.value
    };
  }));
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

  const updates = {};
  for (const [key, value] of Object.entries(changes)) {
    // Only existing keys can be changed here — no creating new ones through
    // this form, and never the infrastructure-critical read-only ones.
    if (!knownKeys.has(key) || READONLY_KEYS.has(key) || typeof value !== 'string') continue;
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
