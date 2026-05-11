/**
 * 정지오코딩(지명·주소 → 좌표): Mapbox Places 우선, 실패·무토큰 시 Nominatim.
 * 역지오코딩은 기존 `nominatim.reverse` 유지.
 */

import * as nominatim from './nominatim';
import { isMapboxForwardGeocodeConfigured, mapboxSearchOne, mapboxSearchSuggestions } from './mapboxForwardGeocode';

export type { SearchSuggestionItem } from './nominatim';

export async function searchSuggestions(query: string, limit: number): Promise<nominatim.SearchSuggestionItem[]> {
  if (isMapboxForwardGeocodeConfigured()) {
    try {
      const list = await mapboxSearchSuggestions(query, limit);
      if (list.length > 0) return list;
    } catch {
      /* Mapbox 실패 시 Nominatim */
    }
  }
  return nominatim.searchSuggestions(query, limit);
}

export async function search(query: string): Promise<{ lat: number; lng: number }> {
  if (isMapboxForwardGeocodeConfigured()) {
    try {
      return await mapboxSearchOne(query);
    } catch {
      /* fall through */
    }
  }
  return nominatim.search(query);
}

export async function addressToCoord(address: string): Promise<{ lat: number; lng: number }> {
  return nominatim.addressToCoord(address, { forwardSearch: search });
}
