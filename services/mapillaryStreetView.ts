import { computeDistanceBetween, computeHeading, type LatLngLike } from './geoUtils';

export type MapillaryStreetCandidate = {
  id: string;
  thumb1024Url?: string;
  lng: number;
  lat: number;
  compassAngle?: number;
};

type GeoJsonPoint = { type?: string; coordinates?: [number, number] };

function pointFromGeometry(g: GeoJsonPoint | undefined): { lng: number; lat: number } | null {
  const c = g?.coordinates;
  if (!c || c.length < 2) return null;
  const lng = c[0];
  const lat = c[1];
  if (!Number.isFinite(lng) || !Number.isFinite(lat)) return null;
  return { lng, lat };
}

/** 반경 검색(radius 최대 50m). 주행 위치 근처 Mapillary 이미지 후보. */
export async function fetchMapillaryStreetCandidates(
  accessToken: string,
  lat: number,
  lng: number,
  init?: { signal?: AbortSignal }
): Promise<MapillaryStreetCandidate[]> {
  const token = accessToken.trim();
  if (!token) return [];
  const fields = [
    'id',
    'thumb_1024_url',
    'geometry',
    'computed_geometry',
    'compass_angle',
    'computed_compass_angle',
  ].join(',');
  const url = new URL('https://graph.mapillary.com/images');
  url.searchParams.set('access_token', token);
  url.searchParams.set('lat', String(lat));
  url.searchParams.set('lng', String(lng));
  url.searchParams.set('radius', '50');
  url.searchParams.set('limit', '12');
  url.searchParams.set('fields', fields);
  const res = await fetch(url.toString(), { signal: init?.signal, referrerPolicy: 'no-referrer' });
  if (!res.ok) return [];
  const json = (await res.json()) as {
    data?: Array<{
      id?: string | number;
      thumb_1024_url?: string;
      geometry?: GeoJsonPoint;
      computed_geometry?: GeoJsonPoint;
      compass_angle?: number;
      computed_compass_angle?: number;
    }>;
  };
  const rows = json.data ?? [];
  const out: MapillaryStreetCandidate[] = [];
  for (const row of rows) {
    const id = row.id != null ? String(row.id) : '';
    if (!id) continue;
    const pt = pointFromGeometry(row.computed_geometry) ?? pointFromGeometry(row.geometry);
    if (!pt) continue;
    const compassAngle =
      typeof row.computed_compass_angle === 'number' && Number.isFinite(row.computed_compass_angle)
        ? row.computed_compass_angle
        : typeof row.compass_angle === 'number' && Number.isFinite(row.compass_angle)
          ? row.compass_angle
          : undefined;
    const thumb1024Url = typeof row.thumb_1024_url === 'string' ? row.thumb_1024_url : undefined;
    out.push({ id, lng: pt.lng, lat: pt.lat, compassAngle, thumb1024Url });
  }
  return out;
}

function smallestAngleDiffDeg(a: number, b: number): number {
  return Math.abs(((a - b + 540) % 360) - 180);
}

/** 경로 진행 방향과 가깝고·현재 위치에 가까운 촬영 프레임 선택 */
export function pickMapillaryStreetCandidate(
  candidates: MapillaryStreetCandidate[],
  current: LatLngLike,
  driveHeadingDeg: number | null
): MapillaryStreetCandidate | null {
  if (!candidates.length) return null;
  if (candidates.length === 1) return candidates[0]!;
  if (driveHeadingDeg == null || !Number.isFinite(driveHeadingDeg)) {
    return [...candidates].sort(
      (a, b) =>
        computeDistanceBetween(current, { lat: a.lat, lng: a.lng }) -
        computeDistanceBetween(current, { lat: b.lat, lng: b.lng })
    )[0]!;
  }
  let best = candidates[0]!;
  let bestScore = Infinity;
  for (const c of candidates) {
    const d = computeDistanceBetween(current, { lat: c.lat, lng: c.lng });
    const bearingToImage = computeHeading(current, { lat: c.lat, lng: c.lng });
    const forwardAlign = smallestAngleDiffDeg(driveHeadingDeg, bearingToImage);
    const compass = c.compassAngle;
    const facingAlign =
      compass != null && Number.isFinite(compass) ? smallestAngleDiffDeg(driveHeadingDeg, compass) : 50;
    const score = d + forwardAlign * 0.45 + facingAlign * 0.2;
    if (score < bestScore) {
      bestScore = score;
      best = c;
    }
  }
  return best;
}

export function mapillaryEmbedUrl(imageKey: string, style: 'photo' | 'classic' = 'photo'): string {
  const u = new URL('https://www.mapillary.com/embed');
  u.searchParams.set('image_key', imageKey);
  u.searchParams.set('style', style);
  return u.toString();
}
