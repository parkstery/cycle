import { computeDistanceBetween } from './geoUtils';
import { fetchMapillaryStreetCandidates, pickMapillaryStreetCandidate } from './mapillaryStreetView';
import type { MapillaryStreetCandidate } from './mapillaryStreetView';

/** OSRM 입력을 Mapillary 촬영점 쪽으로만 살짝 당김 — 사용자 탭 위치에서 이 값 초과면 원좌표 유지 */
const MAX_ROUTING_SNAP_M = 52;

export type LatLngPoint = { lat: number; lng: number };

/** 경로 탐색 시 켜진 커버리지와 동일한 기준. 중첩 시 OSRM > Mapillary 기본 > Mapillary 360. 전부 꺼지면 OSRM만 탐색(프리스냅 없음). */
export type RouteSnapCoverageSelection = {
  osrmCoverage: boolean;
  mapillaryBasic: boolean;
  mapillaryPano360: boolean;
};

function isTruthyPano(c: MapillaryStreetCandidate): boolean {
  return c.isPano === true;
}

function snapOnePointWithCandidates(
  p: LatLngPoint,
  candidates: MapillaryStreetCandidate[],
  coverage: RouteSnapCoverageSelection
): LatLngPoint {
  if (coverage.osrmCoverage) return { ...p };

  const noneMapillaryOn = !coverage.mapillaryBasic && !coverage.mapillaryPano360;
  if (noneMapillaryOn) return { ...p };

  const tryPick = (subset: MapillaryStreetCandidate[]): LatLngPoint | null => {
    if (!subset.length) return null;
    const pick = pickMapillaryStreetCandidate(subset, p, null);
    if (!pick) return null;
    const d = computeDistanceBetween(p, { lat: pick.lat, lng: pick.lng });
    if (d <= MAX_ROUTING_SNAP_M) return { lat: pick.lat, lng: pick.lng };
    return null;
  };

  if (coverage.mapillaryBasic) {
    const nonPano = candidates.filter((c) => !isTruthyPano(c));
    const s = tryPick(nonPano);
    if (s) return s;
  }
  if (coverage.mapillaryPano360) {
    const panoOnly = candidates.filter(isTruthyPano);
    const s = tryPick(panoOnly);
    if (s) return s;
  }
  return { ...p };
}

/**
 * 경로 탐색용: 켜진 커버리지에 맞춰 정점을 Mapillary 그래프 근처로 보정.
 * - OSRM 커버리지가 켜지면 Mapillary 프리스냅을 하지 않는다(1순위).
 * - Mapillary 기본·360이 같이 켜지면 같은 위치에서 비파노 후보를 먼저 쓴다(2순위 → 3순위).
 * - 커버리지 미전달 시: 기존과 같이 기본+360 스냅을 시도한다.
 */
export async function snapRoutingChainToMapillaryParallel(
  accessToken: string,
  points: LatLngPoint[],
  init?: { signal?: AbortSignal; coverage?: RouteSnapCoverageSelection }
): Promise<LatLngPoint[]> {
  const token = accessToken.trim();
  if (!token.length || !points.length) return points.map((p) => ({ ...p }));

  const coverage: RouteSnapCoverageSelection =
    init?.coverage ?? {
      osrmCoverage: false,
      mapillaryBasic: true,
      mapillaryPano360: true,
    };

  const noneOn =
    !coverage.osrmCoverage && !coverage.mapillaryBasic && !coverage.mapillaryPano360;
  if (noneOn) return points.map((p) => ({ ...p }));
  if (coverage.osrmCoverage) return points.map((p) => ({ ...p }));

  const snapped = await Promise.all(
    points.map(async (p) => {
      try {
        const candidates = await fetchMapillaryStreetCandidates(token, p.lat, p.lng, init);
        return snapOnePointWithCandidates(p, candidates, coverage);
      } catch {
        return { ...p };
      }
    })
  );
  return snapped;
}
