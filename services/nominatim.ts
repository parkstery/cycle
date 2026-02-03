/**
 * Nominatim (OpenStreetMap) Geocoding — Google Geocoder 대체용.
 * 사용 정책: 1 req/s, 유효한 User-Agent, 결과 캐싱.
 * Plus Code 주소는 자체 디코딩 후 좌표 사용 (Nominatim no results 방지).
 * @see https://operations.osmfoundation.org/policies/nominatim/
 */

import * as plusCode from './plusCode';

const NOMINATIM_BASE = 'https://nominatim.openstreetmap.org';
const USER_AGENT = 'FitnessProCycleSimulator/1.0 (https://github.com/your-org/cycle)';
const MIN_INTERVAL_MS = 1100;

let lastRequestTime = 0;

async function throttle(): Promise<void> {
  const now = Date.now();
  const elapsed = now - lastRequestTime;
  if (elapsed < MIN_INTERVAL_MS) {
    await new Promise((r) => setTimeout(r, MIN_INTERVAL_MS - elapsed));
  }
  lastRequestTime = Date.now();
}

const reverseCache = new Map<string, { formatted_address: string }>();
const searchCache = new Map<string, { lat: number; lng: number }>();

function reverseCacheKey(lat: number, lon: number): string {
  return `${lat.toFixed(4)},${lon.toFixed(4)}`;
}

/**
 * 역지오코딩: 좌표 → 주소 문자열.
 * Google Geocoder 결과의 formatted_address 대체용.
 */
export async function reverse(
  lat: number,
  lon: number
): Promise<{ formatted_address: string }> {
  const key = reverseCacheKey(lat, lon);
  const cached = reverseCache.get(key);
  if (cached) return cached;

  await throttle();
  const url = `${NOMINATIM_BASE}/reverse?lat=${lat}&lon=${lon}&format=json`;
  const res = await fetch(url, { headers: { 'User-Agent': USER_AGENT } });
  if (!res.ok) throw new Error(`Nominatim reverse ${res.status}`);
  const data = (await res.json()) as { display_name?: string };
  const result = {
    formatted_address: data.display_name ?? `${lat.toFixed(4)}, ${lon.toFixed(4)}`,
  };
  reverseCache.set(key, result);
  return result;
}

/**
 * 정지오코딩: 주소 문자열 → 좌표 { lat, lng }.
 * Google geometry.location 대체용 (google.maps.LatLng 생성 시 사용).
 */
export async function search(address: string): Promise<{ lat: number; lng: number }> {
  const key = address.trim().toLowerCase();
  const cached = searchCache.get(key);
  if (cached) return cached;

  await throttle();
  const url = `${NOMINATIM_BASE}/search?q=${encodeURIComponent(address)}&format=json&limit=1`;
  const res = await fetch(url, { headers: { 'User-Agent': USER_AGENT } });
  if (!res.ok) throw new Error(`Nominatim search ${res.status}`);
  const arr = (await res.json()) as Array<{ lat: string; lon: string }>;
  if (!Array.isArray(arr) || arr.length === 0) throw new Error('Nominatim no results');
  const result = {
    lat: parseFloat(arr[0].lat),
    lng: parseFloat(arr[0].lon),
  };
  searchCache.set(key, result);
  return result;
}

const PLUS_CODE_REGEX = /([23456789CFGHJMPQRVWX]{4,8}\+[23456789CFGHJMPQRVWX]{2,3})/i;

/**
 * 주소 문자열에서 Plus Code 부분과 나머지(지역명) 추출.
 */
function parsePlusCodeFromAddress(address: string): { code: string; locality: string } | null {
  const trimmed = address.trim();
  const match = trimmed.match(PLUS_CODE_REGEX);
  if (!match) return null;
  const code = match[1].toUpperCase();
  if (!plusCode.isValid(code)) return null;
  const locality = trimmed.replace(match[1], '').trim().replace(/\s+/g, ' ').trim();
  return { code, locality };
}

/**
 * 주소 → 좌표. Plus Code면 디코딩(짧은 코드는 locality로 참조 좌표 조회 후 복원), 아니면 Nominatim 검색.
 */
export async function addressToCoord(address: string): Promise<{ lat: number; lng: number }> {
  const parsed = parsePlusCodeFromAddress(address);
  if (!parsed) return search(address);

  const { code, locality } = parsed;
  try {
    if (plusCode.isFull(code)) {
      const area = plusCode.decode(code);
      return { lat: area.latitudeCenter, lng: area.longitudeCenter };
    }
    if (plusCode.isShort(code)) {
      let refLat = 0;
      let refLng = 0;
      if (locality.length >= 2) {
        try {
          const ref = await search(locality);
          refLat = ref.lat;
          refLng = ref.lng;
        } catch {
          refLat = 46.6;
          refLng = 8.0;
        }
      } else {
        refLat = 46.6;
        refLng = 8.0;
      }
      const fullCode = plusCode.recoverNearest(code, refLat, refLng);
      const area = plusCode.decode(fullCode);
      return { lat: area.latitudeCenter, lng: area.longitudeCenter };
    }
  } catch (_) {
    /* fallback to Nominatim */
  }
  return search(address);
}
