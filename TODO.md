# Roadmap

## Shipped
- [x] Now Playing — live push updates via Plex WebSocket + SSE, header
      shows total bandwidth alongside the stream count (Tautulli's own
      aggregate, not a manual per-session sum)
- [x] Recently Watched panel (Tautulli history)
- [x] Recently Added panel — split by Movies/TV/Anime, season-pack drops
      collapsed into one entry instead of one per episode, falls back to the
      series synopsis when an episode's own isn't indexed yet
- [x] Top of the Month leaderboard (top viewer/movie/TV/anime)
- [x] Airing Today / Releasing Soon panels (Sonarr/Radarr calendars)
- [x] Download Queue panel (qBittorrent/SABnzbd, actively-downloading only)
- [x] Owner-only System Status (Uptime Kuma monitors + UPS via NUT)
- [x] Request flow — search, season picker for TV, per-user Overseerr
      permissions (not a shared admin key)
- [x] Trending/Discover — request modal's default view before typing a
      search, filtered to things not already owned or requested
- [x] My Requests tab — each family member's own request history and status
- [x] "Available now" toast — pushed live over SSE when Overseerr reports a
      request finished downloading
- [x] PWA / installable, branded per-deployment
- [x] Cycling sign-in taglines / per-deployment branding
- [x] Admin panel — recent sign-ins, admin-wide pending requests with inline
      Approve/Decline
- [x] Report an issue — from a watched item, or library-wide search (show ->
      season -> episode), backed by Overseerr's own issue system
- [x] Admin: resolve issues + live search/grab a replacement release via
      Radarr/Sonarr's own indexers, without leaving the dashboard
- [x] Admin moved to its own page (/admin) instead of hidden dashboard
      panels, room to grow without crowding the family-facing view
- [x] Download Queue gains owner-only Pause/Resume/Remove
- [x] Admin Stack panel — Wanted/Missing (release search reused from
      issues), Import Issues (stuck/failed Radarr/Sonarr queue items, with
      Remove), Prowlarr indexer health, Disk space (Radarr/Sonarr diskspace
      API, deduped to actual physical volumes)
- [x] Plex Watchlist tab in the request modal — each family member's own
      Watchlist, cross-referenced against Overseerr for availability, one-tap
      request straight from it (movies direct, TV through the season picker)
- [x] My Requests status accuracy fix — "Downloading" now means actually
      present in Radarr/Sonarr's queue, not just "Overseerr handed it off"
      (previously showed unreleased/no-release-found items as downloading)
- [x] Admin: Search Library — free-text search across Radarr/Sonarr's own
      tracked library (not TMDB), TV results drill into season -> episode
      before searching indexers, since Sonarr only searches per-episode
- [x] Admin: Force Import for stuck Import Issues — reviews Radarr/Sonarr's
      manual-import candidate and rejection reason, then pushes the import
      through; TBA-title TV rejections trigger a Sonarr series refresh and
      recheck first, since that's often just stale metadata
- [x] Admin: current file info (quality/resolution/codecs/size/date added)
      shown before searching for a replacement, from both Search Library and
      Open Issues — see what you have before deciding to replace it
- [x] CSRF protection — every state-changing request now needs an Origin
      header matching its own Host (no hardcoded domain, no frontend
      changes); Overseerr's server-to-server webhook is explicitly exempted
      since it's already authenticated by its own shared secret
- [x] Automated test coverage (`npm test`, Node's built-in test runner, zero
      new dependencies) — unit tests for the pure logic that's needed fixing
      before: request-availability computation, CSRF origin check, TMDB guid
      extraction, file-info/discover-item mapping. Deliberately scoped to
      logic, not live Radarr/Sonarr/Overseerr integration — that's still
      verified by hand, which has caught more real bugs than fixtures would
