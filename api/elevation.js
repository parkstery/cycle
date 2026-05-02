const OPEN_ELEVATION_URL = 'https://api.open-elevation.com/api/v1/lookup';
const OPENTOPODATA_URL = 'https://api.opentopodata.org/v1/srtm90m';
/** Open-Elevation 무응답·장애 시 빠르게 폴백 (공개 서비스 SLA 없음) */
const OPEN_ELEVATION_TIMEOUT_MS = 4000;
const OPENTOPODATA_TIMEOUT_MS = 15000;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** 업스트림 일시 오류·콜드스타트 흡수 */
async function withUpstreamRetry(fn, attempts = 2, gapMs = 400) {
  for (let i = 0; i < attempts; i++) {
    if (i > 0) await sleep(gapMs);
    const out = await fn();
    if (out) return out;
  }
  return null;
}

/** 응답 직전에 항상 호출 — DevTools에서 사용된 공급자 확인 가능 */
function setProviderHeaders(res, usedProvider) {
  res.setHeader('X-Elevation-Provider', usedProvider);
  res.setHeader('Access-Control-Expose-Headers', 'X-Elevation-Provider');
}

/** 헤더 설정 + status + json 한 번에 — 응답 마무리 중복 제거 */
function send(res, status, body, provider) {
  setProviderHeaders(res, provider);
  res.status(status).json(body);
}

/**
 * 자동 모드: OpenTopoData(SRTM) 1차 — Open-Elevation은 무응답·다운이 잦아 2차로 두고 짧은 타임아웃.
 * POST body: { locations: [{ latitude, longitude }], provider?: 'open-elevation' | 'opentopodata' }
 * provider 지정 시 해당 공급자만 사용(이중화 테스트용).
 * 응답(항상 동일 형식): { results: [{ latitude, longitude, elevation }] }
 * X-Elevation-Provider: 200 시 사용된 공급자, 502 시 'none' — 항상 내려감.
 */
export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }
  res.setHeader('Access-Control-Allow-Origin', '*');
  let usedProvider = 'none';
  try {
    const { locations, provider } = req.body || {};
    if (!locations || !Array.isArray(locations) || locations.length === 0) {
      send(res, 400, { error: 'Missing or empty locations' }, usedProvider);
      return;
    }
    if (locations.length > 100) {
      send(res, 400, { error: 'At most 100 locations per request' }, usedProvider);
      return;
    }

    console.log('Elevation provider (requested):', provider ?? 'auto');

    if (provider === 'opentopodata') {
      const data = await withUpstreamRetry(() => tryOpenTopoData(locations));
      if (data) {
        usedProvider = 'opentopodata';
        console.log('Elevation provider (used): opentopodata');
        send(res, 200, data, usedProvider);
        return;
      }
      send(res, 502, { error: 'OpenTopoData unavailable' }, usedProvider);
      return;
    }

    if (provider === 'open-elevation') {
      const data = await withUpstreamRetry(() => tryOpenElevation(locations));
      if (data) {
        usedProvider = 'open-elevation';
        console.log('Elevation provider (used): open-elevation');
        send(res, 200, data, usedProvider);
        return;
      }
      send(res, 502, { error: 'Open-Elevation unavailable' }, usedProvider);
      return;
    }

    let data = await withUpstreamRetry(() => tryOpenTopoData(locations));
    if (data) {
      usedProvider = 'opentopodata';
      console.log('Elevation provider (used): opentopodata');
      send(res, 200, data, usedProvider);
      return;
    }

    data = await withUpstreamRetry(() => tryOpenElevation(locations));
    if (data) {
      usedProvider = 'open-elevation';
      console.log('Elevation provider (used): open-elevation');
      send(res, 200, data, usedProvider);
      return;
    }

    send(res, 502, { error: 'Elevation service unavailable' }, usedProvider);
  } catch (e) {
    send(res, 502, { error: String(e?.message ?? e) }, usedProvider);
  }
}

/**
 * Open-Elevation 호출. 실패 시 null.
 */
async function tryOpenElevation(locations) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), OPEN_ELEVATION_TIMEOUT_MS);
  try {
    const response = await fetch(OPEN_ELEVATION_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ locations }),
      signal: controller.signal,
    });
    clearTimeout(timeoutId);
    if (!response.ok) return null;
    const data = await response.json();
    if (!data.results || !Array.isArray(data.results) || data.results.length !== locations.length) return null;
    return data;
  } catch {
    clearTimeout(timeoutId);
    return null;
  }
}

/**
 * OpenTopoData 호출. locations 문자열 형식: "lat,lng|lat,lng"
 * 응답을 Open-Elevation과 동일한 형식으로 정규화.
 */
async function tryOpenTopoData(locations) {
  const locationsStr = locations.map((l) => `${l.latitude},${l.longitude}`).join('|');
  const url = `${OPENTOPODATA_URL}?locations=${encodeURIComponent(locationsStr)}`;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), OPENTOPODATA_TIMEOUT_MS);
  try {
    const response = await fetch(url, { method: 'GET', signal: controller.signal });
    clearTimeout(timeoutId);
    if (!response.ok) return null;
    const data = await response.json();
    if (data.status !== 'OK' || !data.results || !Array.isArray(data.results)) return null;
    const results = locations.map((loc, i) => {
      const r = data.results[i];
      return {
        latitude: loc.latitude,
        longitude: loc.longitude,
        elevation: r?.elevation != null ? Number(r.elevation) : 0,
      };
    });
    return { results };
  } catch {
    clearTimeout(timeoutId);
    return null;
  }
}
