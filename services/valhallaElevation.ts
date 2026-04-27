import { Capacitor } from '@capacitor/core';
import type { OpenElevationResponse } from './openElevation';
import type { TravelMode } from '../types';

function getStadiaClientApiKey(): string {
  return String((import.meta.env as { VITE_STADIA_MAPS_API_KEY?: string }).VITE_STADIA_MAPS_API_KEY ?? '').trim();
}

/**
 * 사용자가 `.../valhalla` 로 넣는 경우가 있어 Stadia 공식 Route POST 베이스로 맞춘다.
 * @see https://docs.stadiamaps.com/routing/
 */
export function normalizeStadiaValhallaBaseUrl(raw: string): string {
  const trimmed = raw.trim().replace(/\/+$/, '');
  try {
    const u = new URL(trimmed);
    if (u.hostname === 'api.stadiamaps.com' || u.hostname.endsWith('.stadiamaps.com')) {
      const path = (u.pathname.replace(/\/+$/, '') || '/').toLowerCase();
      if (path === '/valhalla' || path.endsWith('/valhalla')) {
        return 'https://api.stadiamaps.com/route/v1';
      }
    }
  } catch {
    /* ignore */
  }
  return trimmed;
}

function isStadiaDirectRouteUrl(url: string): boolean {
  return /stadiamaps\.com/i.test(url) && /\/route\/v1/i.test(url);
}

/** 웹: 상대 경로 프록시. 네이티브: `VITE_VALHALLA_ELEVATION_API_URL`(https). Stadia 직결이면 api_key 쿼리 필요. */
export function getValhallaElevationApiUrl(): string {
  const fromEnv = (import.meta.env.VITE_VALHALLA_ELEVATION_API_URL as string | undefined)?.trim();
  if (Capacitor.isNativePlatform()) {
    if (fromEnv && /^https:\/\//i.test(fromEnv)) return normalizeStadiaValhallaBaseUrl(fromEnv);
    return '';
  }
  return '/api/valhalla-elevation';
}

export function isValhallaElevationConfigured(): boolean {
  if (!Capacitor.isNativePlatform()) return true;
  const raw = (import.meta.env.VITE_VALHALLA_ELEVATION_API_URL as string | undefined)?.trim();
  if (!raw || !/^https:\/\//i.test(raw)) return false;
  const base = normalizeStadiaValhallaBaseUrl(raw);
  if (isStadiaDirectRouteUrl(base)) return !!getStadiaClientApiKey();
  return true;
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
  if (out[out.length - 1] !== path[last]) out[out.length - 1] = path[last];
  return out;
}

function decodePolyline6(encoded: string): [number, number][] {
  let index = 0;
  let lat = 0;
  let lng = 0;
  const coordinates: [number, number][] = [];
  const len = encoded.length;

  while (index < len) {
    let b: number;
    let shift = 0;
    let result = 0;
    do {
      b = encoded.charCodeAt(index++) - 63;
      result |= (b & 0x1f) << shift;
      shift += 5;
    } while (b >= 0x20);
    const dlat = result & 1 ? ~(result >> 1) : result >> 1;
    lat += dlat;

    shift = 0;
    result = 0;
    do {
      b = encoded.charCodeAt(index++) - 63;
      result |= (b & 0x1f) << shift;
      shift += 5;
    } while (b >= 0x20);
    const dlng = result & 1 ? ~(result >> 1) : result >> 1;
    lng += dlng;

    coordinates.push([lat / 1e6, lng / 1e6]);
  }
  return coordinates;
}

function parseStadiaTripJsonToOpenElevation(data: unknown): OpenElevationResponse {
  const trip = (data as { trip?: { legs?: unknown[] } })?.trip;
  if (!trip || !Array.isArray(trip.legs) || trip.legs.length === 0) {
    throw new Error('Invalid Valhalla response: missing trip.legs');
  }
  const leg = trip.legs[0] as { shape?: string; elevation?: number[]; elevation_interval?: number };
  const shape = leg.shape;
  const elev = leg.elevation;
  if (!shape || !Array.isArray(elev)) {
    throw new Error('Valhalla response missing shape or elevation array');
  }
  const coords = decodePolyline6(String(shape));
  if (coords.length === 0) throw new Error('Decoded Valhalla shape is empty');
  const n = Math.min(coords.length, elev.length);
  const results = [];
  for (let i = 0; i < n; i++) {
    const [lat, lng] = coords[i];
    results.push({
      latitude: lat,
      longitude: lng,
      elevation: Number(elev[i]) || 0,
    });
  }
  return { results };
}

/**
 * 웹: /api/valhalla-elevation (프록시, lat/lng 바디).
 * 네이티브: Stadia `route/v1` 직결이면 lon+break + api_key 쿼리, 그 외 URL 은 기존처럼 `{ results }` JSON 을 기대.
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
  const elevationInterval = options?.elevationIntervalM ?? 30;
  const costing = costingForTravelMode(mode);
  const units = 'kilometers';

  const stadiaDirect = isStadiaDirectRouteUrl(endpoint);
  const apiKey = getStadiaClientApiKey();

  if (stadiaDirect && !apiKey) {
    throw new Error('Stadia 직접 호출에는 STADIA_MAPS_API_KEY(빌드 시 주입)가 필요합니다.');
  }

  const requestBody = stadiaDirect
    ? {
        locations: waypoints.map((p: any) => {
          const lat = typeof p.lat === 'function' ? p.lat() : p.lat;
          const lng = typeof p.lng === 'function' ? p.lng() : p.lng;
          return { lat, lon: lng, type: 'break' as const };
        }),
        costing,
        elevation_interval: elevationInterval,
        units,
      }
    : {
        locations: waypoints.map((p: any) => {
          const lat = typeof p.lat === 'function' ? p.lat() : p.lat;
          const lng = typeof p.lng === 'function' ? p.lng() : p.lng;
          return { lat, lng };
        }),
        costing,
        elevation_interval: elevationInterval,
        units,
      };

  const url = stadiaDirect ? `${endpoint}?api_key=${encodeURIComponent(apiKey)}` : endpoint;

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(requestBody),
  });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`Valhalla elevation ${res.status}: ${text.slice(0, 500)}`);
  }

  if (stadiaDirect) {
    return parseStadiaTripJsonToOpenElevation(JSON.parse(text));
  }

  const data = JSON.parse(text) as OpenElevationResponse;
  if (!data.results || !Array.isArray(data.results)) throw new Error('Valhalla elevation invalid response');
  return data;
}