- [x] Dependency vulnerabilities cleared (`npm audit`: 12 -> 0, 1 critical/9
      high) — all traced back to sqlite3's build-only toolchain (node-gyp's
      tar/glob/etc., never runs at server runtime). Bumped sqlite3 5.1.7 ->
      6.0.1, added an `overrides` entry for connect-sqlite3's stale peer
      range (it never actually imports sqlite3, just accepts an injected
      Database instance), switched the Dockerfile to `npm ci` for
      reproducible installs. Verified live: existing sessions, Uptime Kuma
      reads, and the login log all still work against the pre-upgrade
      on-disk data with zero migration needed
- [x] CI: `npm test` now runs automatically on every push to main via
      GitHub Actions, showing a pass/fail check right on the repo — no
      longer relies on someone remembering to run it by hand
- [x] Admin: Seeding stat in the Stack panel — count of torrents seeding,
      overall ratio (qBittorrent's real all-time "Global ratio", not the
      session-only figure), plus total uploaded/downloaded — just the
      numbers, no file list
- [x] Admin: Settings page — edit .env values from the browser instead of a
      terminal. Organized by integration (Plex/Tautulli/Overseerr/Sonarr/
      Radarr/qBittorrent/SABnzbd/Uptime Kuma/NUT UPS), each shown as a card
      with a real live health check (Online/Unconfigured/Error, latency,
      version — actually pings the service, not just "is it configured"),
      plus an Edit popup with friendly per-field labels/descriptions.
      Everything not tied to a specific integration (site branding, session/
      cookie behavior, port) lives in a separate Deployment Configuration
      popup. Secrets are masked and never sent to the browser; leaving one
      blank keeps it unchanged. Infrastructure-critical keys (PORT/HOST_PORT/
      CONTAINER_NAME) are read-only since changing them can make the app
      unreachable. Saving triggers a real container restart (Node only loads
      env vars once, at process start) — the popup polls until it's back and
      reloads itself. Verified live end-to-end: all 9 services report real
      status/latency/version, write+restart+session persistence all
      confirmed against the real deployment
- [x] Moved System Status (Uptime Kuma + UPS) and Recent Sign-ins off the
      main admin page into their own Settings tabs (alongside Services),
      loaded lazily on first view instead of always-on background polling.
      Family panel keeps Pending Requests + Open Issues
- [x] Notice Board — Settings tab lets the owner schedule a persistent
      dashboard announcement (e.g. "down Monday night for maintenance") with
      an optional start/end window; shows as a broadcast-style banner above
      the panel grid for every signed-in family member, not a toast that
      disappears after a few seconds. Single current notice, not a list.
      Verified live: posting, a future-scheduled notice correctly staying
      hidden from the family view until its start time, and clearing all
      confirmed against the real deployment. Quick-fill preset buttons for
      common cases (Hardware/Network/Software Issue) plus a just-for-fun row
      (Touch Grass, Watched Everything, Skynet Wisdom) — still fully
      editable before posting, not sent as-is
- [x] **Security fix**: every signed-in family member was incorrectly
      getting isOwner:true (full admin access — Settings, Force Import,
      deleting downloads, everyone's requests). The owner check matched any
      Plex token that could merely *see* this server in its own resources
      list, which includes ordinary shared users, not just the actual
      owner — Plex's own `owned` field on each resource is what actually
      distinguishes the two, and the code never checked it. Confirmed live
      against 6 real family accounts, all showing isOwner:true; fixed and
      force-cleared all 25 active sessions so everyone re-authenticates
      under the corrected check
- [x] Themed confirm dialog — replaces the browser's native confirm() (an
      unstyled OS popup) everywhere it was used: sign-out on both pages,
      removing a download, removing/blocklisting an import-queue item,
      clearing the notice, and the Settings restart warning
- [x] Adopted three ideas from a community fork's PR, adapted cleanly to the
      current codebase rather than merged wholesale (the fork was 44 commits
      behind and its qBittorrent state-mapping would have reintroduced an
      already-fixed bug): qBittorrent API-key auth (>= 5.2.0/WebAPI >= 2.14.1,
      confirmed against the real v5.2.3 deployment) alongside the existing
      username/password flow unchanged; Now Playing skips Tautulli polling
      cleanly instead of spamming errors when it's not configured; and a
      cycling backdrop banner behind the dashboard header, sourced from
      Overseerr's trending/discover feed with a top-of-month poster fallback
