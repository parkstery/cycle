#!/usr/bin/env node
/**
 * scripts/build-default-routes.mjs
 *
 * DEFAULT My Routes 슬롯을 OSRM/Open-Elevation 재호출 없이 주행 가능한 형식(v2 payload)으로 사전 빌드.
 * 실행: node scripts/build-default-routes.mjs
 *      (package.json 에 "build:default-routes" 스크립트 등록)
 *
 * 입력: scripts/default-routes.config.json, scripts/explore-routes.config.json
 * 출력: public/my-routes/default-slot-*.json, public/explore-routes/explore-slot-*.json
 *
 * 외부 API:
 *   - Nominatim (주소 → 좌표): https://nominatim.openstreetmap.org
 *   - OSRM (routing.openstreetmap.de): /routed-bike | /routed-foot | /routed-car
 *   - Open-Elevation: https://api.open-elevation.com/api/v1/lookup
 *
 * 정책:
 *   - 각 슬롯은 origin/destination 에 "lat,lng" 직접 지정도 허용(Nominatim 생략).
 *   - rate limit: Nominatim 1 req/s, OSRM public 2 req/s, Open-Elevation 체감 1 req/s.
 *   - 실패 시 해당 슬롯은 기존 JSON 유지하며 경고 출력(다른 슬롯은 계속 빌드).
 *
 * 이 스크립트는 App.tsx 의 densifyLatLngPath / computeCumulativeDistances 와 동일 로직을 포함한다.
 * 렌더 타임과 빌드 타임 결과가 일치해야 densifiedGeometry 의 currentIndex 의미가 같아진다.
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..');
const BUILD_CONFIGS = [
  { configPath: path.join(__dirname, 'default-routes.config.json'), outputDir: path.join(REPO_ROOT, 'public', 'my-routes') },
  { configPath: path.join(__dirname, 'explore-routes.config.json'), outputDir: path.join(REPO_ROOT, 'public', 'explore-routes') }
];

const USER_AGENT = 'FitnessProCycleSimulator/1.0 (build-default-routes)';
const NOMINATIM_BASE = 'https://nominatim.openstreetmap.org';
const OSRM_BASE = 'https://routing.openstreetmap.de';
const OPEN_ELEVATION_URL = 'https://api.open-elevation.com/api/v1/lookup';
const DENSIFY_INTERVAL_M = 10;
const SCHEMA_VERSION = 2;
const SNAP_RADIUS_M = 50;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/* ---------- geo helpers (App.tsx / services/geoUtils 와 동일) ---------- */

function haversine(a, b) {
  const R = 6371000;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLon = ((b.lng - a.lng) * Math.PI) / 180;
  const x =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((a.lat * Math.PI) / 180) * Math.cos((b.lat * Math.PI) / 180) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
}

function headingDeg(a, b) {
  const dLon = ((b.lng - a.lng) * Math.PI) / 180;
  const y = Math.sin(dLon) * Math.cos((b.lat * Math.PI) / 180);
  const x =
    Math.cos((a.lat * Math.PI) / 180) * Math.sin((b.lat * Math.PI) / 180) -
    Math.sin((a.lat * Math.PI) / 180) * Math.cos((b.lat * Math.PI) / 180) * Math.cos(dLon);
  const brng = (Math.atan2(y, x) * 180) / Math.PI;
  return (brng + 360) % 360;
}

function offset(from, distanceM, headingDegVal) {
  const R = 6371000;
  const d = distanceM / R;
  const brng = (headingDegVal * Math.PI) / 180;
  const lat1 = (from.lat * Math.PI) / 180;
  const lng1 = (from.lng * Math.PI) / 180;
  const lat2 = Math.asin(Math.sin(lat1) * Math.cos(d) + Math.cos(lat1) * Math.sin(d) * Math.cos(brng));
  const lng2 = lng1 + Math.atan2(Math.sin(brng) * Math.sin(d) * Math.cos(lat1), Math.cos(d) - Math.sin(lat1) * Math.sin(lat2));
  return { lat: (lat2 * 180) / Math.PI, lng: (lng2 * 180) / Math.PI };
}

