// Owner-only control center — separate page from the family dashboard so
// none of this crowds the shared view. The real security boundary is
// server-side (every endpoint this page calls is requireAuth+requireOwner
// gated) — this client-side check just keeps a non-owner from landing on a
// page full of empty/error states instead of being sent back to the
// dashboard right away.
(async function initAdmin() {
  try {
    const me = await api('/api/auth/me');
    if (!me.isOwner) { location.href = '/'; return; }
  } catch (e) {
    location.href = '/';
    return;
  }

  loadOwnerStatus();
  setInterval(loadOwnerStatus, 15000);
  loadAdminLogins();
  loadPendingRequests();
  setInterval(loadPendingRequests, 30000);
  loadAdminIssues();
  setInterval(loadAdminIssues, 30000);
  loadDiskSpace();
  setInterval(loadDiskSpace, 60000);
  loadDownloadIssues();
  setInterval(loadDownloadIssues, 15000);
  loadWanted();
  setInterval(loadWanted, 60000);
  loadImportIssues();
  setInterval(loadImportIssues, 30000);
  loadIndexers();
  setInterval(loadIndexers, 60000);
})();

document.getElementById('admin-logout-btn').addEventListener('click', async () => {
  await api('/api/auth/logout', { method: 'POST' });
  location.href = '/';
});

// ---------- Owner Status (Uptime Kuma + UPS) ----------
async function loadOwnerStatus() {
  const body = document.getElementById('owner-body');
  try {
    const { monitors, ups } = await api('/api/owner/status');
    let html = '';
    if (ups) {
      const onBattery = ups.status.includes('OB');
      html += `
        <div class="ups-status">
          <div class="now-title">${escapeHtml(ups.model || 'UPS')}</div>
          <div class="now-meta">
            <span class="${dotClass(onBattery)}"></span>
            ${escapeHtml(formatUpsStatus(ups.status))}${ups.loadPercent != null ? ' · ' + ups.loadPercent + '% load' : ''}${ups.batteryRuntimeSeconds != null ? ' · ' + formatEta(ups.batteryRuntimeSeconds) + ' runtime' : ''}
          </div>
          ${ups.batteryChargePercent != null ? `<div class="bar"><div class="bar-fill" style="width:${ups.batteryChargePercent}%"></div></div>` : ''}
        </div>
      `;
    }
    if (monitors.length) {
      html += `<div class="monitor-pills">${monitors.map(m => `
        <span class="monitor-pill ${m.status}"><span class="${dotClass(m.status !== 'up')}"></span>${escapeHtml(m.name)}</span>
      `).join('')}</div>`;
    }
    body.innerHTML = html || '<p class="empty-state">Nothing configured.</p>';
  } catch (e) {
    body.innerHTML = '<p class="empty-state">Could not reach status sources.</p>';
  }
}

function formatUpsStatus(status) {
  const flags = {
    OL: 'Online', OB: 'On Battery', LB: 'Low Battery', CHRG: 'Charging', DISCHRG: 'Discharging',
    RB: 'Replace Battery', BYPASS: 'Bypass', CAL: 'Calibrating', OFF: 'Offline', OVER: 'Overloaded',
    TRIM: 'Trimming', BOOST: 'Boosting', FSD: 'Forced Shutdown'
  };
  return status.split(' ').map(f => flags[f] || f).join(' · ');
}

// ---------- Family (recent sign-ins, pending requests, open issues) ----------
async function loadAdminLogins() {
  const body = document.getElementById('admin-logins-body');
  try {
    const logins = await api('/api/owner/logins');
    body.innerHTML = !logins.length ? '<p class="empty-state">No sign-ins recorded yet.</p>' : logins.map(l => `
      <div class="login-row">
        <img class="login-avatar" src="${l.thumb || ''}" onerror="this.style.visibility='hidden'">
        <div>
          <div class="login-name">${escapeHtml(l.username)}${l.isOwner ? ' · Owner' : ''}</div>
          <div class="login-time">${timeAgo(l.at)}</div>
        </div>
      </div>
    `).join('');
  } catch (e) {
    body.innerHTML = '<p class="empty-state">Could not load sign-ins.</p>';
  }
}

