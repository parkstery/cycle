/**
 * Open-Elevation API — Google Elevation API 대체용.
 * 경로를 따라 샘플링한 좌표로 POST 한 번에 고도 조회.
 * 웹: /api/elevation 프록시. Capacitor: api.open-elevation.com 직접 POST.
 * @see https://api.open-elevation.com/
 */

import { Capacitor } from '@capacitor/core';

const OPEN_ELEVATION_DIRECT = 'https://api.open-elevation.com/api/v1/lookup';
const OPENTOPODATA_DIRECT = 'https://api.opentopodata.org/v1/srtm90m';
const OPEN_ELEVATION_URL = Capacitor.isNativePlatform() ? OPEN_ELEVATION_DIRECT : '/api/elevation';

export interface OpenElevationResultItem {
  latitude: number;
  longitude: number;
  elevation: number;
}

export interface OpenElevationResponse {
  results: OpenElevationResultItem[];
  /** 실제 응답을 만들어낸 공급자. 자동 폴백/디버그 배지 표시용. */
  usedProvider?: ElevationProvider;
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

async function fetchOpenElevation(locations: Array<{ latitude: number; longitude: number }>): Promise<OpenElevationResponse> {
  const res = await fetch(OPEN_ELEVATION_DIRECT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ locations }),
  });
  if (!res.ok) throw new Error(`Open-Elevation ${res.status}`);
  const data = (await res.json()) as OpenElevationResponse;
  if (!data.results || !Array.isArray(data.results)) throw new Error('Open-Elevation invalid response');
  return data;
}

async function fetchOpenTopoData(locations: Array<{ latitude: number; longitude: number }>): Promise<OpenElevationResponse> {
  const locationsStr = locations.map((l) => `${l.latitude},${l.longitude}`).join('|');
  const url = `${OPENTOPODATA_DIRECT}?locations=${encodeURIComponent(locationsStr)}`;
  const res = await fetch(url, { method: 'GET' });
  if (!res.ok) throw new Error(`OpenTopoData ${res.status}`);
  const data = (await res.json()) as { status?: string; results?: Array<{ elevation?: number }> };
  if (data.status !== 'OK' || !Array.isArray(data.results)) throw new Error('OpenTopoData invalid response');
  const normalized: OpenElevationResponse = {
    results: locations.map((loc, i) => ({
      latitude: loc.latitude,
      longitude: loc.longitude,
      elevation: Number(data.results?.[i]?.elevation ?? 0),
    })),
  };
  return normalized;
}

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
 * 고도 프로필의 급격한 스파이크를 완화하기 위한 이동평균 스무딩.
 * - 입력/출력 길이는 항상 동일하게 유지한다.
 * - 유효하지 않은 값은 0으로 보정한다.
 */
export function smoothElevations(values: number[], windowRadius: number = 2): number[] {
  if (!Array.isArray(values) || values.length === 0) return [];
  const radius = Math.max(0, Math.floor(windowRadius));
  if (radius === 0) {
    return values.map((v) => (Number.isFinite(v) ? v : 0));
  }

  const normalized = values.map((v) => (Number.isFinite(v) ? Number(v) : 0));
  const out = new Array<number>(normalized.length);

  for (let i = 0; i < normalized.length; i++) {
    const start = Math.max(0, i - radius);
    const end = Math.min(normalized.length - 1, i + radius);
    let sum = 0;
    let count = 0;
    for (let j = start; j <= end; j++) {
      sum += normalized[j];
      count++;
    }
    out[i] = count > 0 ? sum / count : normalized[i];
  }

  return out;
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
  if (cached) return { results: cached, usedProvider: provider };

  const locations = samplePath(path, samples);
  // Web: /api/elevation 서버 핸들러(공급자 자동 폴백 내장) 사용
  if (!Capacitor.isNativePlatform()) {
    const body: { locations: Array<{ latitude: number; longitude: number }>; provider?: ElevationProvider } = { locations };
    if (provider) body.provider = provider;
    const res = await fetch(OPEN_ELEVATION_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error(`Elevation ${res.status}`);
    const usedProviderHeader = res.headers.get('X-Elevation-Provider');
    if (usedProviderHeader) console.log('[Elevation] X-Elevation-Provider:', usedProviderHeader);
    const data = (await res.json()) as OpenElevationResponse;
    if (!data.results || !Array.isArray(data.results)) throw new Error('Elevation invalid response');
    if (usedProviderHeader === 'open-elevation' || usedProviderHeader === 'opentopodata') {
      data.usedProvider = usedProviderHeader;
    } else if (provider) {
      data.usedProvider = provider;
    }
    elevationCache.set(key, data.results);
    return data;
  }

  // Native: 외부 공급자를 직접 호출하므로 여기서도 자동 폴백을 수행한다.
  let data: OpenElevationResponse;
  let usedProvider: ElevationProvider;
  if (provider === 'open-elevation') {
    data = await fetchOpenElevation(locations);
    usedProvider = 'open-elevation';
  } else if (provider === 'opentopodata') {
    data = await fetchOpenTopoData(locations);
    usedProvider = 'opentopodata';
  } else {
    try {
      data = await fetchOpenElevation(locations);
      usedProvider = 'open-elevation';
      console.log('[Elevation] provider used (native): open-elevation');
    } catch (primaryErr) {
      console.warn('[Elevation] open-elevation failed, fallback to opentopodata', primaryErr);
      data = await fetchOpenTopoData(locations);
      usedProvider = 'opentopodata';
      console.log('[Elevation] provider used (native): opentopodata');
    }
  }
  data.usedProvider = usedProvider;
  elevationCache.set(key, data.results);
  return data;
}
