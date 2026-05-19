// Proxy for @imgly/background-removal CDN assets.
// staticimgly.com is blocked on some networks/browsers; this serves the same
// files from our own domain (pmt-chat.vercel.app) to avoid CORS/network issues.
// Files are immutable chunks — cache aggressively at the edge.

export const config = { api: { responseLimit: false } }; // allow large WASM files

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  if (req.method === 'OPTIONS') { res.status(200).end(); return; }

  // req.query.path is the filename after /api/bgremoval/
  const rawPath = Array.isArray(req.query.path)
    ? req.query.path.join('/')
    : (req.query.path || '');

  // Security: only allow safe filenames (hash strings, resources.json)
  if (!rawPath || rawPath.includes('..') || rawPath.includes('\0')) {
    res.status(400).json({ error: 'Invalid path' });
    return;
  }

  const upstream = `https://staticimgly.com/@imgly/background-removal-data/1.7.0/dist/${rawPath}`;

  try {
    const upstreamRes = await fetch(upstream);
    if (!upstreamRes.ok) {
      res.status(upstreamRes.status).end();
      return;
    }

    const contentType = upstreamRes.headers.get('content-type') || 'application/octet-stream';
    res.setHeader('Content-Type', contentType);
    // Chunks are content-addressed (hash filenames) → safe to cache forever
    res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');

    const buffer = await upstreamRes.arrayBuffer();
    res.status(200).send(Buffer.from(buffer));
  } catch (err) {
    res.status(502).json({ error: 'Upstream fetch failed', detail: err.message });
  }
}