async function loadPendingRequests() {
  const body = document.getElementById('admin-requests-body');
  try {
    const results = await api('/api/overseerr/requests/pending');
    if (!results.length) { body.innerHTML = '<p class="empty-state">Nothing pending.</p>'; return; }
    body.innerHTML = results.map(r => `
      <div class="pending-row" data-id="${r.id}">
        <img class="result-poster" src="${r.poster || ''}" onerror="this.style.visibility='hidden'">
        <div class="result-info">
          <div class="result-title">${escapeHtml(r.title || 'Unknown title')}</div>
          <div class="pending-requester">
            <img src="${r.requestedByAvatar || ''}" onerror="this.style.visibility='hidden'">
            ${escapeHtml(r.requestedBy)} · ${timeAgo(r.requestedAt)}
          </div>
        </div>
        <div class="pending-actions">
          <button class="approve-btn pill-btn"><span class="state-dot"></span><span class="btn-label">Approve</span></button>
          <button class="decline-btn pill-btn"><span class="state-dot danger"></span><span class="btn-label">Decline</span></button>
        </div>
      </div>
    `).join('');
  } catch (e) {
    body.innerHTML = '<p class="empty-state">Could not load pending requests.</p>';
  }
}

document.getElementById('admin-requests-body').addEventListener('click', async e => {
  const btn = e.target.closest('.approve-btn, .decline-btn');
  if (!btn) return;
  const row = btn.closest('.pending-row');
  const action = btn.classList.contains('approve-btn') ? 'approve' : 'decline';
  row.querySelectorAll('button').forEach(b => b.disabled = true);
  btn.querySelector('.btn-label').textContent = '…';
  try {
    await api(`/api/overseerr/requests/${row.dataset.id}/${action}`, { method: 'POST' });
    row.remove();
    if (!document.getElementById('admin-requests-body').children.length) {
      document.getElementById('admin-requests-body').innerHTML = '<p class="empty-state">Nothing pending.</p>';
    }
  } catch (e) {
    row.querySelectorAll('button').forEach(b => b.disabled = false);
    btn.querySelector('.btn-label').textContent = action === 'approve' ? 'Approve' : 'Decline';
  }
});

async function loadAdminIssues() {
  const body = document.getElementById('admin-issues-body');
  try {
    const results = await api('/api/overseerr/issues/open');
    if (!results.length) { body.innerHTML = '<p class="empty-state">Nothing open.</p>'; return; }
    body.innerHTML = results.map(r => `
      <div class="pending-row" data-id="${r.id}" data-title="${escapeHtml(r.title || 'Unknown title')}"
           data-media-type="${r.mediaType || ''}" data-tmdb-id="${r.tmdbId || ''}" data-tvdb-id="${r.tvdbId || ''}"
           data-season="${r.season || ''}" data-episode="${r.episode || ''}">
        <img class="result-poster" src="${r.poster || ''}" onerror="this.style.visibility='hidden'">
        <div class="result-info">
          <div class="result-title">${escapeHtml(r.title || 'Unknown title')}${r.season ? ` — S${r.season}E${r.episode}` : ''}</div>
          <div class="pending-requester">
            <img src="${r.reportedByAvatar || ''}" onerror="this.style.visibility='hidden'">
            ${escapeHtml(r.reportedBy)} · ${r.issueType} · ${timeAgo(r.reportedAt)}
          </div>
          ${r.message ? `<div class="issue-message">${escapeHtml(r.message)}</div>` : ''}
        </div>
        <div class="pending-actions">
          <button class="search-release-btn pill-btn"><span class="state-dot"></span><span class="btn-label">Search</span></button>
          <button class="approve-btn pill-btn"><span class="state-dot"></span><span class="btn-label">Resolve</span></button>
        </div>
      </div>
    `).join('');
  } catch (e) {
    body.innerHTML = '<p class="empty-state">Could not load issues.</p>';
  }
}

document.getElementById('admin-issues-body').addEventListener('click', async e => {
  const searchBtn = e.target.closest('.search-release-btn');
  if (searchBtn) {
    openReleaseModal(searchBtn.closest('.pending-row').dataset);
    return;
  }
  const btn = e.target.closest('.approve-btn');
  if (!btn) return;
  const row = btn.closest('.pending-row');
  row.querySelectorAll('button').forEach(b => b.disabled = true);
  btn.querySelector('.btn-label').textContent = '…';
  try {
    await api(`/api/overseerr/issues/${row.dataset.id}/resolve`, { method: 'POST' });
    row.remove();
    if (!document.getElementById('admin-issues-body').children.length) {
      document.getElementById('admin-issues-body').innerHTML = '<p class="empty-state">Nothing open.</p>';
    }
  } catch (e) {
    row.querySelectorAll('button').forEach(b => b.disabled = false);
    btn.querySelector('.btn-label').textContent = 'Resolve';
  }
});

