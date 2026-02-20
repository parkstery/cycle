const SNAP_RADIUS_M = 50;
const OSM_DE_BASE = 'https://routing.openstreetmap.de';

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
 * Snap a single coordinate to the road network via OSRM nearest (same host as route).
 */
async function snapCoord(routeBase, coord) {
  const trimmed = coord.trim();
  if (!trimmed) return trimmed;
  const nearestUrl = `${routeBase}/nearest/v1/driving/${trimmed}?number=1&radiuses=${SNAP_RADIUS_M}`;
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
    const baseParams = 'overview=full&geometries=polyline&alternatives=false&steps=false';

    const fetchRoute = (coordsStr) =>
      fetch(`${base}/route/v1/driving/${coordsStr}?${baseParams}`);

    // 1) nearest로 스냅 후 route 시도 (실패 시 원본 좌표 사용)
    const snappedList = await Promise.all(
      coordList.map((coord) => snapCoord(base, coord))
    );
    let r = await fetchRoute(snappedList.join(';'));
    let body = await r.text();

    if (!r.ok && r.status === 400 && coordList.length >= 2) {
      r = await fetchRoute(coordList.join(';'));
      body = await r.text();
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
