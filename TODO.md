# Roadmap

## Shipped
- [x] Now Playing — live push updates via Plex WebSocket + SSE
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
      Remove), Prowlarr indexer health

## Ideas
- [ ] Disk space (Sonarr/Radarr diskspace API)
- [ ] Kid-safe mode
- [ ] Plex Watchlist integration
- [ ] Audiobookshelf/Mylar3 integration
