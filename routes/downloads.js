const express = require('express');
const requireAuth = require('./requireAuth');
const requireOwner = require('./requireOwner');
const settle = require('../lib/settle');
const qbittorrent = require('../lib/qbittorrent');
const sabnzbd = require('../lib/sabnzbd');
const router = express.Router();

async function fetchAll() {
  const [torrents, usenet] = await Promise.all([
    settle('qbittorrent queue', process.env.QBITTORRENT_URL ? qbittorrent.getTorrents() : Promise.resolve([]), []),
    settle('sabnzbd queue', process.env.SABNZBD_URL ? sabnzbd.getQueue() : Promise.resolve([]), [])
  ]);
  return [...torrents, ...usenet];
}

router.get('/queue', requireAuth, async (req, res) => {
  // Actively downloading only — this answers "what's coming in right now" for
  // everyone, not "manage my whole torrent/usenet client." Anything stuck
  // (paused/stalled/error/queued) is owner-only, see /queue/attention below —
  // most of what shows up there in practice is fully-downloaded torrents
  // stalled/paused/queued while seeding, which nobody but the owner needs to
  // see and even they don't need to see constantly.
  const items = (await fetchAll()).filter(item => item.state === 'downloading');
  items.sort((a, b) => b.progress - a.progress);
  res.json(items);
});

router.get('/queue/attention', requireAuth, requireOwner, async (req, res) => {
  // Not downloading and not seeding/complete — i.e. actually stuck or failed,
  // the things worth an owner's Pause/Resume/Remove action. Excludes
  // "seeding" specifically because a torrent that's 100% done and just
  // paused/stalled/queued while trying to seed isn't a download problem.
  const items = (await fetchAll()).filter(item => item.state !== 'downloading' && item.state !== 'seeding');
  items.sort((a, b) => a.name.localeCompare(b.name));
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