- [x] QBITTORRENT_API_KEY wired into the Settings qBittorrent edit form
      (was backend-only before) — also surfaced and fixed a real bug in the
      process: Settings save silently dropped any field not already a line
      in .env, since a deployment's .env can predate a field being added to
      the service registry. applyUpdates now appends missing keys as new
      lines instead of ignoring them. Verified live: switched the real
      deployment from username/password to API-key auth successfully
- [x] Force Start button (torrents only) next to Pause/Resume in Download
      Issues — bypasses qBittorrent's own queue limits and retries even
      after repeated errors, unlike a plain Resume which still respects
      those limits and won't budge a torrent stuck behind them. Verified
      live against two real stalled torrents: state changed from stalledDL
      to forcedDL (force_start:true) in qBittorrent itself after the click
- [x] Hero backdrop banner now cycles randomly instead of walking the
      Overseerr/top-of-month list in a fixed loop — picks a random slide on
      load and a random next slide each interval, only constrained to never
      repeat the one currently on screen. Verified the exact selection logic
      statistically (20k transitions: 0 immediate repeats, ~20% uniform
      distribution across 5 slides) and deployed live to the real container
      via `docker cp` with zero downtime/restart
- [x] My Requests shows an ETA next to "Downloading" (e.g. "Downloading ·
      45m left"), pulled from Radarr/Sonarr's own queue `timeleft` instead of
      leaving it a black box between request and the "Available now" toast.
      For a season pack (multiple episode-level queue records under one
      seriesId), takes the max across them — not fully available until the
      slowest one finishes. Added unit tests for the parsing/aggregation
      logic; verified the restart needed to load the backend change came
      back healthy with real family sessions re-validating cleanly
- [x] **Fix**: Settings showed qBittorrent as Unconfigured after switching
      from username/password to API-key auth — the health check
      (`checkQbittorrent` in serviceHealth.js) only ever checked for
      username+password, never the API key, unlike lib/qbittorrent.js's own
      auth logic which already preferred the key correctly. Now checks for
      either. Verified against the real deployment: the API-key request
      succeeds directly (v5.2.3) and the container restart came back clean
- [x] **Fix**: Prowlarr had no entry in serviceRegistry.js, so PROWLARR_URL/
      PROWLARR_API_KEY fell into the catch-all Deployment Configuration
      popup instead of getting their own Settings service card with a real
      health check — despite Prowlarr already being a first-class
      integration (indexer health in the admin Stack panel). Added a
      registry entry and a checkProwlarr health check (Servarr's own
      /api/v1/system/status). Settings grid is built dynamically from the
      registry, so no frontend changes needed. Verified against the real
      deployment: version 2.4.0.5397 returned successfully, restart came
      back clean
- [x] Click a torrent in Download Queue for details — seeds/peers (connected
      + total), connections (vs. limit, "-1" from qBittorrent handled as
      unlimited rather than shown literally), up/down speed, ratio, ETA,
      save path, and a per-file list with individual progress bars. Pulled
      from qBittorrent's own properties+files endpoints (`getTorrentDetails`
      in lib/qbittorrent.js) via a new owner-agnostic endpoint (same
      visibility as the queue itself — read-only, no control action).
      Torrent-only; SABnzbd/usenet rows aren't clickable, no equivalent data
      available. Added unit tests for the properties+files mapping,
      including the sentinel/edge cases (100-day "no ETA", -1 "no connection
      limit"). Verified live end-to-end against a real torrent in the actual
      queue — correct seeds/peers/size/save path/per-file progress returned
- [x] Owner-only Remove button on actively-downloading torrents in the main
      Download Queue panel (previously Remove only existed in the admin-only
      Download Issues panel, for stuck/paused/errored items — nothing let
      the owner pull a torrent that's downloading normally but shouldn't be,
      e.g. wrong release grabbed). Reuses the existing DELETE
      /queue/torrent/:id endpoint, already owner-gated server-side, so no
      backend changes needed — just an isOwner-gated button client-side,
      same confirm-dialog-then-delete-files pattern as Download Issues.
      Torrent-only, matching the details feature above. Zero-downtime static
      deploy, verified served live
- [x] Disk Space moved from the Stack card into the admin hero masthead
      (previously buried several scrolls down, now the first thing the
      owner sees) and rendered as a per-volume donut gauge instead of a
      linear bar — same amber/danger color semantics as before, extracted
      the dedup-by-capacity logic into lib/diskspace.js. Hero sizes to its
      content instead of the family dashboard's fixed height (which has no
      cycling banner to justify it here, and was clipping volumes on mobile)
