/**
 * Open-Elevation API — Google Elevation API 대체용.
 * 경로를 따라 샘플링한 좌표로 POST 한 번에 고도 조회.
 * 웹·네이티브(WebView) 공통: 가능하면 같은 출처의 /api/elevation 프록시(Vite·Vercel)를 쓴다.
 * Android WebView에서 Origin이 https://localhost 일 때 외부 표고 API는 CORS로 자주 막히므로 프록시 우선.
 * 프로덕션 앱: `.env.production` 의 VITE_ELEVATION_PROXY_ORIGIN(배포 웹 URL)로 원격 /api/elevation 호출.
 * 그마저 없으면 네이티브에서만 외부 직접 호출로 폴백(CORS로 실패할 수 있음).
 * @see https://api.open-elevation.com/
 */

import { Capacitor } from '@capacitor/core';

const OPEN_ELEVATION_DIRECT = 'https://api.open-elevation.com/api/v1/lookup';
const OPENTOPODATA_DIRECT = 'https://api.opentopodata.org/v1/srtm90m';

/** http(s) 페이지에서만 동작; capacitor:// 등이면 null */
function elevationProxyPostUrl(): string | null {
  if (typeof window === 'undefined') return null;
  const { protocol, hostname } = window.location;
  if (protocol !== 'http:' && protocol !== 'https:') return null;
  if (!hostname) return null;
  return `${window.location.origin}/api/elevation`;
}

/**
 * 표고 POST 프록시 URL 후보 (순서대로 시도).
 * - 동일 출처: Vite dev / Vercel 웹 등 API 라우트와 앱이 같을 때.
 * - VITE_ELEVATION_PROXY_ORIGIN: Capacitor 번들은 보통 `https://localhost` 만 제공해 /api 가 없음 → 배포된 웹의 /api/elevation 사용.
 */
function elevationProxyPostUrlCandidates(): string[] {
  const out: string[] = [];
  const same = elevationProxyPostUrl();
  if (same) out.push(same);

  const raw =
    typeof import.meta.env !== 'undefined' && import.meta.env.VITE_ELEVATION_PROXY_ORIGIN
      ? String(import.meta.env.VITE_ELEVATION_PROXY_ORIGIN).trim().replace(/\/$/, '')
      : '';
  if (raw) {
    const remote = `${raw}/api/elevation`;
    if (remote !== same) out.push(remote);
  }
  return out;
}

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

/** 동일 출처·원격 /api/elevation POST — 서버리스 지연 시 무한 대기 방지 */
const ELEVATION_PROXY_FETCH_MS = 45000;

const NATIVE_OE_TIMEOUT_MS = 4000;
const NATIVE_OT_TIMEOUT_MS = 15000;

async function withAbortTimeout<T>(ms: number, run: (signal: AbortSignal) => Promise<T>): Promise<T> {
  const c = new AbortController();
  const id = setTimeout(() => c.abort(), ms);
  try {
    return await run(c.signal);
  } finally {
    clearTimeout(id);
  }
}

async function fetchOpenElevation(
  locations: Array<{ latitude: number; longitude: number }>,
  signal?: AbortSignal
): Promise<OpenElevationResponse> {
  const res = await fetch(OPEN_ELEVATION_DIRECT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ locations }),
    signal,
  });
  if (!res.ok) throw new Error(`Open-Elevation ${res.status}`);
  const data = (await res.json()) as OpenElevationResponse;
  if (!data.results || !Array.isArray(data.results)) throw new Error('Open-Elevation invalid response');
  return data;
}

async function fetchOpenTopoData(
  locations: Array<{ latitude: number; longitude: number }>,
  signal?: AbortSignal
): Promise<OpenElevationResponse> {
  const locationsStr = locations.map((l) => `${l.latitude},${l.longitude}`).join('|');
  const url = `${OPENTOPODATA_DIRECT}?locations=${encodeURIComponent(locationsStr)}`;
  const res = await fetch(url, { method: 'GET', signal });
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

  const tryProxy = async (): Promise<OpenElevationResponse | null> => {
    const body: { locations: Array<{ latitude: number; longitude: number }>; provider?: ElevationProvider } = {
      locations,
    };
    if (provider) body.provider = provider;
    const bodyJson = JSON.stringify(body);

    for (const proxyUrl of elevationProxyPostUrlCandidates()) {
      try {
        const controller = new AbortController();
        const tid = setTimeout(() => controller.abort(), ELEVATION_PROXY_FETCH_MS);
        let res: Response;
        try {
          res = await fetch(proxyUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: bodyJson,
            signal: controller.signal,
          });
        } finally {
          clearTimeout(tid);
        }
        if (!res.ok) continue;
        const usedProviderHeader = res.headers.get('X-Elevation-Provider');
        if (usedProviderHeader) console.log('[Elevation] X-Elevation-Provider:', usedProviderHeader, proxyUrl);
        const data = (await res.json()) as OpenElevationResponse;
        if (!data.results || !Array.isArray(data.results)) continue;
        if (usedProviderHeader === 'open-elevation' || usedProviderHeader === 'opentopodata') {
          data.usedProvider = usedProviderHeader;
        } else if (provider) {
          data.usedProvider = provider;
        }
        return data;
      } catch {
        /* try next candidate */
      }
    }
    return null;
  };

  const proxied = await tryProxy();
  if (proxied) {
    elevationCache.set(key, proxied.results);
    return proxied;
  }

  if (!Capacitor.isNativePlatform()) {
    throw new Error('Elevation proxy unavailable or failed (browser requires /api/elevation)');
  }

  // Native, 프록시 없음 또는 실패: 외부 공급자 직접 호출(CORS 허용 환경에서만 성공)
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
      data = await withAbortTimeout(NATIVE_OT_TIMEOUT_MS, (sig) => fetchOpenTopoData(locations, sig));
      usedProvider = 'opentopodata';
      console.log('[Elevation] provider used (native): opentopodata');
    } catch (primaryErr) {
      console.warn('[Elevation] opentopodata failed, fallback to open-elevation', primaryErr);
      data = await withAbortTimeout(NATIVE_OE_TIMEOUT_MS, (sig) => fetchOpenElevation(locations, sig));
      usedProvider = 'open-elevation';
      console.log('[Elevation] provider used (native): open-elevation');
    }
  }
  data.usedProvider = usedProvider;
  elevationCache.set(key, data.results);
  return data;
}
