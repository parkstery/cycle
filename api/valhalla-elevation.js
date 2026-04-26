/**
 * Valhalla(Stadia) route API로 elevation_interval 기반 표고 프로필을 가져온다.
 * OSRM geometry 는 그대로 두고, 고도만 Valhalla 로 얻는 A안 PoC 용.
 *
 * POST JSON body:
 * {
 *   "locations": [ { "lat": number, "lng": number }, ... ]  // 또는 lon
 *   "costing": "bicycle" | "auto" | "pedestrian" (기본 bicycle)
 *   "elevation_interval": number (기본 30)
 *   "units": "kilometers" | "miles" (기본 kilometers)
 * }
 *
 * 환경변수: STADIA_MAPS_API_KEY (Vercel / 로컬 서버)
 */

const STADIA_ROUTE_URL = 'https://api.stadiamaps.com/route/v1';

function decodePolyline6(encoded) {
  let index = 0;
  let lat = 0;
  let lng = 0;
  const coordinates = [];
  const len = encoded.length;

  while (index < len) {
    let b;
    let shift = 0;
    let result = 0;
    do {
      b = encoded.charCodeAt(index++) - 63;
      result |= (b & 0x1f) << shift;
      shift += 5;
    } while (b >= 0x20);
    const dlat = result & 1 ? ~(result >> 1) : result >> 1;
    lat += dlat;

    shift = 0;
    result = 0;
    do {
      b = encoded.charCodeAt(index++) - 63;
      result |= (b & 0x1f) << shift;
      shift += 5;
    } while (b >= 0x20);
    const dlng = result & 1 ? ~(result >> 1) : result >> 1;
    lng += dlng;

    coordinates.push([lat / 1e6, lng / 1e6]);
  }
  return coordinates;
}

function toLonLat(loc) {
  const lat = loc.lat != null ? Number(loc.lat) : Number(loc.latitude);
  const lon = loc.lng != null ? Number(loc.lng) : loc.lon != null ? Number(loc.lon) : Number(loc.longitude);
  return { lat, lon };
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }
  res.setHeader('Access-Control-Allow-Origin', '*');

  const apiKey = process.env.STADIA_MAPS_API_KEY;
  if (!apiKey) {
    res.status(500).json({ error: 'STADIA_MAPS_API_KEY is not configured on the server' });
    return;
  }

  try {
    const body = req.body || {};
    const locationsIn = body.locations;
    if (!Array.isArray(locationsIn) || locationsIn.length < 2) {
      res.status(400).json({ error: 'locations array with at least 2 points is required' });
      return;
    }

    const costing = typeof body.costing === 'string' ? body.costing : 'bicycle';
    const elevationInterval =
      typeof body.elevation_interval === 'number' && Number.isFinite(body.elevation_interval)
        ? body.elevation_interval
        : 30;
    const units = typeof body.units === 'string' ? body.units : 'kilometers';

    const locations = locationsIn.map((loc) => {
      const { lat, lon } = toLonLat(loc);
      return { lat, lon, type: 'break' };
    });

    const valhallaReq = {
      locations,
      costing,
      units,
      elevation_interval: elevationInterval,
    };

    const url = `${STADIA_ROUTE_URL}?api_key=${encodeURIComponent(apiKey)}`;
    const r = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(valhallaReq),
    });

    const text = await r.text();
    if (!r.ok) {
      let errMsg = text;
      try {
        const j = JSON.parse(text);
        errMsg = j.error || j.status_message || text;
      } catch {
        // ignore
      }
      res.status(r.status).json({ error: errMsg });
      return;
    }

    const data = JSON.parse(text);
    const trip = data.trip;
    if (!trip || !Array.isArray(trip.legs) || trip.legs.length === 0) {
      res.status(502).json({ error: 'Invalid Valhalla response: missing trip.legs' });
      return;
    }

    const leg = trip.legs[0];
    const shape = leg.shape;
    const elev = leg.elevation;
    if (!shape || !Array.isArray(elev)) {
      res.status(502).json({ error: 'Valhalla response missing shape or elevation array' });
      return;
    }

    const coords = decodePolyline6(String(shape));
    if (coords.length === 0) {
      res.status(502).json({ error: 'Decoded Valhalla shape is empty' });
      return;
    }

    const n = Math.min(coords.length, elev.length);
    const results = [];
    for (let i = 0; i < n; i++) {
      const [lat, lng] = coords[i];
      results.push({
        latitude: lat,
        longitude: lng,
        elevation: Number(elev[i]) || 0,
      });
    }

    res.setHeader('X-Elevation-Provider', 'valhalla-stadia');
    res.setHeader('Access-Control-Expose-Headers', 'X-Elevation-Provider');
    res.status(200).json({ results, elevation_interval: leg.elevation_interval ?? elevationInterval });
  } catch (e) {
    res.status(502).json({ error: String(e?.message ?? e) });
  }
}
