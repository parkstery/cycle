const OSRM = 'https://router.project-osrm.org';
const SNAP_RADIUS_M = 50;

/** router.project-osrm.org uses car/bike/foot, not driving/cycling/foot */
function toOsrmProfile(profile) {
  if (profile === 'driving') return 'car';
  if (profile === 'cycling') return 'bike';
  return profile || 'foot';
}

/**
 * Snap a single coordinate to the road network via OSRM nearest.
 * @param {string} profile - OSRM profile: car, bike, foot
 * @param {string} coord - "lng,lat"
 * @returns {Promise<string>} "lng,lat" snapped, or original on failure
 */
async function snapCoord(profile, coord) {
  const trimmed = coord.trim();
  if (!trimmed) return trimmed;
  const nearestUrl = `${OSRM}/nearest/v1/${profile}/${trimmed}?number=1&radiuses=${SNAP_RADIUS_M}`;
  const r = await fetch(nearestUrl);
  if (!r.ok) return trimmed;
  const data = await r.json();
  if (data.code === 'Ok' && data.waypoints && data.waypoints[0] && data.waypoints[0].location) {
    const [lng, lat] = data.waypoints[0].location;
    return `${lng},${lat}`;
  }
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

    const osrmProfile = toOsrmProfile(profile);
    const baseParams = 'overview=full&geometries=polyline&alternatives=false&steps=false';

    const fetchRoute = (coordsStr) =>
      fetch(`${OSRM}/route/v1/${osrmProfile}/${coordsStr}?${baseParams}`);

    // 1) nearest로 스냅 후 route 시도
    const snappedList = await Promise.all(
      coordList.map((coord) => snapCoord(osrmProfile, coord))
    );
    let r = await fetchRoute(snappedList.join(';'));
    let body = await r.text();

    // 2) 400이면 스냅 없이 원본 좌표로 재시도 (공개 서버 NoRoute 등 대응)
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
    res.status(502).json({ error: String(e.message) });
  }
}
