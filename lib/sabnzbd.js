const axios = require('axios');

// SABnzbd only reports one aggregate queue speed, not per-item — applied here only
// to the item actually downloading (SABnzbd processes its queue sequentially, so
// there's normally at most one).
async function getQueue() {
  const { data } = await axios.get(`${process.env.SABNZBD_URL}/api`, {
    params: { apikey: process.env.SABNZBD_API_KEY, mode: 'queue', output: 'json' }
  });
  const queue = data.queue || {};
  const totalSpeedKbps = Math.round(Number(queue.kbpersec) || 0);
  return (queue.slots || []).map(s => {
    const downloading = s.status === 'Downloading';
    return {
      id: s.nzo_id,
      name: s.filename,
      type: 'usenet',
      state: (s.status || '').toLowerCase(),
      progress: Math.round(Number(s.percentage) || 0),
      speedKbps: downloading ? totalSpeedKbps : 0,
      etaSeconds: parseTimeleft(s.timeleft),
      sizeBytes: Math.round((Number(s.mb) || 0) * 1024 * 1024)
    };
  });
}

function parseTimeleft(hms) {
  if (!hms) return null;
  const parts = hms.split(':').map(Number);
  if (parts.some(Number.isNaN) || parts.length !== 3) return null;
  const [h, m, s] = parts;
  return h * 3600 + m * 60 + s;
}

async function pauseItem(nzoId) {
  await axios.get(`${process.env.SABNZBD_URL}/api`, {
    params: { apikey: process.env.SABNZBD_API_KEY, mode: 'queue', name: 'pause', value: nzoId, output: 'json' }
  });
}
async function resumeItem(nzoId) {
  await axios.get(`${process.env.SABNZBD_URL}/api`, {
    params: { apikey: process.env.SABNZBD_API_KEY, mode: 'queue', name: 'resume', value: nzoId, output: 'json' }
  });
}
async function deleteItem(nzoId) {
  const { data } = await axios.get(`${process.env.SABNZBD_URL}/api`, {
    params: { apikey: process.env.SABNZBD_API_KEY, mode: 'queue', name: 'delete', value: nzoId, output: 'json' }
  });
  if (!data.status) throw new Error('SABnzbd did not recognize that item');
}

module.exports = { getQueue, pauseItem, resumeItem, deleteItem };
