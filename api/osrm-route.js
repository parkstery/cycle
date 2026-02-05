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

    // 2단계: Snap each coordinate to road via nearest API
    const snappedList = await Promise.all(
      coordList.map((coord) => snapCoord(osrmProfile, coord))
    );
    const snappedCoords = snappedList.join(';');
    const radiuses = snappedList.map(() => SNAP_RADIUS_M).join(';');

    // 4단계: overview=full, alternatives=false, steps=false (radiuses는 넉넉히 50m)
    const routeUrl = `${OSRM}/route/v1/${osrmProfile}/${snappedCoords}?overview=full&geometries=polyline&alternatives=false&steps=false&radiuses=${radiuses}`;
    const r = await fetch(routeUrl);
    if (!r.ok) {
      res.status(r.status).json(await r.text());
      return;
    }
    const data = await r.json();
    res.status(200).json(data);
  } catch (e) {
    res.status(502).json({ error: String(e.message) });
  }
}
