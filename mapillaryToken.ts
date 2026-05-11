/**
 * Mapillary client token — `.env.local` 의 `VITE_MAPILLARY_CLIENT_TOKEN` (vite.config define).
 * 저장소에 토큰 원문을 커밋하지 말 것.
 */
export const MAPILLARY_CLIENT_TOKEN = String(import.meta.env.VITE_MAPILLARY_CLIENT_TOKEN ?? '').trim();
