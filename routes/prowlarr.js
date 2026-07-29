const express = require('express');
const axios = require('axios');
const requireAuth = require('./requireAuth');
const requireOwner = require('./requireOwner');
const router = express.Router();

// Prowlarr only lists indexers that have ever failed in /indexerstatus (a
// healthy indexer simply has no entry there at all) — cross-referencing the
// two is what actually answers "which of my indexers are broken right now."
router.get('/indexers', requireAuth, requireOwner, async (req, res) => {
  try {
    const headers = { 'X-Api-Key': process.env.PROWLARR_API_KEY };
    const [{ data: indexers }, { data: statuses }] = await Promise.all([
      axios.get(`${process.env.PROWLARR_URL}/api/v1/indexer`, { headers }),
      axios.get(`${process.env.PROWLARR_URL}/api/v1/indexerstatus`, { headers })
    ]);
    const now = Date.now();
    const statusById = new Map(statuses.map(s => [s.indexerId, s]));
    const results = indexers
      .map(i => {
        const status = statusById.get(i.id);
        const disabledTill = status?.disabledTill ? new Date(status.disabledTill).getTime() : null;
        const failing = !!(disabledTill && disabledTill > now);
        return {
          id: i.id,
          name: i.name,
          protocol: i.protocol,
          healthy: i.enable && !failing,
          reason: !i.enable ? 'Disabled' : failing ? (status.mostRecentFailure || 'Failing') : null
        };
      })
      .sort((a, b) => Number(a.healthy) - Number(b.healthy));
    res.json(results);
  } catch (err) {
    console.error('prowlarr indexers error:', err.code || err.response?.status, err.message);
    res.status(502).json({ error: 'Could not reach Prowlarr' });
  }
});

module.exports = router;
