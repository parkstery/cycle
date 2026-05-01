/**
 * OSRM 경로 조회 — Capacitor/Android 등 정적 호스트에서는 /api/osrm-route 프록시가 없으므로
 * 브라우저/WebView에서 routing.openstreetmap.de 로 직접 요청합니다.
 * (로직은 api/osrm-route.js 와 동일)
 */

const SNAP_RADIUS_M = 50;
const OSM_DE_BASE = 'https://routing.openstreetmap.de';
const FALLBACK_BASE = 'https://router.project-osrm.org';

function getRouteBase(profile: string): string {
  const p = String(profile || 'driving').toLowerCase();
  if (p === 'cycling' || p === 'bike') return `${OSM_DE_BASE}/routed-bike`;
  if (p === 'foot' || p === 'walk') return `${OSM_DE_BASE}/routed-foot`;
  return `${OSM_DE_BASE}/routed-car`;
}

function getOsrmApiProfile(profile: string): 'driving' | 'cycling' | 'foot' {
  const p = String(profile || 'driving').toLowerCase();
  if (p === 'cycling' || p === 'bike') return 'cycling';
  if (p === 'foot' || p === 'walk') return 'foot';
  return 'driving';
}

async function snapCoord(routeBase: string, coord: string, apiProfile: string): Promise<string> {
  const trimmed = coord.trim();
  if (!trimmed) return trimmed;
  const nearestUrl = `${routeBase}/nearest/v1/${apiProfile}/${trimmed}?number=1&radiuses=${SNAP_RADIUS_M}`;
  try {
    const r = await fetch(nearestUrl);
    if (!r.ok) return trimmed;
    const data = (await r.json()) as { code?: string; waypoints?: Array<{ location?: [number, number] }> };
    if (data.code === 'Ok' && data.waypoints?.[0]?.location) {
      const [lng, lat] = data.waypoints[0].location;
      return `${lng},${lat}`;
    }
  } catch {
    /* keep original */
  }
  return trimmed;
}

async function fetchRouteHttp(url: string): Promise<{ r: Response; body: string }> {
  const r = await fetch(url);
  const body = await r.text();
  return { r, body };
}

async function attemptRoutePair(
  routeUrlBuilder: (coordsStr: string) => string,
  snappedJoined: string,
  rawJoined: string,
  coordCount: number
): Promise<{ r: Response; body: string }> {
  let { r, body } = await fetchRouteHttp(routeUrlBuilder(snappedJoined));
  if (!r.ok && r.status === 400 && coordCount >= 2) {
    ({ r, body } = await fetchRouteHttp(routeUrlBuilder(rawJoined)));
  }
  return { r, body };
}

export type OsrmRouteResponse = {
  code?: string;
  routes?: Array<{ geometry: string; distance: number; duration: number }>;
};

/**
 * OSRM JSON 응답 (api/osrm-route 프록시와 동일 형식)
 */
export async function fetchOsrmRouteJson(profile: string, coords: string): Promise<OsrmRouteResponse> {
  const coordList = coords.split(';').map((c) => c.trim()).filter(Boolean);
  if (coordList.length === 0) throw new Error('Empty coords');

  const base = getRouteBase(profile);
  const apiProfile = getOsrmApiProfile(profile);
  const baseParams = 'overview=full&geometries=polyline&alternatives=false&steps=false';

  const snappedList = await Promise.all(coordList.map((coord) => snapCoord(base, coord, apiProfile)));
  const snappedJoined = snappedList.join(';');
  const rawJoined = coordList.join(';');

  const primaryBuilder = (c: string) => `${base}/route/v1/${apiProfile}/${c}?${baseParams}`;
  const fallbackBuilder = (c: string) => `${FALLBACK_BASE}/route/v1/${apiProfile}/${c}?${baseParams}`;

  let primaryResult: { r: Response; body: string } | null = null;
  try {
    primaryResult = await attemptRoutePair(primaryBuilder, snappedJoined, rawJoined, coordList.length);
  } catch {
    primaryResult = null;
  }

  let r: Response;
  let body: string;
  if (primaryResult?.r.ok) {
    r = primaryResult.r;
    body = primaryResult.body;
  } else {
    try {
      ({ r, body } = await attemptRoutePair(fallbackBuilder, snappedJoined, rawJoined, coordList.length));
    } catch (e) {
      throw new Error(`OSRM fallback failed: ${String(e)}`);
    }
  }

  if (!r.ok) {
    throw new Error(`OSRM ${r.status}: ${body.slice(0, 240)}`);
  }
  return JSON.parse(body) as OsrmRouteResponse;
}
