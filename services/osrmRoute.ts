/**
 * OSRM 경로 조회 — Capacitor/Android 등 정적 호스트에서는 /api/osrm-route 프록시가 없으므로
 * 브라우저/WebView에서 routing.openstreetmap.de 로 직접 요청합니다.
 * nearest는 호출하지 않으며 스냅은 OSRM route 단계에 위임합니다.
 * (로직은 api/osrm-route.js 와 동일)
 */

const OSM_DE_BASE = 'https://routing.openstreetmap.de';
const FALLBACK_BASE = 'https://router.project-osrm.org';

const OSRM_PRIMARY_TIMEOUT_MS = 20000;
const OSRM_FALLBACK_TIMEOUT_MS = 20000;

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

async function fetchRouteHttp(url: string, timeoutMs: number): Promise<{ r: Response; body: string }> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const r = await fetch(url, { signal: controller.signal });
    const body = await r.text();
    return { r, body };
  } finally {
    clearTimeout(timeoutId);
  }
}

export type OsrmRouteResponse = {
  code?: string;
  routes?: Array<{ geometry: string; distance: number; duration: number }>;
  _meta?: { routingSource?: 'osm-de' | 'project-osrm' };
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
  const routeCoords = coordList.join(';');

  const primaryUrl = `${base}/route/v1/${apiProfile}/${routeCoords}?${baseParams}`;
  const fallbackUrl = `${FALLBACK_BASE}/route/v1/${apiProfile}/${routeCoords}?${baseParams}`;

  let primaryResult: { r: Response; body: string } | null = null;
  try {
    primaryResult = await fetchRouteHttp(primaryUrl, OSRM_PRIMARY_TIMEOUT_MS);
  } catch {
    primaryResult = null;
  }

  let r: Response;
  let body: string;
  let routingSource: 'osm-de' | 'project-osrm' | undefined;

  if (primaryResult?.r.ok) {
    r = primaryResult.r;
    body = primaryResult.body;
    routingSource = 'osm-de';
  } else {
    try {
      ({ r, body } = await fetchRouteHttp(fallbackUrl, OSRM_FALLBACK_TIMEOUT_MS));
      if (r.ok) routingSource = 'project-osrm';
    } catch (e) {
      throw new Error(`OSRM fallback failed: ${String(e)}`);
    }
  }

  if (!r.ok) {
    throw new Error(`OSRM ${r.status}: ${body.slice(0, 240)}`);
  }
  const data = JSON.parse(body) as OsrmRouteResponse;
  if (routingSource) {
    data._meta = { ...(data._meta || {}), routingSource };
  }
  return data;
}
