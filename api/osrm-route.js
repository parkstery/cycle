const SNAP_RADIUS_M = 50;
const OSM_DE_BASE = 'https://routing.openstreetmap.de';
/** OSM DE 장애·지역 미커버 시 폴백 (단일 호스트, driving / cycling / foot) */
const FALLBACK_BASE = 'https://router.project-osrm.org';

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

/**
 * Snap a single coordinate to the road network via OSRM nearest (same host as route).
 */
async function snapCoord(routeBase, coord, apiProfile) {
  const trimmed = coord.trim();
  if (!trimmed) return trimmed;
  const nearestUrl = `${routeBase}/nearest/v1/${apiProfile}/${trimmed}?number=1&radiuses=${SNAP_RADIUS_M}`;
  try {
    const r = await fetch(nearestUrl);
    if (!r.ok) return trimmed;
    const data = await r.json();
    if (data.code === 'Ok' && data.waypoints?.[0]?.location) {
      const [lng, lat] = data.waypoints[0].location;
      return `${lng},${lat}`;
    }
  } catch (_) {}
  return trimmed;
}

async function fetchRouteHttp(url) {
  const r = await fetch(url);
  const body = await r.text();
  return { r, body };
}

/**
 * coords 문자열에 대해 (스냅 → 실패 시 원본) 한 쌍의 시도.
 */
async function attemptRoutePair(routeUrlBuilder, snappedJoined, rawJoined, coordCount) {
  let { r, body } = await fetchRouteHttp(routeUrlBuilder(snappedJoined));
  if (!r.ok && r.status === 400 && coordCount >= 2) {
    ({ r, body } = await fetchRouteHttp(routeUrlBuilder(rawJoined)));
  }
  return { r, body };
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

    const snappedList = await Promise.all(
      coordList.map((coord) => snapCoord(base, coord, apiProfile))
    );
    const snappedJoined = snappedList.join(';');
    const rawJoined = coordList.join(';');

    const primaryBuilder = (c) => `${base}/route/v1/${apiProfile}/${c}?${baseParams}`;
    const fallbackBuilder = (c) => `${FALLBACK_BASE}/route/v1/${apiProfile}/${c}?${baseParams}`;

    let r;
    let body;
    try {
      ({ r, body } = await attemptRoutePair(
        primaryBuilder,
        snappedJoined,
        rawJoined,
        coordList.length
      ));
    } catch {
      r = { ok: false };
      body = '';
    }

    if (!r.ok) {
      try {
        ({ r, body } = await attemptRoutePair(
          fallbackBuilder,
          snappedJoined,
          rawJoined,
          coordList.length
        ));
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
    res.status(200).json(data);
  } catch (e) {
    res.status(502).json({ error: String(e?.message ?? e) });
  }
}