/** encoded polyline (factor 1e5) → [[lat,lng], ...] */
function decodePolyline(encoded) {
  const points = [];
  let index = 0, lat = 0, lng = 0;
  while (index < encoded.length) {
    let b, shift = 0, result = 0;
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

function densifyLatLngPath(latLngs, intervalM = DENSIFY_INTERVAL_M) {
  if (latLngs.length < 2) return latLngs.slice();
  const out = [];
  for (let i = 0; i < latLngs.length - 1; i++) {
    const p1 = latLngs[i], p2 = latLngs[i + 1];
    out.push(p1);
    const a = { lat: p1[0], lng: p1[1] };
    const b = { lat: p2[0], lng: p2[1] };
    const d = haversine(a, b);
    if (d > intervalM) {
      const steps = Math.floor(d / intervalM);
      const hd = headingDeg(a, b);
      for (let j = 1; j <= steps; j++) {
        const pt = offset(a, j * intervalM, hd);
        out.push([pt.lat, pt.lng]);
      }
    }
  }
  out.push(latLngs[latLngs.length - 1]);
  return out;
}

function cumulativeDistances(latLngs) {
  const cum = new Array(latLngs.length);
  cum[0] = 0;
  for (let i = 1; i < latLngs.length; i++) {
    const a = { lat: latLngs[i - 1][0], lng: latLngs[i - 1][1] };
    const b = { lat: latLngs[i][0], lng: latLngs[i][1] };
    cum[i] = cum[i - 1] + haversine(a, b);
  }
  return cum;
}

const fix8 = (n) => Number(Number(n).toFixed(8));
const formatDistance = (m) => `${(m / 1000).toFixed(1)} km`;
const formatDurationSimple = (seconds) => {
  const h = Math.floor(seconds / 3600);
  const m = Math.round((seconds % 3600) / 60);
  return `${h}:${String(m).padStart(2, '0')}`;
};

/* ---------- API wrappers ---------- */

async function fetchJson(url, init = {}, label = url) {
  const res = await fetch(url, {
    ...init,
    headers: { 'User-Agent': USER_AGENT, ...(init.headers || {}) }
  });
  if (!res.ok) throw new Error(`${label} ${res.status}: ${(await res.text()).slice(0, 200)}`);
  return res.json();
}

/** "lat,lng" 형태는 그대로 쓰고, 아니면 Nominatim search. */
async function resolveToCoord(address) {
  const latLngMatch = /^\s*(-?\d+\.?\d*)\s*,\s*(-?\d+\.?\d*)\s*$/.exec(address || '');
  if (latLngMatch) {
    return { lat: parseFloat(latLngMatch[1]), lng: parseFloat(latLngMatch[2]) };
  }
  await sleep(1100); // Nominatim policy 1 req/s
  const url = `${NOMINATIM_BASE}/search?q=${encodeURIComponent(address)}&format=json&limit=1`;
  const arr = await fetchJson(url, {}, `Nominatim search "${address}"`);
  if (!Array.isArray(arr) || arr.length === 0) throw new Error(`Nominatim no result: ${address}`);
  return { lat: parseFloat(arr[0].lat), lng: parseFloat(arr[0].lon) };
}

function profileToRouteBase(profile) {
  if (profile === 'cycling') return `${OSRM_BASE}/routed-bike`;
  if (profile === 'foot') return `${OSRM_BASE}/routed-foot`;
  return `${OSRM_BASE}/routed-car`;
}

async function snapCoord(routeBase, coord) {
  const url = `${routeBase}/nearest/v1/driving/${coord}?number=1&radiuses=${SNAP_RADIUS_M}`;
  try {
    const data = await fetchJson(url, {}, `OSRM nearest ${coord}`);
    if (data.code === 'Ok' && data.waypoints?.[0]?.location) {
      const [lng, lat] = data.waypoints[0].location;
      return `${lng},${lat}`;
    }
  } catch (e) {
    console.warn('  snap fail (keep original):', e.message);
  }
  return coord;
}

async function osrmRoute(profile, coords) {
  const base = profileToRouteBase(profile);
  const snapped = await Promise.all(
    coords.map(async (c, i) => {
      if (i > 0) await sleep(600);
      return snapCoord(base, c);
    })
  );
  await sleep(600);
  const url = `${base}/route/v1/driving/${snapped.join(';')}?overview=full&geometries=polyline&alternatives=false&steps=false`;
  const data = await fetchJson(url, {}, `OSRM route ${profile}`);
  if (data.code !== 'Ok' || !data.routes?.[0]) throw new Error(`OSRM route not Ok: ${data.code}`);
  return { geometry: data.routes[0].geometry, distance: data.routes[0].distance, duration: data.routes[0].duration };
}

async function sampleElevation(path, samples = 100) {
  const take = Math.min(samples, path.length);
  const step = path.length <= 1 ? 1 : (path.length - 1) / (take - 1);
  const locations = [];
  for (let i = 0; i < take; i++) {
    const idx = Math.min(Math.round(i * step), path.length - 1);
    locations.push({ latitude: path[idx][0], longitude: path[idx][1] });
  }
  // Open-Elevation 은 부하 시 502/504 반환이 잦다. 지수 backoff 로 6회까지 재시도.
  const maxAttempts = 6;
  let lastErr;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const backoffMs = attempt === 1 ? 1100 : Math.min(2000 * Math.pow(2, attempt - 2), 30000);
    await sleep(backoffMs);
    try {
      const res = await fetch(OPEN_ELEVATION_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'User-Agent': USER_AGENT },
        body: JSON.stringify({ locations })
      });
      if (!res.ok) throw new Error(`Elevation ${res.status}`);
      const data = await res.json();
      if (!Array.isArray(data.results)) throw new Error('Elevation invalid response');
      return data.results.map((r) => [fix8(r.latitude), fix8(r.longitude), Number((Number(r.elevation) || 0).toFixed(3))]);
    } catch (e) {
      lastErr = e;
      console.warn(`  elevation attempt ${attempt}/${maxAttempts} failed: ${e.message}`);
    }
  }
  throw lastErr ?? new Error('Elevation failed');
}