// ---------- Release search modal ----------
// Interactive search against Radarr/Sonarr's own configured indexers, so a
// bad/wrong release reported as an issue (or a wanted/missing item — see
// below) can be fixed without leaving the dashboard. Can take up to ~a
// minute — this is a live indexer search, not a cached lookup, same as
// Sonarr/Radarr's own "Interactive Search" UI.
async function openReleaseModal(ctx) {
  const modal = document.getElementById('release-modal');
  const listEl = document.getElementById('release-list');
  document.getElementById('release-modal-title').textContent = ctx.title +
    (ctx.season ? ` — S${ctx.season}E${ctx.episode}` : '');
  listEl.innerHTML = '<p class="empty-state">Searching indexers… this can take up to a minute.</p>';
  modal.classList.remove('hidden');

  const isMovie = ctx.mediaType === 'movie';
  const url = isMovie
    ? `/api/radarr/releases?tmdbId=${ctx.tmdbId}`
    : `/api/sonarr/releases?tvdbId=${ctx.tvdbId}&season=${ctx.season}&episode=${ctx.episode}`;
  const grabUrl = isMovie ? '/api/radarr/releases/grab' : '/api/sonarr/releases/grab';

  try {
    const releases = await api(url);
    if (!releases.length) { listEl.innerHTML = '<p class="empty-state">No releases found.</p>'; return; }
    listEl.innerHTML = releases.map(r => `
      <div class="release-row ${r.rejected ? 'rejected' : ''}">
        <div class="release-info">
          <div class="release-title" title="${escapeHtml(r.title)}">${escapeHtml(r.title)}</div>
          <div class="release-meta">
            ${escapeHtml(r.quality || 'Unknown')} · ${formatBytes(r.sizeBytes)} · ${escapeHtml(r.indexer)}
            · ${r.protocol === 'torrent' ? `${r.seeders ?? 0} seeders` : `${r.ageDays ?? '?'}d old`}
          </div>
          ${r.rejected ? `<div class="release-rejections">${escapeHtml(r.rejections.join(', '))}</div>` : ''}
        </div>
        <button class="grab-btn pill-btn" data-guid="${escapeHtml(r.guid)}" data-indexer-id="${r.indexerId}">
          <span class="state-dot"></span><span class="btn-label">Grab</span>
        </button>
      </div>
    `).join('');
  } catch (e) {
    listEl.innerHTML = `<p class="empty-state">${escapeHtml(e.message || 'Search failed.')}</p>`;
  }

  listEl.onclick = async e => {
    const btn = e.target.closest('.grab-btn');
    if (!btn) return;
    btn.disabled = true;
    btn.querySelector('.btn-label').textContent = 'Grabbing…';
    try {
      await api(grabUrl, {
        method: 'POST',
        body: JSON.stringify({ guid: btn.dataset.guid, indexerId: Number(btn.dataset.indexerId) })
      });
      btn.querySelector('.btn-label').textContent = 'Grabbed ✓';
    } catch (err) {
      btn.disabled = false;
      btn.querySelector('.btn-label').textContent = 'Grab';
    }
  };
}

document.getElementById('close-release-modal-btn').addEventListener('click', () => {
  document.getElementById('release-modal').classList.add('hidden');
});

// ---------- Stack: Disk Space ----------
// One row per actual physical volume (Radarr/Sonarr both report every mount
// point they see, deduped server-side) — reuses the same .bar/.bar-fill
// component already used for UPS battery charge and download progress.
async function loadDiskSpace() {
  const body = document.getElementById('diskspace-body');
  try {
    const disks = await api('/api/owner/diskspace');
    if (!disks.length) { body.innerHTML = '<p class="empty-state">No disk info available.</p>'; return; }
    body.innerHTML = disks.map(d => `
      <div class="dl-row">
        <div class="dl-row-body">
          <div class="now-title">${escapeHtml(d.path)}</div>
          <div class="now-meta">
            <span class="state-dot ${d.usedPercent >= 90 ? 'danger' : ''}"></span>
            ${formatBytes(d.freeBytes)} free of ${formatBytes(d.totalBytes)} · ${d.usedPercent}% used
          </div>
          <div class="bar"><div class="bar-fill" style="width:${d.usedPercent}%"></div></div>
        </div>
      </div>
    `).join('');
  } catch (e) {
    body.innerHTML = '<p class="empty-state">Could not load disk space.</p>';
  }
}

