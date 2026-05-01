const OSM_DE_BASE = 'https://routing.openstreetmap.de';
/** OSM DE 장애·지역 미커버 시 폴백 (단일 호스트, driving / cycling / foot) */
const FALLBACK_BASE = 'https://router.project-osrm.org';

/** 무한 대기 방지 — 초과 시 Abort 후 폴백 또는 502 (클라이언트 osrmRoute.ts 와 동일) */
const OSRM_PRIMARY_TIMEOUT_MS = 10000;
const OSRM_FALLBACK_TIMEOUT_MS = 10000;

/**
 * 모드별 전용 라우팅 서버 base URL (OSM DE).
 * car / bike / foot 경로가 각각 최적화된 서버로 분리되어 도심 골목길 등이 반영됨.
 */
function getRouteBase(profile) {
  const p = String(profile || 'driving').toLowerCase();
  if (p === 'cycling' || p === 'bike') return `${OSM_DE_BASE}/routed-bike`;
  if (p === 'foot' || p === 'walk') return `${OSM_DE_BASE}/routed-foot`;
  return `${OSM_DE_BASE}/routed-car`;
}

/**
 * OSRM HTTP 경로 세그먼트 — routed-* 호스트와 폴백 호스트 모두 동일 규약(driving/cycling/foot).
 */
function getOsrmApiProfile(profile) {
  const p = String(profile || 'driving').toLowerCase();
  if (p === 'cycling' || p === 'bike') return 'cycling';
  if (p === 'foot' || p === 'walk') return 'foot';
  return 'driving';
}

async function fetchRouteHttp(url, timeoutMs) {
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

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }
  res.setHeader('Access-Control-Allow-Origin', '*');
  try {
    const { profile = 'driving', coords } = req.query;
    if (!coords) {
      res.status(400).json({ error: 'Missing coords' });
      return;
    }
    const coordList = coords.split(';').map((c) => c.trim()).filter(Boolean);
    if (coordList.length === 0) {
      res.status(400).json({ error: 'Empty coords' });
      return;
    }

    const base = getRouteBase(profile);
    const apiProfile = getOsrmApiProfile(profile);
    const baseParams = 'overview=full&geometries=polyline&alternatives=false&steps=false';
    const routeCoords = coordList.join(';');

    const primaryBuilder = (c) => `${base}/route/v1/${apiProfile}/${c}?${baseParams}`;
    const fallbackBuilder = (c) => `${FALLBACK_BASE}/route/v1/${apiProfile}/${c}?${baseParams}`;

    let r;
    let body;
    let routingSource;

    try {
      ({ r, body } = await fetchRouteHttp(primaryBuilder(routeCoords), OSRM_PRIMARY_TIMEOUT_MS));
      if (r.ok) routingSource = 'osm-de';
    } catch {
      r = { ok: false };
      body = '';
    }

    if (!r.ok) {
      try {
        ({ r, body } = await fetchRouteHttp(fallbackBuilder(routeCoords), OSRM_FALLBACK_TIMEOUT_MS));
        if (r.ok) routingSource = 'project-osrm';
      } catch (e) {
        res.status(502).json({ error: String(e?.message ?? e) });
        return;
      }
    }

    if (!r.ok) {
      try {
        const errJson = JSON.parse(body);
        res.status(r.status).json({ error: errJson.message || body, code: errJson.code });
      } catch {
        res.status(r.status).json({ error: body });
      }
      return;
    }
    const data = JSON.parse(body);
    if (routingSource) {
      data._meta = { ...(data._meta || {}), routingSource };
    }
    res.status(200).json(data);
  } catch (e) {
    res.status(502).json({ error: String(e?.message ?? e) });
  }
}
