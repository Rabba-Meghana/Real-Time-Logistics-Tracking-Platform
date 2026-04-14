// All configuration from environment variables — no hardcoding
const env = import.meta.env;

export const config = {
  apiBaseUrl: env.VITE_API_BASE_URL ?? '',
  wsBaseUrl: env.VITE_WS_BASE_URL ?? `ws://${window.location.host}`,
  mapTileUrl: env.VITE_MAP_TILE_URL ?? 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
  mapTileAttribution: env.VITE_MAP_TILE_ATTRIBUTION ?? '&copy; OpenStreetMap contributors',
  positionRefreshMs: Number(env.VITE_POSITION_REFRESH_MS ?? 5000),
  metricsRefreshMs: Number(env.VITE_METRICS_REFRESH_MS ?? 30000),
  defaultMapCenter: {
    lat: Number(env.VITE_MAP_CENTER_LAT ?? 38.5),
    lon: Number(env.VITE_MAP_CENTER_LON ?? -90.0),
  },
  defaultMapZoom: Number(env.VITE_MAP_ZOOM ?? 5),
} as const;
