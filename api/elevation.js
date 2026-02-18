const OPEN_ELEVATION_URL = 'https://api.open-elevation.com/api/v1/lookup';

/**
 * Open-Elevation API 프록시. CORS 제한 회피용.
 * POST body: { locations: [{ latitude, longitude }] }
 * 응답: { results: [{ latitude, longitude, elevation }] }
 */
export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }
  res.setHeader('Access-Control-Allow-Origin', '*');
  try {
    const { locations } = req.body || {};
    if (!locations || !Array.isArray(locations) || locations.length === 0) {
      res.status(400).json({ error: 'Missing or empty locations' });
      return;
    }
    const response = await fetch(OPEN_ELEVATION_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ locations }),
    });
    if (!response.ok) {
      const text = await response.text();
      res.status(response.status).json({ error: text || `Open-Elevation ${response.status}` });
      return;
    }
    const data = await response.json();
    if (!data.results || !Array.isArray(data.results)) {
      res.status(502).json({ error: 'Open-Elevation invalid response' });
      return;
    }
    res.status(200).json(data);
  } catch (e) {
    res.status(502).json({ error: String(e?.message ?? e) });
  }
}
