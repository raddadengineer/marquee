const express = require('express');
const requireAuth = require('./requireAuth');
const requireOwner = require('./requireOwner');
const settle = require('../lib/settle');
const qbittorrent = require('../lib/qbittorrent');
const sabnzbd = require('../lib/sabnzbd');
const router = express.Router();

router.get('/queue', requireAuth, async (req, res) => {
  const [torrents, usenet] = await Promise.all([
    settle('qbittorrent queue', process.env.QBITTORRENT_URL ? qbittorrent.getTorrents() : Promise.resolve([]), []),
    settle('sabnzbd queue', process.env.SABNZBD_URL ? sabnzbd.getQueue() : Promise.resolve([]), [])
  ]);
  // Excludes "seeding" (fully downloaded, just sharing back out) — this is meant
  // to answer "what's coming in or stuck right now," not double as a full
  // torrent/usenet client. Paused/stalled/queued/error are included (unlike
  // before) so the owner-only pause/resume/remove actions below have something
  // to act on — a paused item that then vanished from the list would have no
  // way to be resumed from here.
  const items = [...torrents, ...usenet].filter(item => item.state !== 'seeding');
  items.sort((a, b) => b.progress - a.progress);
  res.json(items);
});

const ID_RE = /^[a-zA-Z0-9_]+$/;

function serviceFor(type) {
  if (type === 'torrent') return qbittorrent;
  if (type === 'usenet') return sabnzbd;
  return null;
}

router.post('/queue/:type/:id/pause', requireAuth, requireOwner, async (req, res) => {
  const service = serviceFor(req.params.type);
  if (!service || !ID_RE.test(req.params.id)) return res.status(400).json({ error: 'Invalid item' });
  try {
    await (req.params.type === 'torrent' ? service.pauseTorrent(req.params.id) : service.pauseItem(req.params.id));
    res.json({ status: 'paused' });
  } catch (err) {
    console.error('downloads pause error:', err.message);
    res.status(502).json({ error: 'Could not pause item' });
  }
});

router.post('/queue/:type/:id/resume', requireAuth, requireOwner, async (req, res) => {
  const service = serviceFor(req.params.type);
  if (!service || !ID_RE.test(req.params.id)) return res.status(400).json({ error: 'Invalid item' });
  try {
    await (req.params.type === 'torrent' ? service.resumeTorrent(req.params.id) : service.resumeItem(req.params.id));
    res.json({ status: 'resumed' });
  } catch (err) {
    console.error('downloads resume error:', err.message);
    res.status(502).json({ error: 'Could not resume item' });
  }
});

router.delete('/queue/:type/:id', requireAuth, requireOwner, async (req, res) => {
  const service = serviceFor(req.params.type);
  if (!service || !ID_RE.test(req.params.id)) return res.status(400).json({ error: 'Invalid item' });
  try {
    await (req.params.type === 'torrent' ? service.deleteTorrent(req.params.id, true) : service.deleteItem(req.params.id));
    res.json({ status: 'removed' });
  } catch (err) {
    console.error('downloads delete error:', err.message);
    res.status(502).json({ error: 'Could not remove item' });
  }
});

module.exports = router;
