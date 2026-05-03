/**
 * Geometry utilities — Google Maps Geometry Library 대체 (Leaflet 전환 시 사용).
 * Polyline decode (OSRM/Google 형식), 거리·방위·오프셋 계산.
 */

/** Encoded polyline → [[lat, lng], ...] (Google/OSRM 형식) */
export function decodePath(encoded: string): [number, number][] {
  const points: [number, number][] = [];
  let index = 0;
  let lat = 0;
  let lng = 0;
  while (index < encoded.length) {
    let b: number;
    let shift = 0;
    let result = 0;
    do {
      b = encoded.charCodeAt(index++) - 63;
      result |= (b & 0x1f) << shift;
      shift += 5;
    } while (b >= 0x20);
    const dlat = (result & 1) !== 0 ? ~(result >> 1) : result >> 1;
    lat += dlat;
    shift = 0;
    result = 0;
    do {
      b = encoded.charCodeAt(index++) - 63;
      result |= (b & 0x1f) << shift;
      shift += 5;
    } while (b >= 0x20);
    const dlng = (result & 1) !== 0 ? ~(result >> 1) : result >> 1;
    lng += dlng;
    points.push([lat / 1e5, lng / 1e5]);
  }
  return points;
}

/** Google LatLng 호환: .lat/.lng 숫자 또는 .lat()/.lng() 메서드 */
export type LatLngLike = { lat?: number; lng?: number } | { lat: () => number; lng: () => number };

function getLatLng(p: LatLngLike): { lat: number; lng: number } {
  const lat = typeof (p as { lat?: () => number }).lat === 'function' ? (p as { lat: () => number }).lat() : (p as { lat?: number }).lat;
  const lng = typeof (p as { lng?: () => number }).lng === 'function' ? (p as { lng: () => number }).lng() : (p as { lng?: number }).lng;
  return { lat: lat ?? 0, lng: lng ?? 0 };
}

/** 두 점 사이 거리 (미터), Haversine */
export function computeDistanceBetween(a: LatLngLike, b: LatLngLike): number {
  const { lat: lat1, lng: lng1 } = getLatLng(a);
  const { lat: lat2, lng: lng2 } = getLatLng(b);
  const R = 6371000; // Earth radius meters
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lng2 - lng1) * Math.PI) / 180;
  const x =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
  return R * c;
}

