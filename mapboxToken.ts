/**
 * Mapbox access token (Phase 2).
 * GitHub push protection은 저장소에 `pk.` 토큰 원문 커밋을 막을 수 있으므로,
 * **실제 토큰은 커밋하지 말고** 프로젝트 루트 `.env.local` 등에만 둡니다.
 *
 * 예: `.env.local`
 *   VITE_MAPBOX_ACCESS_TOKEN=pk.여기에_본인_Mapbox_default_public_token
 */
export const MAPBOX_ACCESS_TOKEN = String(
  typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.VITE_MAPBOX_ACCESS_TOKEN
    ? import.meta.env.VITE_MAPBOX_ACCESS_TOKEN
    : ''
).trim();
