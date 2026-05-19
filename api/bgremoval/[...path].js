// Catch-all proxy for @imgly/background-removal CDN assets.
// Routes /api/bgremoval/resources.json, /api/bgremoval/{hash}, etc.
// to staticimgly.com — works around CDN blocks on desktop browsers.
export const config = { api: { responseLimit: false } };

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  if (req.method === 'OPTIONS') { res.status(200).end(); return; }

  const parts = Array.isArray(req.query.path) ? req.query.path : [req.query.path || ''];
  const filePath = parts.join('/');

  if (!filePath || filePath.includes('..') || filePath.includes('\0')) {
    res.status(400).json({ error: 'Invalid path' }); return;
  }

  try {
    const upstream = `https://staticimgly.com/@imgly/background-removal-data/1.7.0/dist/${filePath}`;
    const up = await fetch(upstream);
    if (!up.ok) { res.status(up.status).end(); return; }
    res.setHeader('Content-Type', up.headers.get('content-type') || 'application/octet-stream');
    res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    res.status(200).send(Buffer.from(await up.arrayBuffer()));
  } catch (e) {
    res.status(502).json({ error: 'upstream failed', detail: e.message });
  }
}
