/**
 * 정지오코딩·역지오코딩: Mapbox 우선, 실패·무토큰·타임아웃 시 Nominatim.
 * 공급자당 요청은 타임아웃으로 상한을 둔다.
 */

import * as nominatim from './nominatim';
import { isMapboxForwardGeocodeConfigured, mapboxSearchOne, mapboxSearchSuggestions } from './mapboxForwardGeocode';
import { isMapboxReverseGeocodeConfigured, mapboxReverse } from './mapboxReverseGeocode';

export type { SearchSuggestionItem } from './nominatim';

const GEO_HTTP_TIMEOUT_MS = 8000;

async function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error('geocode_timeout')), ms);
  });
  try {
    return await Promise.race([promise, timeoutPromise]);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}

export async function searchSuggestions(query: string, limit: number): Promise<nominatim.SearchSuggestionItem[]> {
  if (isMapboxForwardGeocodeConfigured()) {
    try {
      const list = await withTimeout(mapboxSearchSuggestions(query, limit), GEO_HTTP_TIMEOUT_MS);
      if (list.length > 0) return list;
    } catch {
      /* Mapbox 실패 시 Nominatim */
    }
  }
  return withTimeout(nominatim.searchSuggestions(query, limit), GEO_HTTP_TIMEOUT_MS);
}

export async function search(query: string): Promise<{ lat: number; lng: number }> {
  if (isMapboxForwardGeocodeConfigured()) {
    try {
      return await withTimeout(mapboxSearchOne(query), GEO_HTTP_TIMEOUT_MS);
    } catch {
      /* fall through */
    }
  }
  return withTimeout(nominatim.search(query), GEO_HTTP_TIMEOUT_MS);
}

export async function addressToCoord(address: string): Promise<{ lat: number; lng: number }> {
  return nominatim.addressToCoord(address, { forwardSearch: search });
}

/**
 * 역지오코딩: Mapbox 우선 (토큰 있을 때), 실패 시 Nominatim.
 * `zoom`은 Nominatim 폴백에만 전달된다.
 */
export async function reverse(
  lat: number,
  lon: number,
  options?: { zoom?: number }
): Promise<{ formatted_address: string }> {
  if (isMapboxReverseGeocodeConfigured()) {
    try {
      return await withTimeout(mapboxReverse(lat, lon), GEO_HTTP_TIMEOUT_MS);
    } catch {
      /* Nominatim 폴백 */
    }
  }
  return withTimeout(nominatim.reverse(lat, lon, options), GEO_HTTP_TIMEOUT_MS);
}
