import type { OpenElevationResponse } from './openElevation';
import type { TravelMode } from '../types';

function costingForTravelMode(mode: TravelMode): string {
  if (mode === TravelMode.DRIVING) return 'auto';
  if (mode === TravelMode.WALKING) return 'pedestrian';
  return 'bicycle';
}

/**
 * OSRM path(LatLng[])에서 일부 지점만 뽑아 Valhalla route 의 elevation_interval 프로필을 받는다.
 * breaks 가 너무 많으면 비용·불안정이 커지므로 상한을 둔다.
 */
export function pickWaypointLatLngsForValhalla(path: any[], maxPoints: number = 40): any[] {
  if (!path?.length) return [];
  if (path.length <= maxPoints) return path.slice();
  const out: any[] = [];
  const last = path.length - 1;
  for (let k = 0; k < maxPoints; k++) {
    const idx = Math.round((k / (maxPoints - 1)) * last);
    out.push(path[idx]);
  }
  // 끝점이 중복으로 빠지는 경우 보정
  if (out[out.length - 1] !== path[last]) out[out.length - 1] = path[last];
  return out;
}

/**
 * 웹: /api/valhalla-elevation (Vercel serverless). Capacitor 네이티브는 동일 엔드포인트가 없을 수 있어
 * 호출 전 App 쪽에서 엔진 선택/폴백을 처리하는 것을 권장.
 */
export async function getValhallaElevationAlongOsrmPath(
  path: any[],
  mode: TravelMode,
  options?: { elevationIntervalM?: number; maxWaypoints?: number }
): Promise<OpenElevationResponse> {
  const waypoints = pickWaypointLatLngsForValhalla(path, options?.maxWaypoints ?? 40);
  const locations = waypoints.map((p: any) => {
    const lat = typeof p.lat === 'function' ? p.lat() : p.lat;
    const lng = typeof p.lng === 'function' ? p.lng() : p.lng;
    return { lat, lng };
  });

  const res = await fetch('/api/valhalla-elevation', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      locations,
      costing: costingForTravelMode(mode),
      elevation_interval: options?.elevationIntervalM ?? 30,
      units: 'kilometers',
    }),
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`Valhalla elevation proxy ${res.status}: ${t}`);
  }
  const data = (await res.json()) as OpenElevationResponse;
  if (!data.results || !Array.isArray(data.results)) throw new Error('Valhalla elevation invalid response');
  return data;
}
