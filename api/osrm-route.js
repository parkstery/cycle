const OSRM = 'https://router.project-osrm.org';

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }
  res.setHeader('Access-Control-Allow-Origin', '*');
  try {
    const { profile = 'cycling', coords } = req.query;
    if (!coords) {
      res.status(400).json({ error: 'Missing coords' });
      return;
    }
    const url = `${OSRM}/route/v1/${profile}/${coords}?overview=full&geometries=polyline`;
    const r = await fetch(url);
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