/* ---------- main ---------- */

async function buildSlot(slot) {
  const { id, bundledId, origin, destination, waypoints = [], profile = 'cycling', originCoord, destCoord, waypointCoords, source: sourceFromSlot, exploreDisplay } = slot;
  console.log(`\n[${id}] profile=${profile} origin="${origin.slice(0, 60)}..." → destination="${destination.slice(0, 60)}..."`);

  const originLL = originCoord
    ? { lat: originCoord[0], lng: originCoord[1] }
    : await resolveToCoord(origin);
  const destLL = destCoord
    ? { lat: destCoord[0], lng: destCoord[1] }
    : await resolveToCoord(destination);
  const wpLLs = [];
  for (let i = 0; i < waypoints.length; i++) {
    const wp = waypoints[i];
    const coord = waypointCoords?.[i];
    const ll = coord ? { lat: coord[0], lng: coord[1] } : await resolveToCoord(wp.name || wp);
    wpLLs.push(ll);
  }

  console.log(`  origin coord: ${originLL.lat.toFixed(5)},${originLL.lng.toFixed(5)}`);
  console.log(`  dest   coord: ${destLL.lat.toFixed(5)},${destLL.lng.toFixed(5)}`);

  const coords = [originLL, ...wpLLs, destLL].map((p) => `${p.lng},${p.lat}`);
  const { geometry, distance, duration } = await osrmRoute(profile, coords);
  const decoded = decodePolyline(geometry);
  if (decoded.length < 2) throw new Error('OSRM returned empty geometry');

  const fullGeometry = decoded.map(([lat, lng]) => [fix8(lat), fix8(lng)]);
  const densified = densifyLatLngPath(fullGeometry, DENSIFY_INTERVAL_M);
  const cumulative = cumulativeDistances(densified);
  const totalM = cumulative[cumulative.length - 1];
  console.log(`  OSRM: ${decoded.length} pts → densified ${densified.length} pts, total ${(totalM / 1000).toFixed(2)} km`);

  let elevationSamples = [];
  try {
    elevationSamples = await sampleElevation(densified, 100);
    console.log(`  elevation: ${elevationSamples.length} samples`);
  } catch (e) {
    console.warn(`  elevation fetch failed (slot will load without baseline elevation): ${e.message}`);
  }

  const routeSource =
    sourceFromSlot ||
    (String(id || '').startsWith('explore-') ? 'EXPLORE' : 'DEFAULT');
  const json = {
    id,
    source: routeSource,
    bundledId: bundledId || id,
    origin,
    destination,
    waypoints: waypoints.map((wp, i) => ({
      name: typeof wp === 'string' ? wp : wp.name,
      lat: fix8(wpLLs[i].lat),
      lng: fix8(wpLLs[i].lng)
    })),
    timestamp: 0,
    routePayload: {
      schemaVersion: SCHEMA_VERSION,
      provider: 'osrm',
      profile,
      distance: formatDistance(distance),
      duration: formatDurationSimple(duration),
      fullGeometry,
      densifiedGeometry: densified.map(([lat, lng]) => [fix8(lat), fix8(lng)]),
      cumulativeDistances: cumulative.map((d) => Number(d.toFixed(2))),
      ...(elevationSamples.length ? { elevationSamples } : {}),
      totalDistanceMeters: Number(totalM.toFixed(2)),
      originLatLng: [fix8(originLL.lat), fix8(originLL.lng)],
      destLatLng: [fix8(destLL.lat), fix8(destLL.lng)],
      waypointLatLngs: wpLLs.map((ll) => [fix8(ll.lat), fix8(ll.lng)]),
      createdAt: 0
    }
  };
  if (exploreDisplay && typeof exploreDisplay === 'object') {
    json.exploreDisplay = exploreDisplay;
  }
  return json;
}

