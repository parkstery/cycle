import { computeDistanceBetween } from './geoUtils';
import { fetchMapillaryStreetCandidates, pickMapillaryStreetCandidate } from './mapillaryStreetView';

/** OSRM 입력을 Mapillary 촬영점 쪽으로만 살짝 당김 — 사용자 탭 위치에서 이 값 초과면 원좌표 유지 */
const MAX_ROUTING_SNAP_M = 52;

export type LatLngPoint = { lat: number; lng: number };

/**
 * 경로 탐색용: 각 정점을 Mapillary Graph 반경 50m 내 가장 가까운 촬영 위치로 보정(우선).
 * 실패·후보 없음·거리 초과 시 해당 정점은 원래 좌표 유지.
 */
export async function snapRoutingChainToMapillaryParallel(
  accessToken: string,
  points: LatLngPoint[],
  init?: { signal?: AbortSignal }
): Promise<LatLngPoint[]> {
  const token = accessToken.trim();
  if (!token.length || !points.length) return points.map((p) => ({ ...p }));

  const snapped = await Promise.all(
    points.map(async (p) => {
      try {
        const candidates = await fetchMapillaryStreetCandidates(token, p.lat, p.lng, init);
        const pick = pickMapillaryStreetCandidate(candidates, p, null);
        if (!pick) return { ...p };
        const d = computeDistanceBetween(p, { lat: pick.lat, lng: pick.lng });
        if (d <= MAX_ROUTING_SNAP_M) return { lat: pick.lat, lng: pick.lng };
        return { ...p };
      } catch {
        return { ...p };
      }
    })
  );
  return snapped;
}
