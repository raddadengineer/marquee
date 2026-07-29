const express = require('express');
const requireAuth = require('./requireAuth');
const subscriptions = require('../lib/pushSubscriptions');
const router = express.Router();

// Public key only — safe to expose to any signed-in browser, it's what the
// browser's pushManager.subscribe() needs to create a subscription. The
// private key never leaves the server (see lib/pushNotify.js).
router.get('/vapid-public-key', requireAuth, (req, res) => {
  res.json({ key: process.env.VAPID_PUBLIC_KEY || null });
});

router.post('/subscribe', requireAuth, async (req, res) => {
  const sub = req.body;
  if (!sub?.endpoint || !sub?.keys?.p256dh || !sub?.keys?.auth) {
    return res.status(400).json({ error: 'Invalid subscription' });
  }
  try {
    await subscriptions.save(req.session.user.id, sub);
    res.json({ status: 'subscribed' });
  } catch (err) {
    console.error('push subscribe error:', err.message);
    res.status(500).json({ error: 'Could not save subscription' });
  }
});

router.post('/unsubscribe', requireAuth, async (req, res) => {
  const { endpoint } = req.body;
  if (!endpoint) return res.status(400).json({ error: 'Invalid request' });
  try {
    await subscriptions.remove(endpoint);
    res.json({ status: 'unsubscribed' });
  } catch (err) {
    console.error('push unsubscribe error:', err.message);
    res.status(500).json({ error: 'Could not remove subscription' });
  }
});

module.exports = router;
