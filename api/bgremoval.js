// Proxy for @imgly/background-removal CDN assets.
// staticimgly.com is unreachable on some networks; this routes the same
// files through our Vercel domain so the browser always gets them with
// proper CORS headers, regardless of network restrictions.
export const config = { api: { responseLimit: false } };

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  if (req.method === 'OPTIONS') { res.status(200).end(); return; }

  const rawPath = Array.isArray(req.query.path)
    ? req.query.path.join('/')
    : (req.query.path || '');

  if (!rawPath || rawPath.includes('..') || rawPath.includes('\0')) {
    res.status(400).json({ error: 'Invalid path' }); return;
  }

  try {
    const upstream = `https://staticimgly.com/@imgly/background-removal-data/1.7.0/dist/${rawPath}`;
    const up = await fetch(upstream);
    if (!up.ok) { res.status(up.status).end(); return; }
    res.setHeader('Content-Type', up.headers.get('content-type') || 'application/octet-stream');
    res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    res.status(200).send(Buffer.from(await up.arrayBuffer()));
  } catch (e) {
    res.status(502).json({ error: 'upstream failed', detail: e.message });
  }
}
