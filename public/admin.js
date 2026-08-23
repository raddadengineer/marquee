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

  // System Status and Recent Sign-ins now live under Settings tabs (see
  // below) — loaded lazily on first view rather than eagerly here.
  loadWanted();
  setInterval(loadWanted, 60000);
  loadPendingRequests();
  setInterval(loadPendingRequests, 30000);
  loadAdminIssues();
  setInterval(loadAdminIssues, 30000);
  loadDiskSpace();
  setInterval(loadDiskSpace, 60000);
  loadSeeding();
  setInterval(loadSeeding, 60000);
  loadDownloadIssues();
  setInterval(loadDownloadIssues, 15000);
  loadImportIssues();
  setInterval(loadImportIssues, 30000);
  loadIndexers();
  setInterval(loadIndexers, 60000);
})();

document.getElementById('admin-logout-btn').addEventListener('click', async () => {
  if (!await confirmDialog('Sign out?')) return;
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
        <img class="login-avatar" src="${l.thumb || ''}" loading="lazy" onerror="this.style.visibility='hidden'">
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

// Shared by every poll-refreshed admin list that renders a poster/avatar
// <img> — same problem and fix as Now Playing/Recently Watched on the main
// dashboard (see renderNowPlaying in app.js): a full innerHTML rebuild on
// every poll recreates every <img> from scratch, which visibly reloads/
// flashes it even when nothing in the list actually changed. Reconciles by
// a caller-supplied stable key instead: an existing row (and its <img>) is
// created once and left alone, only updateRow's fields refresh in place.
// The key ends up on the row as data-recon-key — callers whose click
// handlers need to re-locate the source item (rather than reading it
// straight off other data-* attributes) can rely on that being present.
function reconcileList(container, items, keyOf, createRow, updateRow) {
  const incomingKeys = new Set(items.map(item => String(keyOf(item))));
  for (const row of container.querySelectorAll('[data-recon-key]')) {
    if (!incomingKeys.has(row.dataset.reconKey)) row.remove();
  }
  if (!container.querySelector('[data-recon-key]')) container.innerHTML = ''; // clear an empty-state message
  items.forEach(item => {
    const key = String(keyOf(item));
    let row = container.querySelector(`[data-recon-key="${key}"]`);
    if (!row) {
      row = createRow(item);
      row.dataset.reconKey = key;
    }
    updateRow(row, item);
    container.appendChild(row); // no-op DOM move if already in place — keeps row order matching items order
  });
}

function createPendingRequestRow(r) {
  const row = document.createElement('div');
  row.className = 'pending-row';
  row.innerHTML = `
    <img class="result-poster" src="${r.poster || ''}" loading="lazy" onerror="this.style.visibility='hidden'">
    <div class="result-info">
      <div class="result-title"></div>
      <div class="pending-requester">
        <img src="${r.requestedByAvatar || ''}" loading="lazy" onerror="this.style.visibility='hidden'">
        <span class="requester-text"></span>
      </div>
    </div>
    <div class="pending-actions">
      <button class="approve-btn pill-btn"><span class="state-dot"></span><span class="btn-label">Approve</span></button>
      <button class="decline-btn pill-btn"><span class="state-dot danger"></span><span class="btn-label">Decline</span></button>
    </div>
  `;
  return row;
}

function updatePendingRequestRow(row, r) {
  row.dataset.id = r.id;
  row.querySelector('.result-title').textContent = r.title || 'Unknown title';
  row.querySelector('.requester-text').textContent = `${r.requestedBy} · ${timeAgo(r.requestedAt)}`;
}

async function loadPendingRequests() {
  const body = document.getElementById('admin-requests-body');
  try {
    const results = await api('/api/overseerr/requests/pending');
    if (!results.length) { body.innerHTML = '<p class="empty-state">Nothing pending.</p>'; return; }
    reconcileList(body, results, r => r.id, createPendingRequestRow, updatePendingRequestRow);
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

function createAdminIssueRow(r) {
  const row = document.createElement('div');
  row.className = 'pending-row';
  row.innerHTML = `
    <img class="result-poster" src="${r.poster || ''}" loading="lazy" onerror="this.style.visibility='hidden'">
    <div class="result-info">
      <div class="result-title"></div>
      <div class="pending-requester">
        <img src="${r.reportedByAvatar || ''}" loading="lazy" onerror="this.style.visibility='hidden'">
        <span class="requester-text"></span>
      </div>
      <div class="issue-message hidden"></div>
    </div>
    <div class="pending-actions">
      <button class="search-release-btn pill-btn"><span class="state-dot"></span><span class="btn-label">Search</span></button>
      <button class="approve-btn pill-btn"><span class="state-dot"></span><span class="btn-label">Resolve</span></button>
    </div>
  `;
  return row;
}

// The click handler below reads straight off this row's own dataset as
// openReleaseModal/openIssueFileInfo's ctx — every field it could need has
// to be kept current here on every poll, not just the visibly-displayed
// text (setting a data-* attribute doesn't touch the <img>, so this stays
// flicker-free the same way the text-only fields do).
function updateAdminIssueRow(row, r) {
  row.dataset.id = r.id;
  row.dataset.title = r.title || 'Unknown title';
  row.dataset.mediaType = r.mediaType || '';
  row.dataset.tmdbId = r.tmdbId || '';
  row.dataset.tvdbId = r.tvdbId || '';
  row.dataset.season = r.season || '';
  row.dataset.episode = r.episode || '';
  row.dataset.poster = r.poster || '';
  row.querySelector('.result-title').textContent = (r.title || 'Unknown title') + (r.season ? ` — S${r.season}E${r.episode}` : '');
  row.querySelector('.requester-text').textContent = `${r.reportedBy} · ${r.issueType} · ${timeAgo(r.reportedAt)}`;
  const msgEl = row.querySelector('.issue-message');
  if (r.message) { msgEl.textContent = r.message; msgEl.classList.remove('hidden'); }
  else msgEl.classList.add('hidden');
}

async function loadAdminIssues() {
  const body = document.getElementById('admin-issues-body');
  try {
    const results = await api('/api/overseerr/issues/open');
    if (!results.length) { body.innerHTML = '<p class="empty-state">Nothing open.</p>'; return; }
    reconcileList(body, results, r => r.id, createAdminIssueRow, updateAdminIssueRow);
  } catch (e) {
    body.innerHTML = '<p class="empty-state">Could not load issues.</p>';
  }
}

// Same "Search button jumps straight to release search, tapping anywhere else
// on the row shows current-file details first" pattern as Wanted/Missing.
document.getElementById('admin-issues-body').addEventListener('click', async e => {
  const searchBtn = e.target.closest('.search-release-btn');
  if (searchBtn) {
    openReleaseModal(searchBtn.closest('.pending-row').dataset);
    return;
  }

  const approveBtn = e.target.closest('.approve-btn');
  if (approveBtn) {
    const row = approveBtn.closest('.pending-row');
    row.querySelectorAll('button').forEach(b => b.disabled = true);
    approveBtn.querySelector('.btn-label').textContent = '…';
    try {
      await api(`/api/overseerr/issues/${row.dataset.id}/resolve`, { method: 'POST' });
      row.remove();
      if (!document.getElementById('admin-issues-body').children.length) {
        document.getElementById('admin-issues-body').innerHTML = '<p class="empty-state">Nothing open.</p>';
      }
    } catch (err) {
      row.querySelectorAll('button').forEach(b => b.disabled = false);
      approveBtn.querySelector('.btn-label').textContent = 'Resolve';
    }
    return;
  }

  const row = e.target.closest('.pending-row');
  if (!row) return;
  openIssueFileInfo(row.dataset);
});

// Looks up what's currently on disk for a reported item, so the owner sees
// the actual file (quality/size/codec) before deciding to search for a
// replacement — rather than searching blind from just the issue report.
async function openIssueFileInfo(ctx) {
  const isMovie = ctx.mediaType === 'movie';
  openFileInfoModal({
    badge: isMovie ? 'MOVIE' : 'TV',
    title: ctx.title,
    subtitle: ctx.season ? `S${ctx.season}E${ctx.episode}` : '',
    poster: ctx.poster,
    file: undefined, // triggers the "Loading…" state below
    onSearch: () => openReleaseModal(ctx)
  });
  try {
    const url = isMovie
      ? `/api/radarr/file-info?tmdbId=${ctx.tmdbId}`
      : `/api/sonarr/file-info?tvdbId=${ctx.tvdbId}&season=${ctx.season}&episode=${ctx.episode}`;
    const info = await api(url);
    document.getElementById('file-info-details').textContent = formatFileDetails(info.file);
    if (info.poster) document.getElementById('file-info-poster').src = info.poster;
  } catch (e) {
    document.getElementById('file-info-details').textContent = 'Could not load file info.';
  }
}

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
    const row = btn.closest('.release-row');
    const releaseTitle = row.querySelector('.release-title').textContent;
    btn.disabled = true;
    btn.querySelector('.btn-label').textContent = 'Grabbing…';
    try {
      await api(grabUrl, {
        method: 'POST',
        body: JSON.stringify({ guid: btn.dataset.guid, indexerId: Number(btn.dataset.indexerId) })
      });
      trackGrab(row, ctx, isMovie, releaseTitle);
    } catch (err) {
      btn.disabled = false;
      btn.querySelector('.btn-label').textContent = 'Grab';
    }
  };
}

// Turns the grabbed row into a live-tracked status instead of freezing at
// "Grabbed ✓" — polls /grab-status (see routes/radarr.js / routes/sonarr.js)
// every 4s and updates the same row in place through downloading -> importing
// -> done/failed. Stops polling once the modal (and this row with it) is no
// longer in the document, e.g. the owner closed it or searched again.
function renderTrackRow(row, releaseTitle) {
  row.innerHTML = `
    <div class="release-info">
      <div class="release-title" title="${escapeHtml(releaseTitle)}">${escapeHtml(releaseTitle)}</div>
      <div class="track-stage"><span class="state-dot"></span><span class="stage-text">Grabbed</span></div>
      <div class="track-meta">Waiting for the downloader…</div>
      <div class="bar hidden"><div class="bar-fill"></div></div>
    </div>
  `;
}

function updateTrackRow(row, status, ctx, isMovie) {
  const dotEl = row.querySelector('.state-dot');
  const stageEl = row.querySelector('.stage-text');
  const metaEl = row.querySelector('.track-meta');
  const barEl = row.querySelector('.bar');
  dotEl.className = 'state-dot';
  barEl.classList.add('hidden');

  if (status.stage === 'downloading') {
    stageEl.textContent = 'Downloading';
    dotEl.classList.add('amber');
    barEl.classList.remove('hidden');
    row.querySelector('.bar-fill').style.width = (status.progress ?? 0) + '%';
    metaEl.textContent = [
      status.progress != null ? `${status.progress}%` : null,
      status.eta != null ? formatEta(status.eta) : null
    ].filter(Boolean).join(' · ');
  } else if (status.stage === 'importing') {
    stageEl.textContent = 'Importing';
    dotEl.classList.add('amber', 'pulse');
    metaEl.textContent = 'Matching file into the library…';
  } else if (status.stage === 'done') {
    stageEl.textContent = 'Done';
    metaEl.innerHTML = `<span class="track-result-ok">&#10003; Replaced</span> · ${escapeHtml(formatFileDetails(status.file))}`;
  } else if (status.stage === 'failed') {
    stageEl.textContent = 'Import failed';
    dotEl.classList.add('danger');
    metaEl.innerHTML = `<span class="track-result-fail">${escapeHtml(status.reason)}</span>`;
    if (status.downloadId) {
      const fixBtn = document.createElement('button');
      fixBtn.className = 'pill-btn fix-it-btn';
      fixBtn.innerHTML = '<span class="btn-label">Fix it &#8594;</span>';
      fixBtn.addEventListener('click', () => openManualImportModal(isMovie ? 'radarr' : 'sonarr', status.downloadId, ctx.title));
      row.querySelector('.release-info').appendChild(fixBtn);
    }
  } else {
    stageEl.textContent = 'Grabbed';
    metaEl.textContent = 'Waiting for the downloader…';
  }
}

const GRAB_TRACK_TIMEOUT_MS = 5 * 60 * 1000;
const GRAB_TRACK_INTERVAL_MS = 4000;

function trackGrab(row, ctx, isMovie, releaseTitle) {
  renderTrackRow(row, releaseTitle);
  const startedAt = Date.now();
  // Passed through as `since` so the server can tell a freshly-imported
  // file apart from one that was already there before this grab (the
  // "resolve an issue" flow replaces an existing file, so hasFile alone
  // isn't confirmation — see isFileFromThisGrab in lib/grabStatus.js).
  const statusUrl = isMovie
    ? `/api/radarr/grab-status?tmdbId=${ctx.tmdbId}&since=${startedAt}`
    : `/api/sonarr/grab-status?tvdbId=${ctx.tvdbId}&season=${ctx.season}&episode=${ctx.episode}&since=${startedAt}`;

  const poll = async () => {
    if (!document.body.contains(row)) return; // modal closed / list re-rendered since
    try {
      const status = await api(statusUrl);
      updateTrackRow(row, status, ctx, isMovie);
      if (status.stage === 'done' || status.stage === 'failed') return; // terminal
    } catch (e) {
      // Transient network hiccup — just try again next tick.
    }
    if (Date.now() - startedAt > GRAB_TRACK_TIMEOUT_MS) {
      row.querySelector('.track-meta').textContent = 'Taking a while — check Import Issues later.';
      return;
    }
    setTimeout(poll, GRAB_TRACK_INTERVAL_MS);
  };
  poll();
}

document.getElementById('close-release-modal-btn').addEventListener('click', () => {
  document.getElementById('release-modal').classList.add('hidden');
});

// ---------- Stack: Search Library ----------
// Owner-only free-text search across Radarr/Sonarr's own tracked library (not
// TMDB/Overseerr) — lets you jump straight to an indexer search for anything
// already being managed, not just what Wanted/Missing happens to flag (e.g.
// re-grabbing a bad rip, or something Radarr/Sonarr hasn't realized is
// missing yet). Movie results go straight to the existing release-search
// modal; TV results need a season/episode picked first, since Sonarr only
// searches per-episode.
let librarySearchResults = [];
let librarySearchTimer;

document.getElementById('library-search-input').addEventListener('input', e => {
  clearTimeout(librarySearchTimer);
  const q = e.target.value.trim();
  const body = document.getElementById('library-search-body');
  if (!q) { body.innerHTML = '<p class="empty-state">Type to search.</p>'; return; }
  librarySearchTimer = setTimeout(async () => {
    body.innerHTML = '<p class="empty-state">Searching…</p>';
    try {
      const [movies, series] = await Promise.all([
        api(`/api/radarr/search?q=${encodeURIComponent(q)}`),
        api(`/api/sonarr/search?q=${encodeURIComponent(q)}`)
      ]);
      librarySearchResults = [...movies, ...series];
      if (!librarySearchResults.length) { body.innerHTML = '<p class="empty-state">No matches in your library.</p>'; return; }
      body.innerHTML = librarySearchResults.map((r, idx) => `
        <div class="pending-row" data-idx="${idx}">
          <img class="result-poster" src="${r.poster || ''}" loading="lazy" onerror="this.style.visibility='hidden'">
          <div class="result-info">
            <div class="result-title">${escapeHtml(r.title)}${r.year ? ` (${r.year})` : ''}</div>
            <div class="pending-requester">${r.mediaType === 'tv' ? 'Series' : 'Movie'}</div>
          </div>
          <div class="pending-actions">
            <button class="search-release-btn pill-btn"><span class="state-dot"></span><span class="btn-label">Search</span></button>
          </div>
        </div>
      `).join('');
    } catch (e) {
      body.innerHTML = '<p class="empty-state">Search failed.</p>';
    }
  }, 400);
});

// Tapping anywhere on the row acts (not just the Search button) — movies show
// their current file info first, TV shows drill into season -> episode first
// (also landing on the same file-info step) since Sonarr only searches per-episode.
document.getElementById('library-search-body').addEventListener('click', e => {
  const row = e.target.closest('.pending-row');
  if (!row) return;
  const item = librarySearchResults[Number(row.dataset.idx)];
  if (!item) return;
  if (item.mediaType === 'movie') {
    openFileInfoModal({
      badge: 'MOVIE',
      title: item.title,
      subtitle: item.year ? String(item.year) : '',
      poster: item.poster,
      file: item.file,
      onSearch: () => openReleaseModal(item)
    });
  } else {
    openLibraryBrowseSeasons(item);
  }
});

// Remembers which series/season is currently being browsed, so the episode
// list and the "Back to seasons" button know what to reload.
let libraryBrowseContext = null; // { seriesId, tvdbId, title, poster, seasons }
let libraryBrowseEpisodes = [];

function openLibraryBrowseSeasons(series) {
  libraryBrowseContext = { seriesId: series.seriesId, tvdbId: series.tvdbId, title: series.title, poster: series.poster, seasons: series.seasons };
  document.getElementById('library-browse-title').textContent = series.title;
  document.getElementById('library-browse-back').classList.add('hidden');
  const listEl = document.getElementById('library-browse-list');
  listEl.innerHTML = series.seasons.length ? series.seasons.map(se => `
    <div class="browse-row" data-season="${se.seasonNumber}">
      <div class="browse-row-name">Season ${se.seasonNumber}</div>
      <div class="browse-row-index">${se.episodeCount} ep</div>
    </div>
  `).join('') : '<p class="empty-state">No seasons found.</p>';
  document.getElementById('library-browse-modal').classList.remove('hidden');
}

async function openLibraryBrowseEpisodes(season) {
  libraryBrowseContext.season = season;
  document.getElementById('library-browse-title').textContent = `${libraryBrowseContext.title} — Season ${season}`;
  document.getElementById('library-browse-back').classList.remove('hidden');
  const listEl = document.getElementById('library-browse-list');
  listEl.innerHTML = '<p class="empty-state">Loading…</p>';
  try {
    libraryBrowseEpisodes = await api(`/api/sonarr/episodes?seriesId=${libraryBrowseContext.seriesId}&season=${season}`);
    listEl.innerHTML = libraryBrowseEpisodes.length ? libraryBrowseEpisodes.map(ep => `
      <div class="browse-row" data-episode="${ep.episodeNumber}">
        <div class="browse-row-name">${ep.episodeNumber}. ${escapeHtml(ep.title || 'TBA')}</div>
        ${ep.hasFile ? '<div class="browse-row-index">Have file</div>' : ''}
      </div>
    `).join('') : '<p class="empty-state">No episodes found.</p>';
  } catch (e) {
    listEl.innerHTML = '<p class="empty-state">Could not load episodes.</p>';
  }
}

document.getElementById('library-browse-list').addEventListener('click', e => {
  const seasonRow = e.target.closest('[data-season]');
  if (seasonRow) { openLibraryBrowseEpisodes(Number(seasonRow.dataset.season)); return; }

  const epRow = e.target.closest('[data-episode]');
  if (!epRow) return;
  const episodeNumber = Number(epRow.dataset.episode);
  const ep = libraryBrowseEpisodes.find(x => x.episodeNumber === episodeNumber);
  document.getElementById('library-browse-modal').classList.add('hidden');
  openFileInfoModal({
    badge: 'TV',
    title: libraryBrowseContext.title,
    subtitle: `S${libraryBrowseContext.season}E${episodeNumber}${ep?.title ? ' — ' + ep.title : ''}`,
    poster: libraryBrowseContext.poster,
    file: ep?.file || null,
    onSearch: () => openReleaseModal({
      mediaType: 'tv',
      tvdbId: libraryBrowseContext.tvdbId,
      season: libraryBrowseContext.season,
      episode: episodeNumber,
      title: libraryBrowseContext.title
    })
  });
});

// ---------- Current file info (shown before jumping to release search) ----------
function formatFileDetails(file) {
  return file
    ? [file.quality, file.resolution, file.videoCodec, file.audioCodec, formatBytes(file.size), file.releaseGroup]
        .filter(Boolean).join(' · ') + (file.dateAdded ? ` · added ${formatDate(file.dateAdded)}` : '')
    : 'No file on disk yet.';
}

// `file` is undefined when the caller doesn't have the answer yet (Open
// Issues fetches it after opening) — distinct from null, which means the
// server already confirmed there's no file.
function openFileInfoModal({ badge, title, subtitle, poster, file, onSearch }) {
  document.getElementById('file-info-badge').textContent = badge;
  document.getElementById('file-info-title').textContent = title || '';
  document.getElementById('file-info-subtitle').textContent = subtitle || '';
  const posterEl = document.getElementById('file-info-poster');
  posterEl.style.visibility = '';
  posterEl.src = poster || '';
  document.getElementById('file-info-details').textContent = file === undefined ? 'Loading…' : formatFileDetails(file);
  document.getElementById('file-info-search-btn').onclick = () => {
    document.getElementById('file-info-modal').classList.add('hidden');
    onSearch();
  };
  document.getElementById('file-info-modal').classList.remove('hidden');
}

document.getElementById('close-file-info-btn').addEventListener('click', () => {
  document.getElementById('file-info-modal').classList.add('hidden');
});

document.getElementById('library-browse-back').addEventListener('click', () => {
  openLibraryBrowseSeasons(libraryBrowseContext);
});

document.getElementById('close-library-browse-btn').addEventListener('click', () => {
  document.getElementById('library-browse-modal').classList.add('hidden');
});

// ---------- Stack: Disk Space ----------
// One row per actual physical volume (deduped server-side, see lib/diskspace.js)
// — a per-volume donut gauge (.disk-donut) instead of a linear bar, same
// amber/danger color semantics as the state-dot next to it.
function diskDonut(usedPercent, danger) {
  return `
    <svg class="disk-donut" viewBox="0 0 36 36">
      <circle class="disk-donut-track" cx="18" cy="18" r="15.5" pathLength="100"></circle>
      <circle class="disk-donut-fill${danger ? ' danger' : ''}" cx="18" cy="18" r="15.5" pathLength="100" stroke-dasharray="${usedPercent} 100"></circle>
    </svg>
  `;
}

async function loadDiskSpace() {
  const body = document.getElementById('diskspace-body');
  try {
    const disks = await api('/api/owner/diskspace');
    if (!disks.length) { body.innerHTML = '<p class="empty-state">No disk info available.</p>'; return; }
    body.innerHTML = disks.map(d => {
      const danger = d.usedPercent >= 90;
      return `
      <div class="dl-row">
        ${diskDonut(d.usedPercent, danger)}
        <div class="dl-row-body">
          <div class="now-title">${escapeHtml(d.path)}</div>
          <div class="now-meta">
            <span class="state-dot ${danger ? 'danger' : ''}"></span>
            ${formatBytes(d.freeBytes)} free of ${formatBytes(d.totalBytes)} · ${d.usedPercent}% used
          </div>
        </div>
      </div>
    `;
    }).join('');
  } catch (e) {
    body.innerHTML = '<p class="empty-state">Could not load disk space.</p>';
  }
}

// ---------- Stack: Seeding ----------
// Just the count + overall ratio, no per-torrent list — qBittorrent's own
// "Global ratio" (all-time uploaded/downloaded), not a session-only figure.
async function loadSeeding() {
  const body = document.getElementById('seeding-body');
  try {
    const stats = await api('/api/downloads/seeding');
    if (!stats) { body.innerHTML = '<p class="empty-state">qBittorrent not configured.</p>'; return; }
    body.innerHTML = `
      <div class="stat-pair">
        <div class="stat-tile">
          <div class="stat-value">${stats.seedingCount}</div>
          <div class="stat-label">Seeding</div>
        </div>
        <div class="stat-tile">
          <div class="stat-value">${stats.ratio == null ? '—' : stats.ratio.toFixed(2)}</div>
          <div class="stat-label">Ratio</div>
        </div>
        <div class="stat-tile">
          <div class="stat-value">${formatBytes(stats.uploadedBytes)}</div>
          <div class="stat-label">Uploaded</div>
        </div>
        <div class="stat-tile">
          <div class="stat-value">${formatBytes(stats.downloadedBytes)}</div>
          <div class="stat-label">Downloaded</div>
        </div>
      </div>
    `;
  } catch (e) {
    body.innerHTML = '<p class="empty-state">Could not load seeding stats.</p>';
  }
}

// ---------- Stack: Download Issues ----------
// Not actively downloading and not seeding/complete — i.e. actually stuck or
// failed. Most torrents that are simply idling-while-seeding never show up
// here at all (filtered server-side), so this is meant to stay short.
function createDownloadIssueRow() {
  const row = document.createElement('div');
  row.className = 'dl-row';
  row.innerHTML = `
    <div class="dl-row-body">
      <div class="now-title"></div>
      <div class="now-meta"><span class="state-dot paused"></span><span class="dl-meta-text"></span></div>
    </div>
    <div class="pending-actions">
      <button class="dl-action-btn pill-btn" data-action="pause"><span class="state-dot"></span><span class="btn-label">Pause</span></button>
      <button class="dl-action-btn pill-btn hidden" data-action="force" title="Bypasses qBittorrent's own queue limits and retries even after errors — different from Resume, which still respects them"><span class="state-dot"></span><span class="btn-label">Force</span></button>
      <button class="dl-remove-btn pill-btn"><span class="state-dot danger"></span><span class="btn-label">Remove</span></button>
    </div>
  `;
  return row;
}

function updateDownloadIssueRow(row, d) {
  row.dataset.id = d.id;
  row.dataset.type = d.type;
  row.querySelectorAll('button').forEach(b => b.disabled = false);
  row.querySelector('.now-title').textContent = d.name;
  row.querySelector('.dl-meta-text').textContent = `${d.type === 'torrent' ? 'Torrent' : 'Usenet'} · ${titleCase(d.state)}`;

  const pauseResumeBtn = row.querySelector('[data-action="pause"], [data-action="resume"]');
  pauseResumeBtn.dataset.action = d.state === 'paused' ? 'resume' : 'pause';
  pauseResumeBtn.querySelector('.btn-label').textContent = d.state === 'paused' ? 'Resume' : 'Pause';

  row.querySelector('[data-action="force"]').classList.toggle('hidden', d.type !== 'torrent');
  row.querySelector('.dl-remove-btn .btn-label').textContent = 'Remove';
}

async function loadDownloadIssues() {
  const body = document.getElementById('download-issues-body');
  try {
    const items = await api('/api/downloads/queue/attention');
    if (!items.length) { body.innerHTML = '<p class="empty-state">Nothing stuck.</p>'; return; }
    reconcileList(body, items, d => `${d.type}-${d.id}`, createDownloadIssueRow, updateDownloadIssueRow);
  } catch (e) {
    body.innerHTML = '<p class="empty-state">Could not load download issues.</p>';
  }
}

document.getElementById('download-issues-body').addEventListener('click', async e => {
  const row = e.target.closest('.dl-row');
  if (!row) return;

  const removeBtn = e.target.closest('.dl-remove-btn');
  if (removeBtn) {
    if (!await confirmDialog('Remove this download and delete any downloaded files?')) return;
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
  const ACTION_LABELS = { pause: 'Pause', resume: 'Resume', force: 'Force' };
  row.querySelectorAll('button').forEach(b => b.disabled = true);
  actionBtn.querySelector('.btn-label').textContent = '…';
  try {
    await api(`/api/downloads/queue/${row.dataset.type}/${row.dataset.id}/${action}`, { method: 'POST' });
    loadDownloadIssues(); // refetch so the row reflects the real new state
  } catch (err) {
    row.querySelectorAll('button').forEach(b => b.disabled = false);
    actionBtn.querySelector('.btn-label').textContent = ACTION_LABELS[action] || action;
  }
});

// ---------- Family: Wanted / Missing ----------
// Monitored movies/episodes that have actually been released but Radarr/
// Sonarr never got a file for — reuses the same release-search modal as
// issues above, since the shape (mediaType/tmdbId or tvdbId+season+episode)
// is identical. Sorted most-overdue-first server-side, with `stuck` flagging
// releases out long enough to be worth calling out rather than a separate
// list — moved to the top of the page (was Stack) since that's the point of
// flagging it at all: something that prompts the owner to notice, not a
// second place they'd have to remember to check.
let wantedResults = [];

// A movie's tmdbId or an episode's tvdbId+season+episode — stable across
// polls, unlike array position (which reconciling by index would silently
// break the moment the sort order shifts, e.g. a newly-stuck item jumping
// to the top).
function wantedKey(r) {
  return r.mediaType === 'movie' ? `m${r.tmdbId}` : `e${r.tvdbId}-${r.season}-${r.episode}`;
}

function createWantedRow() {
  const row = document.createElement('div');
  row.className = 'pending-row';
  row.innerHTML = `
    <img class="result-poster" loading="lazy" onerror="this.style.visibility='hidden'">
    <div class="result-info">
      <div class="result-title"></div>
      <div class="pending-requester"></div>
    </div>
    <div class="pending-actions">
      <button class="search-release-btn pill-btn"><span class="state-dot"></span><span class="btn-label">Search</span></button>
    </div>
  `;
  return row;
}

function updateWantedRow(row, r) {
  const posterImg = row.querySelector('.result-poster');
  if (posterImg.getAttribute('src') == null) posterImg.src = r.poster || ''; // set once — never touched again
  row.querySelector('.result-title').textContent = r.title + (r.season ? ` — S${r.season}E${r.episode}` : '');
  row.querySelector('.pending-requester').innerHTML =
    `${r.stuck ? '<span class="state-dot danger"></span>' : ''}Released ${formatDate(r.date)}${r.stuck ? ` · ${r.daysSinceRelease}d overdue` : ''}`;
}

async function loadWanted() {
  const body = document.getElementById('wanted-body');
  try {
    wantedResults = await api('/api/owner/wanted');
    if (!wantedResults.length) { body.innerHTML = '<p class="empty-state">Nothing missing.</p>'; return; }
    reconcileList(body, wantedResults, wantedKey, createWantedRow, updateWantedRow);
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
  const item = wantedResults.find(r => wantedKey(r) === row.dataset.reconKey);
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
function createImportIssueRow(r) {
  const row = document.createElement('div');
  row.className = 'pending-row';
  row.innerHTML = `
    <img class="result-poster" src="${r.poster || ''}" loading="lazy" onerror="this.style.visibility='hidden'">
    <div class="result-info">
      <div class="result-title"></div>
      <div class="issue-message"></div>
    </div>
    <div class="pending-actions">
      <button class="force-import-btn pill-btn hidden"><span class="state-dot"></span><span class="btn-label">Force Import</span></button>
      <button class="remove-queue-btn pill-btn"><span class="state-dot danger"></span><span class="btn-label">Remove</span></button>
    </div>
  `;
  return row;
}

function updateImportIssueRow(row, r) {
  row.dataset.id = r.id;
  row.dataset.service = r.service;
  row.dataset.downloadId = r.downloadId || '';
  row.dataset.title = r.title || 'Unknown title';
  row.querySelector('.result-title').textContent = r.title || 'Unknown title';
  row.querySelector('.issue-message').textContent = r.reason;
  row.querySelector('.force-import-btn').classList.toggle('hidden', !r.downloadId);
}

async function loadImportIssues() {
  const body = document.getElementById('import-issues-body');
  try {
    const [radarrItems, sonarrItems] = await Promise.all([
      api('/api/radarr/queue').then(items => items.map(i => ({ ...i, service: 'radarr' }))).catch(() => []),
      api('/api/sonarr/queue').then(items => items.map(i => ({ ...i, service: 'sonarr' }))).catch(() => [])
    ]);
    const results = [...radarrItems, ...sonarrItems];
    if (!results.length) { body.innerHTML = '<p class="empty-state">No import issues.</p>'; return; }
    // service+id, not id alone — Radarr's and Sonarr's queue ids are separate
    // spaces and could otherwise collide once combined into one list.
    reconcileList(body, results, r => `${r.service}-${r.id}`, createImportIssueRow, updateImportIssueRow);
  } catch (e) {
    body.innerHTML = '<p class="empty-state">Could not load import issues.</p>';
  }
}

document.getElementById('import-issues-body').addEventListener('click', async e => {
  const importBtn = e.target.closest('.force-import-btn');
  if (importBtn) {
    const row = importBtn.closest('.pending-row');
    openManualImportModal(row.dataset.service, row.dataset.downloadId, row.dataset.title);
    return;
  }

  const btn = e.target.closest('.remove-queue-btn');
  if (!btn) return;
  if (!await confirmDialog('Remove this from the queue and blocklist the release?')) return;
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

// ---------- Manual import ----------
// Shows what Radarr/Sonarr actually found in the download's folder — its best
// guess at which movie/episode it belongs to, and why it refused to import
// automatically (rejections) — so forcing it through is an informed choice,
// not a blind override. "Force Import" resubmits exactly the match Radarr/
// Sonarr already suggested; this isn't a "pick a different movie" tool.
let manualImportCandidates = [];
async function openManualImportModal(service, downloadId, title) {
  const modal = document.getElementById('manual-import-modal');
  const listEl = document.getElementById('manual-import-list');
  document.getElementById('manual-import-title').textContent = title;
  listEl.innerHTML = '<p class="empty-state">Loading… (if a TV episode title is still TBA, this refreshes the series first — can take up to 20s)</p>';
  modal.classList.remove('hidden');

  try {
    manualImportCandidates = await api(`/api/${service}/manual-import?downloadId=${encodeURIComponent(downloadId)}`);
    if (!manualImportCandidates.length) { listEl.innerHTML = '<p class="empty-state">No files found.</p>'; return; }
    listEl.innerHTML = manualImportCandidates.map((c, idx) => {
      const matched = service === 'radarr' ? c.movieTitle : (c.seriesTitle ? `${c.seriesTitle} — ${c.episodeLabel}` : null);
      return `
        <div class="release-row ${c.rejections.length ? 'rejected' : ''}">
          <div class="release-info">
            <div class="release-title" title="${escapeHtml(c.name || c.path)}">${escapeHtml(c.name || c.path)}</div>
            <div class="release-meta">
              ${matched ? `Matched: ${escapeHtml(matched)}` : 'No match found'}
              ${c.quality?.quality?.name ? ' · ' + escapeHtml(c.quality.quality.name) : ''}
            </div>
            ${c.rejections.length ? `<div class="release-rejections">${escapeHtml(c.rejections.join(', '))}</div>` : ''}
          </div>
          ${matched ? `
            <button class="force-import-confirm-btn pill-btn" data-idx="${idx}">
              <span class="state-dot"></span><span class="btn-label">Force Import</span>
            </button>
          ` : ''}
        </div>
      `;
    }).join('');
  } catch (e) {
    listEl.innerHTML = `<p class="empty-state">${escapeHtml(e.message || 'Could not look up import candidates.')}</p>`;
  }

  listEl.onclick = async e => {
    const btn = e.target.closest('.force-import-confirm-btn');
    if (!btn) return;
    const c = manualImportCandidates[Number(btn.dataset.idx)];
    if (!c) return;
    btn.disabled = true;
    btn.querySelector('.btn-label').textContent = 'Importing…';
    try {
      const payload = service === 'radarr'
        ? { path: c.path, folderName: c.folderName, movieId: c.movieId, quality: c.quality, languages: c.languages, releaseGroup: c.releaseGroup, indexerFlags: c.indexerFlags, downloadId: c.downloadId }
        : { path: c.path, folderName: c.folderName, seriesId: c.seriesId, episodeIds: c.episodeIds, quality: c.quality, languages: c.languages, releaseGroup: c.releaseGroup, indexerFlags: c.indexerFlags, downloadId: c.downloadId };
      await api(`/api/${service}/manual-import`, { method: 'POST', body: JSON.stringify(payload) });
      btn.querySelector('.btn-label').textContent = 'Importing ✓';
      loadImportIssues(); // the queue row should clear once the import lands
    } catch (err) {
      btn.disabled = false;
      btn.querySelector('.btn-label').textContent = 'Force Import';
    }
  };
}

document.getElementById('close-manual-import-btn').addEventListener('click', () => {
  document.getElementById('manual-import-modal').classList.add('hidden');
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

// ---------- Settings ----------
// Two layers: an overview modal (service health grid + a Deployment button),
// and a shared edit popup that either a service card's Edit button or the
// Deployment button populates. Secrets are never sent to the browser (only
// whether one is currently set) — leaving a secret field blank means "don't
// change it," not "clear it." Node only loads env vars once at process
// start, so any save triggers a real container restart (the save endpoint
// exits the process; Docker's restart:unless-stopped policy brings it back
// up with the new values) — the edit popup then polls until the server
// responds again and reloads the page.

document.getElementById('open-settings-btn').addEventListener('click', openSettings);

// Services / System Status / Recent Sign-ins — same tabbed-modal pattern as
// the family dashboard's request modal. The latter two were previously
// always-visible panels on the admin page itself; moved here and made lazy
// (loaded on first view, not eagerly on page load or on an interval) since
// Settings is a "check occasionally" surface, not a live dashboard.
const settingsTabs = [
  { btn: document.getElementById('tab-settings-services-btn'), pane: document.getElementById('settings-services-tab') },
  { btn: document.getElementById('tab-settings-status-btn'), pane: document.getElementById('settings-status-tab') },
  { btn: document.getElementById('tab-settings-signins-btn'), pane: document.getElementById('settings-signins-tab') },
  { btn: document.getElementById('tab-settings-notice-btn'), pane: document.getElementById('settings-notice-tab') },
  { btn: document.getElementById('tab-settings-privacy-btn'), pane: document.getElementById('settings-privacy-tab') }
];
function activateSettingsTab(btn) {
  for (const t of settingsTabs) {
    if (!t.btn || !t.pane) continue;
    const isActive = t.btn === btn;
    t.btn.classList.toggle('active', isActive);
    t.pane.classList.toggle('hidden', !isActive);
  }
}
let ownerStatusLoaded = false;
let adminLoginsLoaded = false;
let noticeSettingsLoaded = false;
let privacySettingsLoaded = false;

settingsTabs[0].btn?.addEventListener('click', () => activateSettingsTab(settingsTabs[0].btn));
settingsTabs[1].btn?.addEventListener('click', () => {
  activateSettingsTab(settingsTabs[1].btn);
  if (!ownerStatusLoaded) { ownerStatusLoaded = true; loadOwnerStatus(); }
});
settingsTabs[2].btn?.addEventListener('click', () => {
  activateSettingsTab(settingsTabs[2].btn);
  if (!adminLoginsLoaded) { adminLoginsLoaded = true; loadAdminLogins(); }
});
settingsTabs[3].btn?.addEventListener('click', () => {
  activateSettingsTab(settingsTabs[3].btn);
  if (!noticeSettingsLoaded) { noticeSettingsLoaded = true; loadNoticeSettings(); }
});
settingsTabs[4].btn?.addEventListener('click', () => {
  activateSettingsTab(settingsTabs[4].btn);
  if (!privacySettingsLoaded) { privacySettingsLoaded = true; loadPrivacySettings(); }
});

async function loadPrivacySettings() {
  const status = document.getElementById('privacy-save-status');
  if (status) status.classList.add('hidden');
  try {
    const privacy = await api('/api/settings/privacy');
    if (document.getElementById('privacy-stream-user-input')) {
      document.getElementById('privacy-stream-user-input').value = privacy.PRIVACY_STREAM_USER_IDENTITY || 'full';
      document.getElementById('privacy-stream-media-input').value = privacy.PRIVACY_STREAM_MEDIA_CONTENT || 'full_details';
      document.getElementById('privacy-stream-tech-input').value = privacy.PRIVACY_STREAM_TECHNICAL || 'full_technical';
      document.getElementById('privacy-metrics-input').value = privacy.PRIVACY_SYSTEM_METRICS || 'full_paths';
      document.getElementById('privacy-stats-input').value = privacy.PRIVACY_STATS || 'full_leaderboard';
    }
  } catch (e) {
    console.error('Failed to load privacy settings', e);
  }
}

document.getElementById('privacy-preset-strict')?.addEventListener('click', () => {
  document.getElementById('privacy-stream-user-input').value = 'mask_usernames';
  document.getElementById('privacy-stream-media-input').value = 'category_only';
  document.getElementById('privacy-stream-tech-input').value = 'hide_all_transcode';
  document.getElementById('privacy-metrics-input').value = 'percent_only';
  document.getElementById('privacy-stats-input').value = 'disable_leaderboard';
});

document.getElementById('privacy-preset-family')?.addEventListener('click', () => {
  document.getElementById('privacy-stream-user-input').value = 'generic_labels';
  document.getElementById('privacy-stream-media-input').value = 'show_name_only';
  document.getElementById('privacy-stream-tech-input').value = 'hide_network_ip';
  document.getElementById('privacy-metrics-input').value = 'mask_paths';
  document.getElementById('privacy-stats-input').value = 'anonymous_leaderboard';
});

document.getElementById('privacy-preset-full')?.addEventListener('click', () => {
  document.getElementById('privacy-stream-user-input').value = 'full';
  document.getElementById('privacy-stream-media-input').value = 'full_details';
  document.getElementById('privacy-stream-tech-input').value = 'full_technical';
  document.getElementById('privacy-metrics-input').value = 'full_paths';
  document.getElementById('privacy-stats-input').value = 'full_leaderboard';
});

document.getElementById('privacy-save-btn')?.addEventListener('click', async () => {
  const statusEl = document.getElementById('privacy-save-status');
  statusEl.className = 'settings-status';
  statusEl.textContent = 'Saving privacy settings…';
  statusEl.classList.remove('hidden');

  const changes = {
    PRIVACY_STREAM_USER_IDENTITY: document.getElementById('privacy-stream-user-input').value,
    PRIVACY_STREAM_MEDIA_CONTENT: document.getElementById('privacy-stream-media-input').value,
    PRIVACY_STREAM_TECHNICAL: document.getElementById('privacy-stream-tech-input').value,
    PRIVACY_SYSTEM_METRICS: document.getElementById('privacy-metrics-input').value,
    PRIVACY_STATS: document.getElementById('privacy-stats-input').value
  };

  try {
    await api('/api/settings', { method: 'POST', body: JSON.stringify({ changes }) });
    statusEl.className = 'settings-status ok';
    statusEl.textContent = 'Privacy settings saved! Restarting container to apply…';
  } catch (err) {
    statusEl.className = 'settings-status error';
    statusEl.textContent = err.message || 'Could not save privacy settings.';
  }
});

async function openSettings() {
  document.getElementById('settings-modal').classList.remove('hidden');
  activateSettingsTab(settingsTabs[0].btn);
  loadServiceHealth();
}

document.getElementById('close-settings-btn').addEventListener('click', () => {
  document.getElementById('settings-modal').classList.add('hidden');
});

document.getElementById('run-health-check-btn').addEventListener('click', loadServiceHealth);

async function loadServiceHealth() {
  const grid = document.getElementById('service-grid');
  grid.innerHTML = '<p class="empty-state">Checking services…</p>';
  try {
    const services = await api('/api/settings/services');
    grid.innerHTML = services.map(s => {
      const h = s.health || { status: 'unconfigured' };
      const statusText = h.status === 'online'
        ? escapeHtml(String(h.detail))
        : h.status === 'error' ? escapeHtml(h.message || 'Unreachable') : 'Not configured';
      const badgeLabel = h.status === 'online' ? 'Online' : h.status === 'error' ? 'Error' : 'Unconfigured';
      return `
        <div class="service-card">
          <div class="service-card-head">
            <span class="service-card-name">${escapeHtml(s.label)}</span>
            <span class="service-badge ${h.status}">${badgeLabel}</span>
          </div>
          <div class="service-card-meta">${h.status === 'online' ? `&#9889; ${h.latencyMs}ms` : ''}</div>
          <div class="service-card-foot">
            <span class="service-card-status-text" title="${statusText}">${statusText}</span>
            <button class="pill-btn" data-service="${s.key}" data-label="${escapeHtml(s.label)}">Edit &#9998;</button>
          </div>
        </div>
      `;
    }).join('');
  } catch (e) {
    grid.innerHTML = `<p class="empty-state">${escapeHtml(e.message || 'Could not check services.')}</p>`;
  }
}

document.getElementById('service-grid').addEventListener('click', e => {
  const btn = e.target.closest('[data-service]');
  if (!btn) return;
  openSettingsEdit(`/api/settings/services/${btn.dataset.service}`, `${btn.dataset.label} Configuration`);
});

document.getElementById('edit-deployment-btn').addEventListener('click', () => {
  openSettingsEdit('/api/settings/deployment', 'Deployment Configuration');
});

// ---- Shared edit popup ----
let settingsEditFields = [];

async function openSettingsEdit(url, title) {
  const modal = document.getElementById('settings-edit-modal');
  const body = document.getElementById('settings-edit-body');
  const saveBtn = document.getElementById('settings-edit-save-btn');
  const status = document.getElementById('settings-edit-status');
  document.getElementById('settings-edit-title').textContent = title;
  status.className = 'settings-status hidden';
  status.textContent = '';
  saveBtn.disabled = true;
  saveBtn.textContent = 'Save Changes';
  body.innerHTML = '<p class="empty-state">Loading…</p>';
  modal.classList.remove('hidden');

  try {
    const data = await api(url);
    settingsEditFields = data.fields || data; // /deployment returns a bare array, /services/:key returns {fields}
    renderSettingsEdit();
  } catch (e) {
    body.innerHTML = `<p class="empty-state">${escapeHtml(e.message || 'Could not load settings.')}</p>`;
  }
}

function renderSettingsEdit() {
  const body = document.getElementById('settings-edit-body');
  body.innerHTML = settingsEditFields.map(f => {
    let inputHtml;
    if (f.readOnly) {
      inputHtml = `<input class="settings-input-full" type="text" value="${escapeHtml(f.value || '')}" disabled title="Read-only — changing this could make the app unreachable">`;
    } else if (f.isBoolean) {
      inputHtml = `
        <label class="settings-toggle">
          <input type="checkbox" data-key="${f.key}" data-type="boolean" ${f.value === 'true' ? 'checked' : ''}>
          <span class="settings-toggle-slider"></span>
        </label>
      `;
    } else if (f.isSecret) {
      const placeholder = f.hasValue ? '•••• set — leave blank to keep' : 'Not set';
      inputHtml = `<input class="settings-input-full" type="password" data-key="${f.key}" data-type="secret" placeholder="${placeholder}" autocomplete="off">`;
    } else {
      inputHtml = `<input class="settings-input-full" type="text" data-key="${f.key}" data-type="text" value="${escapeHtml(f.value || '')}">`;
      if (f.key === 'TAUTULLI_LIBRARIES') {
        inputHtml += `
          <div class="settings-detect-row" style="margin-top: 0.5rem; display: flex; gap: 0.5rem; align-items: center;">
            <button type="button" id="detect-tautulli-libs-btn" class="pill-btn" style="padding: 0.25rem 0.5rem; font-size: 0.85rem;">Auto-Detect Libraries</button>
            <span id="detect-tautulli-libs-status" style="font-size: 0.85rem; opacity: 0.8;"></span>
          </div>
        `;
      }
    }
    return `
      <div class="settings-field-block">
        <label class="settings-field-block-label">${escapeHtml(f.label || f.key)}</label>
        ${inputHtml}
        ${f.description ? `<p class="settings-field-block-desc">${escapeHtml(f.description)}</p>` : ''}
      </div>
    `;
  }).join('');
  body.querySelectorAll('[data-key]').forEach(el => {
    el.addEventListener('input', updateSettingsEditSaveState);
    el.addEventListener('change', updateSettingsEditSaveState);
  });

  const detectBtn = body.querySelector('#detect-tautulli-libs-btn');
  if (detectBtn) {
    detectBtn.addEventListener('click', async () => {
      const statusEl = body.querySelector('#detect-tautulli-libs-status');
      statusEl.textContent = 'Detecting...';
      statusEl.style.color = '';
      try {
        const libs = await api('/api/tautulli/libraries');
        if (libs && libs.length > 0) {
          const formatted = libs.map(l => `${l.name}:${l.sectionId}`).join(', ');
          const input = body.querySelector('[data-key="TAUTULLI_LIBRARIES"]');
          if (input) {
            input.value = formatted;
            input.dispatchEvent(new Event('input'));
          }
          statusEl.textContent = 'Success!';
          statusEl.style.color = '#4caf50';
        } else {
          statusEl.textContent = 'No libraries found.';
          statusEl.style.color = '#f44336';
        }
      } catch (err) {
        statusEl.textContent = 'Error: ' + (err.message || 'Ensure Tautulli is configured.');
        statusEl.style.color = '#f44336';
      }
    });
  }
}

function collectSettingsEditChanges() {
  const changes = {};
  document.querySelectorAll('#settings-edit-body [data-key]').forEach(el => {
    const key = el.dataset.key;
    const field = settingsEditFields.find(f => f.key === key);
    if (el.dataset.type === 'boolean') {
      const newValue = el.checked ? 'true' : 'false';
      if (newValue !== field.value) changes[key] = newValue;
    } else if (el.dataset.type === 'secret') {
      if (el.value !== '') changes[key] = el.value;
    } else if (el.value !== (field.value || '')) {
      changes[key] = el.value;
    }
  });
  return changes;
}

function updateSettingsEditSaveState() {
  document.getElementById('settings-edit-save-btn').disabled = !Object.keys(collectSettingsEditChanges()).length;
}

document.getElementById('close-settings-edit-btn').addEventListener('click', closeSettingsEdit);
document.getElementById('settings-edit-cancel-btn').addEventListener('click', closeSettingsEdit);
function closeSettingsEdit() {
  document.getElementById('settings-edit-modal').classList.add('hidden');
}

document.getElementById('settings-edit-save-btn').addEventListener('click', async () => {
  const changes = collectSettingsEditChanges();
  if (!Object.keys(changes).length) return;

  const changingSessionSecret = Object.prototype.hasOwnProperty.call(changes, 'SESSION_SECRET');
  const warning = changingSessionSecret
    ? 'This includes SESSION_SECRET — saving will sign out every family member, including you. The app will restart and this page will reload automatically. Continue?'
    : 'Save these changes? The app will restart (a few seconds of downtime) and this page will reload automatically.';
  if (!await confirmDialog(warning)) return;

  const saveBtn = document.getElementById('settings-edit-save-btn');
  const status = document.getElementById('settings-edit-status');
  saveBtn.disabled = true;
  saveBtn.textContent = 'Saving…';
  status.className = 'settings-status';
  status.textContent = '';

  try {
    await api('/api/settings', { method: 'POST', body: JSON.stringify({ changes }) });
    status.className = 'settings-status ok';
    status.textContent = 'Saved — restarting…';
    saveBtn.textContent = 'Restarting…';
    waitForSettingsRestart();
  } catch (e) {
    status.className = 'settings-status error';
    status.textContent = e.message || 'Could not save settings.';
    saveBtn.disabled = false;
    saveBtn.textContent = 'Save Changes';
  }
});

// Polls until the server answers again (any HTTP status — even 401 after a
// SESSION_SECRET change means it's back up) rather than a fixed delay, which
// would either reload too early or make the owner wait longer than needed.
async function waitForSettingsRestart() {
  await new Promise(r => setTimeout(r, 2000)); // give the process a moment to actually exit first
  const deadline = Date.now() + 60000;
  while (Date.now() < deadline) {
    try {
      const res = await fetch('/api/auth/me', { credentials: 'include' });
      if (res.status) { location.reload(); return; }
    } catch (e) { /* still down — keep polling */ }
    await new Promise(r => setTimeout(r, 1500));
  }
  document.getElementById('settings-edit-status').textContent = 'Taking longer than expected — try reloading the page manually.';
}

// ---------- Settings: Notice Board ----------
// A single scheduled announcement shown on the family dashboard (e.g.
// "down Monday night for maintenance") — not a list of notices, one row,
// overwritten each time it's posted. No restart needed here (unlike the
// rest of Settings): this reads/writes its own small db, not .env.
function toDatetimeLocal(epochMs) {
  if (!epochMs) return '';
  const d = new Date(epochMs);
  const pad = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
function formatNoticeDateTime(epochMs) {
  return new Date(epochMs).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

// Quick-start templates — fill the textarea, still fully editable before
// posting, not sent as-is. Second row is just for fun, not a real outage
// category — kept visually separate from the three above.
const NOTICE_PRESETS = {
  hardware: "We're experiencing a hardware issue with the server. Some features may be temporarily unavailable while we look into it.",
  network: "We're experiencing network connectivity issues. Streaming and requests may be slow or unavailable until this is resolved.",
  software: "We're troubleshooting a software issue affecting the server. Some features may not work correctly until this is resolved.",
  touchGrass: "Go touch grass. The couch isn't going anywhere.",
  watchedEverything: "Pretty sure you've watched everything at this point. Maybe try a walk?",
  skynetWisdom: "Skynet has determined you need sunlight. This is not a request."
};
document.querySelectorAll('[data-preset]').forEach(btn => {
  btn.addEventListener('click', () => {
    document.getElementById('notice-message-input').value = NOTICE_PRESETS[btn.dataset.preset];
  });
});

async function loadNoticeSettings() {
  const statusEl = document.getElementById('notice-status-text');
  const clearBtn = document.getElementById('notice-clear-btn');
  const messageInput = document.getElementById('notice-message-input');
  const startsInput = document.getElementById('notice-starts-input');
  const endsInput = document.getElementById('notice-ends-input');
  try {
    const current = await api('/api/notice/admin');
    if (!current) {
      statusEl.textContent = 'Nothing posted right now.';
      messageInput.value = '';
      startsInput.value = '';
      endsInput.value = '';
      clearBtn.classList.add('hidden');
      return;
    }
    const statusText = {
      active: 'Currently showing on the dashboard.',
      scheduled: `Scheduled to start ${formatNoticeDateTime(current.startsAt)}.`,
      expired: `Expired ${formatNoticeDateTime(current.endsAt)} — no longer showing.`
    };
    statusEl.textContent = statusText[current.status] || '';
    messageInput.value = current.message || '';
    startsInput.value = toDatetimeLocal(current.startsAt);
    endsInput.value = toDatetimeLocal(current.endsAt);
    clearBtn.classList.remove('hidden');
  } catch (e) {
    statusEl.textContent = 'Could not load notice.';
  }
}

document.getElementById('notice-save-btn').addEventListener('click', async () => {
  const message = document.getElementById('notice-message-input').value.trim();
  const startsValue = document.getElementById('notice-starts-input').value;
  const endsValue = document.getElementById('notice-ends-input').value;
  const statusMsg = document.getElementById('notice-save-status');
  statusMsg.className = 'settings-status';
  statusMsg.textContent = '';

  if (!message) {
    statusMsg.className = 'settings-status error';
    statusMsg.textContent = 'Message is required.';
    return;
  }
  // Resolved from the browser's own local time here, not sent as a bare
  // date-time string — the server would otherwise parse that against its
  // own timezone instead of whatever the owner actually picked.
  const startsAt = startsValue ? new Date(startsValue).getTime() : null;
  const endsAt = endsValue ? new Date(endsValue).getTime() : null;

  const btn = document.getElementById('notice-save-btn');
  btn.disabled = true;
  btn.textContent = 'Posting…';
  try {
    await api('/api/notice', { method: 'POST', body: JSON.stringify({ message, startsAt, endsAt }) });
    statusMsg.className = 'settings-status ok';
    statusMsg.textContent = 'Saved.';
    loadNoticeSettings();
  } catch (e) {
    statusMsg.className = 'settings-status error';
    statusMsg.textContent = e.message || 'Could not save notice.';
  } finally {
    btn.disabled = false;
    btn.textContent = 'Post Notice';
  }
});

document.getElementById('notice-clear-btn').addEventListener('click', async () => {
  if (!await confirmDialog('Clear the current notice? Family members will stop seeing it immediately.')) return;
  try {
    await api('/api/notice', { method: 'DELETE' });
    loadNoticeSettings();
  } catch (e) {
    document.getElementById('notice-save-status').textContent = 'Could not clear notice.';
  }
});