- [x] Wanted/Missing moved from Stack to the top of the admin Family card and
      now proactively flags stuck releases in the same list, instead of a
      second near-duplicate section (tried that first, merged after
      noticing the overlap). Every item gets `daysSinceRelease` + a `stuck`
      flag (lib/stuckRequests.js, >= 3 days out with no file — long enough
      that it's not just still propagating across indexers) computed
      server-side; sorted most-overdue-first, stuck ones get a danger dot +
      "Nd overdue", fresh ones render as before. Same info modal + release
      search as always. Verified live against the real Radarr/Sonarr queue:
      17 total wanted/missing, several genuinely stuck for months (one over
      1000 days)
- [x] Web Push for "Available now" — reaches subscribed devices even without
      a tab open, alongside the existing in-app SSE toast (same trigger,
      Overseerr's MEDIA_AVAILABLE webhook, same audience — every subscribed
      device, not scoped to who requested it, matching the SSE toast's own
      broadcast-to-everyone behavior). New bell icon in the header toggles
      subscribe/unsubscribe (hidden entirely if VAPID isn't configured).
      Subscriptions persist in their own push.sqlite (survives sign-out,
      unlike a session) with dead-subscription cleanup on a 404/410 send
      response. Verified live: web-push loads with real VAPID keys, storage
      layer's upsert/multi-user/remove all confirmed, image rebuilt clean
      (new npm dependency) with every earlier feature from this session
      still intact afterward. Note: iOS Safari only supports Web Push from
      an installed PWA, not a regular tab — not fixable app-side, WebKit's
      own restriction
- [x] **Perf audit, dead code**: removed unused `.span1`/`.poster-progress`
      CSS rules and an unused `THRESHOLD_DAYS` export (lib/stuckRequests.js);
      consolidated a byte-identical `parseTimeleft()` duplicated in
      lib/sabnzbd.js and lib/downloadQueueIds.js into lib/parseTimeleft.js.
      Verified nothing else references any of it before removing (checked
      static + dynamic/template-literal usage twice), all 57 tests still
      pass, live-verified both parseTimeleft call sites against real
      SABnzbd/Radarr/Sonarr data post-deploy.
- [x] **Perf audit, images**: added `loading="lazy"` to all 24 `<img>` tags
      (20 dynamic across app.js/admin.js, 4 static modal placeholders) —
      defers offscreen poster/thumbnail loads across Recently Added/Top of
      Month/Airing Today/Upcoming/search results.
- [x] **Perf audit, fonts**: self-hosted Inter/Space Grotesk/JetBrains Mono
      instead of a render-blocking Google Fonts `<link>` in both `<head>`s.
      Discovered Google serves these as variable fonts under the hood — the
      identical file backs every requested weight per subset (e.g. Inter
      400/500/600 latin all resolved to one URL) — so only 6 files
      (latin + latin-ext × 3 families, ~220KB total) were actually needed,
      not the 16 initially fetched. Dropped cyrillic/greek/vietnamese
      subsets entirely (irrelevant for this English-language dashboard).
      Local fonts.css mirrors Google's own @font-face structure exactly
      (same family/weight/unicode-range, just deduplicated files) for
      guaranteed pixel-identical rendering. Verified all 6 files serve with
      correct content-type/size and zero googleapis.com references remain
      in served HTML; visual spot-check still worth doing since I have no
      browser to confirm rendering myself.
- [x] **Perf audit, cache headers**: versioned bundles (app.js/admin.js/
      shared.js/style.css/fonts.css) switched from `no-cache` to
      `public, max-age=31536000, immutable` — safe because each gets a fresh
      `?v=<deploy timestamp>` on every restart, so the response body at any
      given URL is genuinely permanent. `sw.js` deliberately excluded and
      stays `no-cache` — it's the one script registered without a `?v=` (see
      `navigator.serviceWorker.register('sw.js')` in app.js), so long-lived
      caching would have silently blocked future service-worker updates
      from ever reaching clients. Fonts extended the same 1-week treatment
      icons already had (also unversioned, also rarely change). Verified
      every category live — sw.js/manifest/HTML still no-cache, everything
      else immutable/1-week as intended.
- [x] Copyright/version footer on both pages ("{{SITE_NAME}} v{{APP_VERSION}}
      · © {{COPYRIGHT_YEAR}}") — package.json's version is the single source
      of truth, year computed once at startup. Bumped 1.0.0 -> 1.1.0 (122
      commits deep, version had never been bumped once) to reflect tonight's
      batch as a real minor release rather than silently accumulating forever
      under the original number. Verified live on both pages, correctly
      showing this deployment's site name, the new version, and the year

- [x] Releasing Soon now shows a "Downloaded" status label under any movie
      already in the library, matching Airing Today's existing Airing/
      Downloaded pattern — the /api/radarr/upcoming endpoint already
      returned `hasFile`, so this was frontend-only. Caught a real bug in
      the process: the deploy landed on disk via `docker cp` but the
      container was never restarted, so the immutable-cached `app.js?v=...`
      bundle from the perf-audit caching scheme kept serving the old code
      to browsers/Cloudflare regardless — restarting to bump the deploy
      timestamp fixed it. Static frontend deploys now always restart, not
      just backend changes
- [x] My Stats — a fourth tab in the request modal (Search / My Requests /
      Watchlist / My Stats), reachable from the avatar chip which is now
      clickable. Per-signed-in-user, same pattern as My Requests: hours
      watched (last 12 months) as a hero number, family rank/binge streak/
      plays-this-month as tiles, and a top-3 most-watched list reusing Top
      of the Month's medal styling. Hours/plays-this-month come from
      Tautulli's get_user_watch_time_stats (one call covers both windows);
      binge streak and most-watched are computed from raw get_history rows
      (lib/myStats.js, unit tested); family rank reuses the same
      get_home_stats call Top of the Month already makes, just widened to
      365 days. Discovered get_history has no grandparent_thumb (unlike
      get_recently_added) — fixed by fetching a real poster via
      get_metadata for just the top-3 results, not every group. Verified
      live end-to-end against real data (716 hrs/year, rank #2 of 50, real
      Naruto Shippūden/My Hero Academia/K-ON! posters)

- [x] My Stats, round 2: dropped the Most Watched poster — now one flat
      gold/silver/bronze list (medal + title + play count) instead of a big
      #1 poster tile, so the per-item get_metadata round trip is gone
      entirely (computeTopWatched no longer needs a ratingKey at all). Added
      a "Watch Activity" section below it — by-day-of-week and by-hour-of-day
      breakdowns adapted from Tautulli's own Graphs page
      (get_plays_by_dayofweek/get_plays_by_hourofday, scoped to this user,
      y_axis=duration), stacked Movies/TV bars with a legend and hover
      tooltips, bar heights scaled per-chart to that chart's own tallest
      bucket. Live TV is dropped from the parsed series — this deployment
      never has any, so Tautulli's own chart would show a permanently-empty
      third legend entry. Also caught and fixed a real class-name collision:
      the stat-tile card class silently inherited `flex: 1 1 35%; min-width:
      90px` from an unrelated pre-existing Admin Seeding-panel rule of the
      same name — renamed to mystats-tile. Verified live against real data:
      correct hours/plays/rank, and the day/hour breakdowns cross-check
      against each other (a single 2h movie session shows up as both
      Tuesday's 2h Movies bar and hour 13's 2h Movies bar, same session)

## Ideas