async function runOneConfig(configPath, outputDir) {
  let config;
  try {
    config = JSON.parse(await fs.readFile(configPath, 'utf8'));
  } catch (e) {
    console.error(`Failed to read config at ${configPath}: ${e.message}`);
    process.exit(1);
  }
  if (!Array.isArray(config.slots) || config.slots.length === 0) {
    console.error(`config.slots must be a non-empty array (${configPath})`);
    process.exit(1);
  }

  await fs.mkdir(outputDir, { recursive: true });
  const summary = [];
  for (const slot of config.slots) {
    try {
      const json = await buildSlot(slot);
      const out = path.join(outputDir, `${slot.id}.json`);
      await fs.writeFile(out, JSON.stringify(json, null, 2) + '\n', 'utf8');
      const bytes = (await fs.stat(out)).size;
      summary.push({ id: slot.id, ok: true, bytes });
      console.log(`  ✓ wrote ${out} (${(bytes / 1024).toFixed(1)} KB)`);
    } catch (e) {
      summary.push({ id: slot.id, ok: false, error: e.message });
      console.error(`  ✗ ${slot.id} failed: ${e.message}`);
    }
  }
  console.log(`\n=== Summary (${path.basename(configPath)}) ===`);
  for (const s of summary) {
    console.log(s.ok ? `✓ ${s.id}  ${(s.bytes / 1024).toFixed(1)} KB` : `✗ ${s.id}  ${s.error}`);
  }
  return summary.filter((s) => !s.ok).length;
}

async function main() {
  let totalFailed = 0;
  for (const { configPath, outputDir } of BUILD_CONFIGS) {
    console.log(`\n--- Building ${path.relative(REPO_ROOT, configPath)} → ${path.relative(REPO_ROOT, outputDir)} ---`);
    totalFailed += await runOneConfig(configPath, outputDir);
  }
  if (totalFailed > 0) process.exit(2);
}

main().catch((e) => {
  console.error('FATAL:', e);
  process.exit(1);
});