/** from → to 방위각 (도, 0 ~ 360) */
export function computeHeading(from: LatLngLike, to: LatLngLike): number {
  const { lat: lat1, lng: lng1 } = getLatLng(from);
  const { lat: lat2, lng: lng2 } = getLatLng(to);
  const dLon = ((lng2 - lng1) * Math.PI) / 180;
  const y = Math.sin(dLon) * Math.cos((lat2 * Math.PI) / 180);
  const x =
    Math.cos((lat1 * Math.PI) / 180) * Math.sin((lat2 * Math.PI) / 180) -
    Math.sin((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.cos(dLon);
  let brng = (Math.atan2(y, x) * 180) / Math.PI;
  return (brng + 360) % 360;
}

/** from에서 distanceM 미터, heading 방향의 점 */
export function computeOffset(from: LatLngLike, distanceM: number, headingDeg: number): { lat: number; lng: number } {
  const { lat: lat1, lng: lng1 } = getLatLng(from);
  const R = 6371000;
  const d = distanceM / R;
  const brng = (headingDeg * Math.PI) / 180;
  const lat2 = Math.asin(
    Math.sin((lat1 * Math.PI) / 180) * Math.cos(d) +
      Math.cos((lat1 * Math.PI) / 180) * Math.sin(d) * Math.cos(brng)
  );
  const lng2 =
    (lng1 * Math.PI) / 180 +
    Math.atan2(
      Math.sin(brng) * Math.sin(d) * Math.cos((lat1 * Math.PI) / 180),
      Math.cos(d) - Math.sin((lat1 * Math.PI) / 180) * Math.sin(lat2)
    );
  return { lat: (lat2 * 180) / Math.PI, lng: (lng2 * 180) / Math.PI };
}

const R_EARTH_M = 6371000;

/**
 * 점에서 선분까지의 최단 거리(미터). 짧은 구간용 등거투영 근사.
 */
export function distancePointToSegmentMeters(point: LatLngLike, segA: LatLngLike, segB: LatLngLike): number {
  const p = getLatLng(point);
  const a = getLatLng(segA);
  const b = getLatLng(segB);
  const latAvg = ((a.lat + b.lat) / 2) * (Math.PI / 180);
  const kx = R_EARTH_M * Math.cos(latAvg) * (Math.PI / 180);
  const ky = R_EARTH_M * (Math.PI / 180);
  const bx = (b.lng - a.lng) * kx;
  const by = (b.lat - a.lat) * ky;
  const px = (p.lng - a.lng) * kx;
  const py = (p.lat - a.lat) * ky;
  const len2 = bx * bx + by * by;
  const t = len2 < 1e-6 ? 0 : Math.max(0, Math.min(1, (px * bx + py * by) / len2));
  const cx = t * bx;
  const cy = t * by;
  const dx = px - cx;
  const dy = py - cy;
  return Math.sqrt(dx * dx + dy * dy);
}

/**
 * 경로 폴리라인까지의 최소 거리(미터). centerIndex 주변 halfWindow개 세그먼트만 검사.
 */
export function minDistanceFromPointToPolylinePath(
  point: LatLngLike,
  path: LatLngLike[],
  centerIndex: number,
  halfWindow: number
): number {
  if (!path?.length || path.length < 2) return Infinity;
  const lo = Math.max(0, centerIndex - halfWindow);
  const hi = Math.min(path.length - 2, centerIndex + halfWindow);
  let minD = Infinity;
  for (let i = lo; i <= hi; i++) {
    const d = distancePointToSegmentMeters(point, path[i], path[i + 1]);
    if (d < minD) minD = d;
  }
  return minD;
}

function normalizeAngleDiffDeg(deg: number): number {
  while (deg > 180) deg -= 360;
  while (deg < -180) deg += 360;
  return deg;
}

/**
 * 누적 경로 거리 기준으로 pathIndex 주변 [d0-backwardM, d0+forwardM] 구간에 걸친 꼭짓점들의
 * 방향 변화 합(도). 교차로·급회전 탐지용.
 */
export function headingChangeSumAlongPath(
  path: LatLngLike[],
  cumDist: number[],
  pathIndex: number,
  backwardM: number,
  forwardM: number
): number {
  if (path.length < 3 || cumDist.length !== path.length) return 0;
  const d0 = cumDist[Math.min(pathIndex, cumDist.length - 1)] ?? 0;
  const dLo = Math.max(0, d0 - backwardM);
  const dHi = Math.min(cumDist[cumDist.length - 1], d0 + forwardM);
  let sum = 0;
  for (let i = 1; i <= path.length - 2; i++) {
    const di = cumDist[i];
    if (di < dLo || di > dHi) continue;
    const h1 = computeHeading(path[i - 1], path[i]);
    const h2 = computeHeading(path[i], path[i + 1]);
    sum += Math.abs(normalizeAngleDiffDeg(h2 - h1));
  }
  return sum;
}

/**
 * 경로 시작부터 distanceM 지점의 보간 좌표(폴리라인 누적 거리 기준).
 */
export function getLatLngAtDistanceAlongPath(
  path: LatLngLike[],
  cumDist: number[],
  distanceM: number
): { lat: number; lng: number; segmentIndex: number } {
  if (!path.length || !cumDist.length) return { lat: 0, lng: 0, segmentIndex: 0 };
  const total = cumDist[cumDist.length - 1];
  const d = Math.max(0, Math.min(distanceM, total));
  if (path.length === 1) {
    const p = getLatLng(path[0]);
    return { lat: p.lat, lng: p.lng, segmentIndex: 0 };
  }
  let i = 0;
  while (i < path.length - 1 && cumDist[i + 1] < d) i++;
  if (i >= path.length - 1) {
    const p = getLatLng(path[path.length - 1]);
    return { lat: p.lat, lng: p.lng, segmentIndex: Math.max(0, path.length - 2) };
  }
  const d0 = cumDist[i];
  const d1 = cumDist[i + 1];
  const t = d1 > d0 ? (d - d0) / (d1 - d0) : 0;
  const a = getLatLng(path[i]);
  const b = getLatLng(path[i + 1]);
  return {
    lat: a.lat + t * (b.lat - a.lat),
    lng: a.lng + t * (b.lng - a.lng),
    segmentIndex: i
  };
}
