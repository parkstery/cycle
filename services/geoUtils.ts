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
type LatLngLike = { lat?: number; lng?: number } | { lat: () => number; lng: () => number };

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