// ---------- Stack: Download Issues ----------
// Not actively downloading and not seeding/complete — i.e. actually stuck or
// failed. Most torrents that are simply idling-while-seeding never show up
// here at all (filtered server-side), so this is meant to stay short.
async function loadDownloadIssues() {
  const body = document.getElementById('download-issues-body');
  try {
    const items = await api('/api/downloads/queue/attention');
    if (!items.length) { body.innerHTML = '<p class="empty-state">Nothing stuck.</p>'; return; }
    body.innerHTML = items.map(d => `
      <div class="dl-row" data-id="${escapeHtml(d.id)}" data-type="${d.type}">
        <div class="dl-row-body">
          <div class="now-title">${escapeHtml(d.name)}</div>
          <div class="now-meta">
            <span class="state-dot paused"></span>
            ${d.type === 'torrent' ? 'Torrent' : 'Usenet'} · ${titleCase(d.state)}
          </div>
        </div>
        <div class="pending-actions">
          <button class="dl-action-btn pill-btn" data-action="${d.state === 'paused' ? 'resume' : 'pause'}">
            <span class="state-dot"></span><span class="btn-label">${d.state === 'paused' ? 'Resume' : 'Pause'}</span>
          </button>
          <button class="dl-remove-btn pill-btn">
            <span class="state-dot danger"></span><span class="btn-label">Remove</span>
          </button>
        </div>
      </div>
    `).join('');
  } catch (e) {
    body.innerHTML = '<p class="empty-state">Could not load download issues.</p>';
  }
}

document.getElementById('download-issues-body').addEventListener('click', async e => {
  const row = e.target.closest('.dl-row');
  if (!row) return;

  const removeBtn = e.target.closest('.dl-remove-btn');
  if (removeBtn) {
    if (!confirm('Remove this download and delete any downloaded files?')) return;
    row.querySelectorAll('button').forEach(b => b.disabled = true);
    removeBtn.querySelector('.btn-label').textContent = '…';
    try {
      await api(`/api/downloads/queue/${row.dataset.type}/${row.dataset.id}`, { method: 'DELETE' });
      row.remove();
      if (!document.getElementById('download-issues-body').children.length) {
        document.getElementById('download-issues-body').innerHTML = '<p class="empty-state">Nothing stuck.</p>';
      }
    } catch (err) {
      row.querySelectorAll('button').forEach(b => b.disabled = false);
      removeBtn.querySelector('.btn-label').textContent = 'Remove';
    }
    return;
  }

  const actionBtn = e.target.closest('.dl-action-btn');
  if (!actionBtn) return;
  const action = actionBtn.dataset.action;
  row.querySelectorAll('button').forEach(b => b.disabled = true);
  actionBtn.querySelector('.btn-label').textContent = '…';
  try {
    await api(`/api/downloads/queue/${row.dataset.type}/${row.dataset.id}/${action}`, { method: 'POST' });
    loadDownloadIssues(); // refetch so the row reflects the real new state
  } catch (err) {
    row.querySelectorAll('button').forEach(b => b.disabled = false);
    actionBtn.querySelector('.btn-label').textContent = action === 'pause' ? 'Pause' : 'Resume';
  }
});

// ---------- Stack: Wanted / Missing ----------
// Monitored movies/episodes that have actually been released but Radarr/
// Sonarr never got a file for — reuses the same release-search modal as
// issues above, since the shape (mediaType/tmdbId or tvdbId+season+episode)
// is identical.
let wantedResults = [];
async function loadWanted() {
  const body = document.getElementById('wanted-body');
  try {
    wantedResults = await api('/api/owner/wanted');
    if (!wantedResults.length) { body.innerHTML = '<p class="empty-state">Nothing missing.</p>'; return; }
    body.innerHTML = wantedResults.map((r, idx) => `
      <div class="pending-row" data-idx="${idx}">
        <img class="result-poster" src="${r.poster || ''}" onerror="this.style.visibility='hidden'">
        <div class="result-info">
          <div class="result-title">${escapeHtml(r.title)}${r.season ? ` — S${r.season}E${r.episode}` : ''}</div>
          <div class="pending-requester">Released ${formatDate(r.date)}</div>
        </div>
        <div class="pending-actions">
          <button class="search-release-btn pill-btn"><span class="state-dot"></span><span class="btn-label">Search</span></button>
        </div>
      </div>
    `).join('');
  } catch (e) {
    body.innerHTML = '<p class="empty-state">Could not load wanted/missing.</p>';
  }
}

// Clicking the Search button on a row goes straight to the release search, as
// before; clicking anywhere else on the row shows poster/overview/release
// details first — same "details before committing" pattern as the main
// dashboard's request modal.
document.getElementById('wanted-body').addEventListener('click', e => {
  const row = e.target.closest('.pending-row');
  if (!row) return;
  const item = wantedResults[Number(row.dataset.idx)];
  if (!item) return;
  if (e.target.closest('.search-release-btn')) {
    openReleaseModal(item);
    return;
  }
  openWantedInfo(item);
});

