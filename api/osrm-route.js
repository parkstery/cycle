const OSM_DE_BASE = 'https://routing.openstreetmap.de';
/** OSM DE 장애·지역 미커버 시 폴백 (단일 호스트, driving / cycling / foot) */
const FALLBACK_BASE = 'https://router.project-osrm.org';

/** 무한 대기 방지 — 초과 시 Abort 후 폴백 또는 502 (클라이언트 osrmRoute.ts 와 동일) */
const OSRM_PRIMARY_TIMEOUT_MS = 10000;
const OSRM_FALLBACK_TIMEOUT_MS = 10000;

const OSRM_SNAP_RADIUS_STRICT_M = 100;
const OSRM_SNAP_RADIUS_RELAXED_M = 300;

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

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** 일시 장애·콜드스타트 흡수: 502/503/504/429 또는 fetch 예외 시 최대 2회 */
async function fetchRouteHttpWithRetry(url, timeoutMs, maxAttempts = 2) {
  let last;
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    if (attempt > 0) await sleep(450);
    try {
      last = await fetchRouteHttp(url, timeoutMs);
      if (last.r.ok) return last;
      const retryable = [502, 503, 504, 429].includes(last.r.status);
      if (!retryable) return last;
    } catch (e) {
      if (attempt === maxAttempts - 1) throw e;
    }
  }
  return last;
}

/**
 * 단일 snap 반경으로 primary → fallback OSRM route 호출.
 * @returns {{ ok: true, data: object, routingSource?: string }} | {{ ok: false, data: object|null }}
 */
async function fetchOsrmSingleRadius(profile, coordList, snapM) {
  const routeCoords = coordList.join(';');
  const base = getRouteBase(profile);
  const apiProfile = getOsrmApiProfile(profile);
  const radiuses = coordList.map(() => snapM).join(';');
  const baseParams = `overview=full&geometries=polyline&alternatives=false&steps=false&radiuses=${encodeURIComponent(radiuses)}`;

  const primaryUrl = `${base}/route/v1/${apiProfile}/${routeCoords}?${baseParams}`;
  const fallbackUrl = `${FALLBACK_BASE}/route/v1/${apiProfile}/${routeCoords}?${baseParams}`;

  let primaryResult = null;
  try {
    primaryResult = await fetchRouteHttpWithRetry(primaryUrl, OSRM_PRIMARY_TIMEOUT_MS);
  } catch {
    primaryResult = null;
  }

  let r;
  let body;
  let routingSource;

  if (primaryResult?.r.ok) {
    r = primaryResult.r;
    body = primaryResult.body;
    routingSource = 'osm-de';
  } else {
    ({ r, body } = await fetchRouteHttpWithRetry(fallbackUrl, OSRM_FALLBACK_TIMEOUT_MS));
    if (r.ok) routingSource = 'project-osrm';
  }

  let data;
  try {
    data = JSON.parse(body);
  } catch {
    if (!r.ok) throw new Error(`OSRM ${r.status}: ${body.slice(0, 240)}`);
    throw new Error('OSRM invalid JSON');
  }

  if (data.code && data.code !== 'Ok') {
    return { ok: false, data };
  }
  if (!r.ok) {
    throw new Error(`OSRM ${r.status}: ${body.slice(0, 240)}`);
  }
  if (routingSource) {
    data._meta = { ...(data._meta || {}), routingSource };
  }
  return { ok: true, data, routingSource };
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

    let out;
    try {
      out = await fetchOsrmSingleRadius(profile, coordList, OSRM_SNAP_RADIUS_STRICT_M);
    } catch (e) {
      res.status(502).json({ error: String(e?.message ?? e) });
      return;
    }

    if (out.ok) {
      out.data._meta = {
        ...(out.data._meta || {}),
        osrmSnapRadiusM: OSRM_SNAP_RADIUS_STRICT_M,
        osrmSnapRelaxed: false,
      };
      res.status(200).json(out.data);
      return;
    }

    if (out.data?.code === 'NoSegment') {
      let relaxed;
      try {
        relaxed = await fetchOsrmSingleRadius(profile, coordList, OSRM_SNAP_RADIUS_RELAXED_M);
      } catch (e) {
        res.status(502).json({ error: String(e?.message ?? e) });
        return;
      }
      if (relaxed.ok) {
        relaxed.data._meta = {
          ...(relaxed.data._meta || {}),
          osrmSnapRadiusM: OSRM_SNAP_RADIUS_RELAXED_M,
          osrmSnapRelaxed: true,
        };
        res.status(200).json(relaxed.data);
        return;
      }
      const fail = relaxed.data ?? out.data;
      res.status(400).json({
        error: fail?.message || 'Could not find a routable road near the selected points.',
        code: fail?.code || 'NoSegment',
      });
      return;
    }

    const err = out.data;
    res.status(400).json({
      error: err?.message || 'Route request failed',
      code: err?.code,
    });
    return;
  } catch (e) {
    res.status(502).json({ error: String(e?.message ?? e) });
  }
}
