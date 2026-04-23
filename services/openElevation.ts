/**
 * Open-Elevation API — Google Elevation API 대체용.
 * 경로를 따라 샘플링한 좌표로 POST 한 번에 고도 조회.
 * 웹: /api/elevation 프록시. Capacitor: api.open-elevation.com 직접 POST.
 * @see https://api.open-elevation.com/
 */

import { Capacitor } from '@capacitor/core';

const OPEN_ELEVATION_DIRECT = 'https://api.open-elevation.com/api/v1/lookup';
const OPEN_ELEVATION_URL = Capacitor.isNativePlatform() ? OPEN_ELEVATION_DIRECT : '/api/elevation';

export interface OpenElevationResultItem {
  latitude: number;
  longitude: number;
  elevation: number;
}

export interface OpenElevationResponse {
  results: OpenElevationResultItem[];
}

/** LatLng 호환: .lat() .lng() 또는 .lat .lng */
function getLatLng(p: { lat?: number | (() => number); lng?: number | (() => number) }): { lat: number; lng: number } {
  const lat = typeof p.lat === 'function' ? p.lat() : (p.lat as number) ?? 0;
  const lng = typeof p.lng === 'function' ? p.lng() : (p.lng as number) ?? 0;
  return { lat, lng };
}

type LatLngLike = { lat?: number | (() => number); lng?: number | (() => number) };

/** path를 따라 samples개 지점 샘플링 (인덱스 균등) */
function samplePath(path: LatLngLike[], samples: number): Array<{ latitude: number; longitude: number }> {
  if (path.length === 0) return [];
  if (path.length === 1) {
    const { lat, lng } = getLatLng(path[0]);
    return Array(samples).fill(null).map(() => ({ latitude: lat, longitude: lng }));
  }
  const locations: Array<{ latitude: number; longitude: number }> = [];
  for (let i = 0; i < samples; i++) {
    const t = samples === 1 ? 0 : i / (samples - 1);
    const idx = Math.min(Math.floor(t * (path.length - 1)), path.length - 1);
    const { lat, lng } = getLatLng(path[idx]);
    locations.push({ latitude: lat, longitude: lng });
  }
  return locations;
}

/** 경로 문자열화 (캐시 키용, 소수점 5자리) */
function pathCacheKey(path: LatLngLike[], samples: number): string {
  const pts = samplePath(path, samples);
  return pts.map(p => `${p.latitude.toFixed(5)},${p.longitude.toFixed(5)}`).join('|');
}

const elevationCache = new Map<string, OpenElevationResultItem[]>();

export type ElevationProvider = 'open-elevation' | 'opentopodata';

/**
 * 경로 길이에 따라 elevation 샘플링 수를 정한다.
 * 서버 없이 무료 API 의존이라 과도한 호출을 피하기 위해 상한 200.
 * 경로는 calculateRoute 단계에서 ~10m 간격으로 densify 되므로
 * 포인트 수로 길이를 근사한다.
 */
export function elevationSamplesForPath(pointCount: number, intervalM: number = 10): number {
  const approxMeters = Math.max(0, pointCount - 1) * intervalM;
  if (approxMeters <= 20_000) return 100;
  if (approxMeters <= 50_000) return 150;
  return 200;
}

/**
 * 경로를 따라 samples개 지점의 고도를 조회.
 * options.provider 지정 시 해당 공급자만 사용(이중화 테스트: URL ?elevation_provider=opentopodata 활용).
 * 반환: { results: [{ latitude, longitude, elevation }] } — App에서 location(LatLng)으로 매핑용.
 */
export async function getElevationAlongPath(
  path: LatLngLike[],
  samples: number = 100,
  options?: { provider?: ElevationProvider }
): Promise<OpenElevationResponse> {
  if (path.length === 0) return { results: [] };

  const provider = options?.provider;
  const key = pathCacheKey(path, samples) + (provider ? `:${provider}` : '');
  const cached = elevationCache.get(key);
  if (cached) return { results: cached };

  const locations = samplePath(path, samples);
  const body: { locations: Array<{ latitude: number; longitude: number }>; provider?: ElevationProvider } = { locations };
  if (provider) body.provider = provider;

  const res = await fetch(OPEN_ELEVATION_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`Elevation ${res.status}`);
  const usedProvider = res.headers.get('X-Elevation-Provider');
  if (usedProvider) console.log('[Elevation] X-Elevation-Provider:', usedProvider);
  const data = (await res.json()) as OpenElevationResponse;
  if (!data.results || !Array.isArray(data.results)) throw new Error('Elevation invalid response');
  elevationCache.set(key, data.results);
  return data;
}
