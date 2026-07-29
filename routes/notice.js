const express = require('express');
const requireAuth = require('./requireAuth');
const requireOwner = require('./requireOwner');
const notice = require('../lib/notice');
const router = express.Router();

// Family-facing — only returns the message when it's actually inside its
// scheduled window; scheduled/expired/none all just look like "nothing to
// show" from here, so the dashboard doesn't need to know why.
router.get('/', requireAuth, async (req, res) => {
  try {
    const current = await notice.get();
    const status = notice.computeStatus(current);
    res.json(status === 'active' ? { message: current.message } : null);
  } catch (err) {
    console.error('notice read error', err.message);
    res.status(502).json({ error: 'Could not read notice' });
  }
});

// Owner-only — raw fields + computed status, so Settings can show what's
// scheduled or already expired, not just whether it's live right now.
router.get('/admin', requireAuth, requireOwner, async (req, res) => {
  try {
    const current = await notice.get();
    res.json(current ? { ...current, status: notice.computeStatus(current) } : null);
  } catch (err) {
    console.error('notice admin read error', err.message);
    res.status(502).json({ error: 'Could not read notice' });
  }
});

// startsAt/endsAt are epoch-ms numbers, already resolved from the browser's
// own local time client-side — deliberately not a bare date-time string,
// which Node would otherwise parse against the server's own timezone
// instead of whatever the owner actually typed.
router.post('/', requireAuth, requireOwner, async (req, res) => {
  const { message, startsAt, endsAt } = req.body;
  if (typeof message !== 'string' || !message.trim()) {
    return res.status(400).json({ error: 'Message is required' });
  }
  const start = startsAt == null ? null : Number(startsAt);
  const end = endsAt == null ? null : Number(endsAt);
  if (startsAt != null && !Number.isFinite(start)) return res.status(400).json({ error: 'Invalid start time' });
  if (endsAt != null && !Number.isFinite(end)) return res.status(400).json({ error: 'Invalid end time' });
  if (start && end && end <= start) return res.status(400).json({ error: 'End time must be after start time' });

  try {
    await notice.set({ message: message.trim().slice(0, 500), startsAt: start, endsAt: end });
    res.json({ status: 'ok' });
  } catch (err) {
    console.error('notice write error', err.message);
    res.status(502).json({ error: 'Could not save notice' });
  }
});

router.delete('/', requireAuth, requireOwner, async (req, res) => {
  try {
    await notice.clear();
    res.json({ status: 'ok' });
  } catch (err) {
    console.error('notice delete error', err.message);
    res.status(502).json({ error: 'Could not clear notice' });
  }
});

module.exports = router;
