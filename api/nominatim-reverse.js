const NOMINATIM = 'https://nominatim.openstreetmap.org';
const USER_AGENT = 'FitnessProCycleSimulator/1.0 (https://github.com/your-org/cycle)';

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }
  res.setHeader('Access-Control-Allow-Origin', '*');
  try {
    const { lat, lon, format = 'json' } = req.query;
    if (lat == null || lon == null) {
      res.status(400).json({ error: 'Missing lat or lon' });
      return;
    }
    const url = `${NOMINATIM}/reverse?lat=${lat}&lon=${lon}&format=${format}`;
    const r = await fetch(url, { headers: { 'User-Agent': USER_AGENT } });
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
