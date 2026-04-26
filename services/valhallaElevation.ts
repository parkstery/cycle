import { Capacitor } from '@capacitor/core';
import type { OpenElevationResponse } from './openElevation';
import type { TravelMode } from '../types';

/** 웹: 상대 경로 프록시. 네이티브: 빌드 시 `VITE_VALHALLA_ELEVATION_API_URL`(https 전체 URL) 필요. */
export function getValhallaElevationApiUrl(): string {
  const fromEnv = (import.meta.env.VITE_VALHALLA_ELEVATION_API_URL as string | undefined)?.trim();
  if (Capacitor.isNativePlatform()) {
    if (fromEnv && /^https:\/\//i.test(fromEnv)) return fromEnv.replace(/\/$/, '');
    return '';
  }
  return '/api/valhalla-elevation';
}

export function isValhallaElevationConfigured(): boolean {
  return getValhallaElevationApiUrl().length > 0;
}

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
 * 웹: /api/valhalla-elevation. 네이티브: VITE_VALHALLA_ELEVATION_API_URL 로 배포된 동일 API POST URL.
 */
export async function getValhallaElevationAlongOsrmPath(
  path: any[],
  mode: TravelMode,
  options?: { elevationIntervalM?: number; maxWaypoints?: number }
): Promise<OpenElevationResponse> {
  const endpoint = getValhallaElevationApiUrl();
  if (!endpoint) {
    throw new Error('Valhalla 표고 URL 미설정 — Android 빌드에 VITE_VALHALLA_ELEVATION_API_URL 을 넣어 주세요.');
  }

  const waypoints = pickWaypointLatLngsForValhalla(path, options?.maxWaypoints ?? 40);
  const locations = waypoints.map((p: any) => {
    const lat = typeof p.lat === 'function' ? p.lat() : p.lat;
    const lng = typeof p.lng === 'function' ? p.lng() : p.lng;
    return { lat, lng };
  });

  const res = await fetch(endpoint, {
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