function openWantedInfo(item) {
  const posterEl = document.getElementById('wanted-info-poster');
  posterEl.style.visibility = '';
  posterEl.src = item.poster || '';
  document.getElementById('wanted-info-title').textContent = item.title || '';
  document.getElementById('wanted-info-badge').textContent = item.mediaType === 'tv' ? 'TV' : 'MOVIE';
  document.getElementById('wanted-info-meta').textContent = item.season
    ? `S${item.season}E${item.episode}${item.episodeTitle ? ' — ' + item.episodeTitle : ''} · Released ${formatDate(item.date)}`
    : `Released ${formatDate(item.date)}`;
  document.getElementById('wanted-info-overview').textContent = item.overview || 'No synopsis available.';
  document.getElementById('wanted-info-search-btn').onclick = () => {
    document.getElementById('wanted-info-modal').classList.add('hidden');
    openReleaseModal(item);
  };
  document.getElementById('wanted-info-modal').classList.remove('hidden');
}

document.getElementById('close-wanted-info-btn').addEventListener('click', () => {
  document.getElementById('wanted-info-modal').classList.add('hidden');
});

// ---------- Stack: Import Issues ----------
// Radarr/Sonarr's own queue, filtered (server-side) to items something's
// actually wrong with — a stuck import, a download client error, etc. —
// not the whole in-progress queue.
async function loadImportIssues() {
  const body = document.getElementById('import-issues-body');
  try {
    const [radarrItems, sonarrItems] = await Promise.all([
      api('/api/radarr/queue').then(items => items.map(i => ({ ...i, service: 'radarr' }))).catch(() => []),
      api('/api/sonarr/queue').then(items => items.map(i => ({ ...i, service: 'sonarr' }))).catch(() => [])
    ]);
    const results = [...radarrItems, ...sonarrItems];
    if (!results.length) { body.innerHTML = '<p class="empty-state">No import issues.</p>'; return; }
    body.innerHTML = results.map(r => `
      <div class="pending-row" data-id="${r.id}" data-service="${r.service}">
        <img class="result-poster" src="${r.poster || ''}" onerror="this.style.visibility='hidden'">
        <div class="result-info">
          <div class="result-title">${escapeHtml(r.title || 'Unknown title')}</div>
          <div class="issue-message">${escapeHtml(r.reason)}</div>
        </div>
        <div class="pending-actions">
          <button class="remove-queue-btn pill-btn"><span class="state-dot danger"></span><span class="btn-label">Remove</span></button>
        </div>
      </div>
    `).join('');
  } catch (e) {
    body.innerHTML = '<p class="empty-state">Could not load import issues.</p>';
  }
}

document.getElementById('import-issues-body').addEventListener('click', async e => {
  const btn = e.target.closest('.remove-queue-btn');
  if (!btn) return;
  if (!confirm('Remove this from the queue and blocklist the release?')) return;
  const row = btn.closest('.pending-row');
  row.querySelectorAll('button').forEach(b => b.disabled = true);
  btn.querySelector('.btn-label').textContent = '…';
  try {
    await api(`/api/${row.dataset.service}/queue/${row.dataset.id}`, { method: 'DELETE' });
    row.remove();
    if (!document.getElementById('import-issues-body').children.length) {
      document.getElementById('import-issues-body').innerHTML = '<p class="empty-state">No import issues.</p>';
    }
  } catch (err) {
    row.querySelectorAll('button').forEach(b => b.disabled = false);
    btn.querySelector('.btn-label').textContent = 'Remove';
  }
});

// ---------- Stack: Indexers ----------
// Read-only health check, reusing the same .monitor-pill component already
// used for Uptime Kuma monitors above — same "dot + name" shape fits fine
// for "is this indexer working" too.
async function loadIndexers() {
  const body = document.getElementById('indexers-body');
  try {
    const results = await api('/api/prowlarr/indexers');
    if (!results.length) { body.innerHTML = '<p class="empty-state">No indexers configured.</p>'; return; }
    body.innerHTML = `<div class="monitor-pills">${results.map(i => `
      <span class="monitor-pill ${i.healthy ? 'up' : 'down'}" title="${escapeHtml(i.reason || '')}">
        <span class="${dotClass(!i.healthy)}"></span>${escapeHtml(i.name)}
      </span>
    `).join('')}</div>`;
  } catch (e) {
    body.innerHTML = '<p class="empty-state">Could not load indexers.</p>';
  }
}
