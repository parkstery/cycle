/**
 * Mapbox Geocoding API — 역지오코딩 (좌표 → 설명 문자열).
 * @see https://docs.mapbox.com/api/search/geocoding/#reverse-geocoding
 */

import { MAPBOX_ACCESS_TOKEN } from '../mapboxToken';

type MbReverseFeature = { place_name?: string };

const reverseCache = new Map<string, { formatted_address: string }>();

function cacheKey(lat: number, lng: number): string {
  return `${lat.toFixed(5)},${lng.toFixed(5)}`;
}

export function isMapboxReverseGeocodeConfigured(): boolean {
  return MAPBOX_ACCESS_TOKEN.trim().length > 0;
}

/** Mapbox `place_name`을 `nominatim.reverse`와 동일 형태로 반환 */
export async function mapboxReverse(lat: number, lng: number): Promise<{ formatted_address: string }> {
  const token = MAPBOX_ACCESS_TOKEN.trim();
  if (!token) throw new Error('Mapbox token missing');

  const key = cacheKey(lat, lng);
  const cached = reverseCache.get(key);
  if (cached) return cached;

  const pair = `${lng},${lat}`;
  const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${pair}.json?access_token=${encodeURIComponent(token)}&limit=1`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Mapbox reverse ${res.status}`);

  const data = (await res.json()) as { features?: MbReverseFeature[] };
  const name = data.features?.[0]?.place_name?.trim();
  if (!name) throw new Error('Mapbox reverse empty');

  const result = { formatted_address: name };
  reverseCache.set(key, result);
  return result;
}
