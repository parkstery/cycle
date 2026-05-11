/**
 * Mapbox Geocoding API (forward) — 지도와 동일한 액세스 토큰 사용.
 * Mapillary에는 지명 검색 API가 없어, Mapbox GL 스택과 맞춘다.
 * @see https://docs.mapbox.com/api/search/geocoding/
 */

import { MAPBOX_ACCESS_TOKEN } from '../mapboxToken';
import type { SearchSuggestionItem } from './nominatim';

type MbFeature = {
  place_name?: string;
  text?: string;
  center?: [number, number];
  geometry?: { type?: string; coordinates?: [number, number] };
};

function coordsFromFeature(f: MbFeature): { lng: number; lat: number } | null {
  if (Array.isArray(f.center) && f.center.length >= 2) {
    const lng = f.center[0];
    const lat = f.center[1];
    if (Number.isFinite(lng) && Number.isFinite(lat)) return { lng, lat };
  }
  const c = f.geometry?.coordinates;
  if (Array.isArray(c) && c.length >= 2) {
    const lng = c[0];
    const lat = c[1];
    if (Number.isFinite(lng) && Number.isFinite(lat)) return { lng, lat };
  }
  return null;
}

const suggestCache = new Map<string, SearchSuggestionItem[]>();
const searchCache = new Map<string, { lat: number; lng: number }>();

export function isMapboxForwardGeocodeConfigured(): boolean {
  return MAPBOX_ACCESS_TOKEN.trim().length > 0;
}

export async function mapboxSearchSuggestions(query: string, limit: number): Promise<SearchSuggestionItem[]> {
  const token = MAPBOX_ACCESS_TOKEN.trim();
  if (!token) throw new Error('Mapbox token missing');

  const q = query.trim();
  if (q.length < 2) return [];

  const safeLimit = Math.max(1, Math.min(10, Math.floor(limit)));
  const key = `${q.toLowerCase()}_${safeLimit}`;
  const cached = suggestCache.get(key);
  if (cached) return cached;

  const encoded = encodeURIComponent(q);
  const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${encoded}.json?access_token=${encodeURIComponent(token)}&limit=${safeLimit}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Mapbox geocoding ${res.status}`);

  const data = (await res.json()) as { features?: MbFeature[] };
  const features = data.features ?? [];
  const result: SearchSuggestionItem[] = [];
  for (const f of features) {
    const coord = coordsFromFeature(f);
    if (!coord) continue;
    result.push({
      display_name: f.place_name ?? f.text ?? `${coord.lat}, ${coord.lng}`,
      lat: coord.lat,
      lng: coord.lng,
    });
  }

  suggestCache.set(key, result);
  return result;
}

export async function mapboxSearchOne(query: string): Promise<{ lat: number; lng: number }> {
  const token = MAPBOX_ACCESS_TOKEN.trim();
  if (!token) throw new Error('Mapbox token missing');

  const key = query.trim().toLowerCase();
  if (!key) throw new Error('empty query');
  const cached = searchCache.get(key);
  if (cached) return cached;

  const list = await mapboxSearchSuggestions(query.trim(), 1);
  if (list.length === 0) throw new Error('Mapbox geocoding no results');
  const r = { lat: list[0].lat, lng: list[0].lng };
  searchCache.set(key, r);
  return r;
}
