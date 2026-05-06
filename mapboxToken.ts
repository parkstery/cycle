/**
 * Mapbox access token — `.env.local` 의 `VITE_MAPBOX_ACCESS_TOKEN` (vite.config define 으로 주입).
 */
export const MAPBOX_ACCESS_TOKEN = String(import.meta.env.VITE_MAPBOX_ACCESS_TOKEN ?? '').trim();
