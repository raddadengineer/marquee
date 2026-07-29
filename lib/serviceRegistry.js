// Single source of truth for which .env fields belong to which integration —
// used both by the health-check grid (lib/serviceHealth.js) and the
// per-service edit popups (routes/settings.js). Field-level descriptions
// mirror the ones already in .env's own comments where one exists.
const SERVICES = [
  {
    key: 'plex', label: 'Plex',
    fields: [
      { key: 'PLEX_SERVER_URL', label: 'Server URL', description: 'URL to reach your Plex server.' },
      { key: 'PLEX_ADMIN_TOKEN', label: 'Admin Token', description: 'Admin/owner token for your Plex server.' },
      { key: 'PLEX_MACHINE_ID', label: 'Machine Identifier', description: "Your Plex server's machine identifier." },
      { key: 'PLEX_CLIENT_ID', label: 'Client ID', description: 'A stable random UUID identifying this app to plex.tv (generate once, keep forever).' }
    ]
  },
  {
    key: 'tautulli', label: 'Tautulli',
    fields: [
      { key: 'TAUTULLI_URL', label: 'Tautulli URL', description: 'URL to reach Tautulli.' },
      { key: 'TAUTULLI_API_KEY', label: 'API Key', description: 'Tautulli API key.' },
      { key: 'TAUTULLI_LIBRARIES', label: 'Custom Libraries', description: 'Custom Plex libraries (comma-separated Label:SectionID format, e.g. Movies:2, TV Shows:1). Auto-detectable from the button below.' },
      { key: 'TAUTULLI_SECTION_MOVIES', label: 'Movies Section ID', description: 'Plex library section ID for movies — optional, legacy fallback.' },
      { key: 'TAUTULLI_SECTION_TV', label: 'TV Section ID', description: 'Plex library section ID for TV — optional, legacy fallback.' },
      { key: 'TAUTULLI_SECTION_ANIME', label: 'Anime Section ID', description: 'Plex library section ID for anime — optional, legacy fallback.' }
    ]
  },
  {
    key: 'overseerr', label: 'Overseerr',
    fields: [
      { key: 'OVERSEERR_URL', label: 'Overseerr URL', description: 'URL to reach Overseerr/Jellyseerr.' },
      { key: 'OVERSEERR_API_KEY', label: 'API Key', description: 'Overseerr API key.' },
      { key: 'OVERSEERR_WEBHOOK_SECRET', label: 'Webhook Secret', description: "Shared secret this app checks against Overseerr's webhook Authorization header." },
      { key: 'OVERSEERR_WEBHOOK_FORWARD_URL', label: 'Webhook Forward URL', description: 'Optional — forwards Overseerr webhook payloads on to another existing integration.' }
    ]
  },
  {
    key: 'sonarr', label: 'Sonarr',
    fields: [
      { key: 'SONARR_URL', label: 'Sonarr URL', description: 'URL to reach Sonarr.' },
      { key: 'SONARR_API_KEY', label: 'API Key', description: 'Sonarr API key.' }
    ]
  },
  {
    key: 'radarr', label: 'Radarr',
    fields: [
      { key: 'RADARR_URL', label: 'Radarr URL', description: 'URL to reach Radarr.' },
      { key: 'RADARR_API_KEY', label: 'API Key', description: 'Radarr API key.' }
    ]
  },
  {
    key: 'prowlarr', label: 'Prowlarr',
    fields: [
      { key: 'PROWLARR_URL', label: 'Prowlarr URL', description: 'URL to reach Prowlarr.' },
      { key: 'PROWLARR_API_KEY', label: 'API Key', description: 'Prowlarr API key.' }
    ]
  },
  {
    key: 'qbittorrent', label: 'qBittorrent',
    fields: [
      { key: 'QBITTORRENT_URL', label: 'WebUI URL', description: 'URL to reach qBittorrent WebUI.' },
      { key: 'QBITTORRENT_API_KEY', label: 'API Key', description: 'qBittorrent >= 5.2.0 only (WebUI > Settings > General). Preferred over Username/Password below when set — leave Username/Password blank if you use this.' },
      { key: 'QBITTORRENT_USERNAME', label: 'Username', description: 'WebUI username — only used if API Key above is blank.' },
      { key: 'QBITTORRENT_PASSWORD', label: 'Password', description: 'WebUI password — only used if API Key above is blank.' }
    ]
  },
  {
    key: 'sabnzbd', label: 'SABnzbd',
    fields: [
      { key: 'SABNZBD_URL', label: 'SABnzbd URL', description: 'URL to reach SABnzbd.' },
      { key: 'SABNZBD_API_KEY', label: 'API Key', description: 'SABnzbd API key.' }
    ]
  },
  {
    key: 'uptimeKuma', label: 'Uptime Kuma',
    fields: [
      { key: 'UPTIME_KUMA_DATA_DIR', label: 'Data Directory', description: "Uptime Kuma's data directory on the host — bind-mounted read-only into this container." },
      { key: 'UPTIME_KUMA_DB_PATH', label: 'Database Path', description: 'Path to kuma.db as seen inside this container (matches the bind-mount destination).' }
    ]
  },
  {
    key: 'nutUps', label: 'NUT UPS',
    fields: [
      { key: 'NUT_HOST', label: 'Host', description: 'Hostname/IP of the NUT server.' },
      { key: 'NUT_PORT', label: 'Port', description: 'NUT server port (default 3493).' },
      { key: 'NUT_USERNAME', label: 'Username', description: 'NUT username.' },
      { key: 'NUT_PASSWORD', label: 'Password', description: 'NUT password.' },
      { key: 'NUT_UPS_NAME', label: 'UPS Name', description: 'Name of the UPS as configured in NUT.' }
    ]
  }
];

module.exports = { SERVICES };
