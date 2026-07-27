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

## Ideas
- [ ] Continue Watching / resume progress panel (Tautulli already tracks
      per-user watch position — reuse for a "pick up where you left off" tile)
