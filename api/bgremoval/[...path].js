export const config = { api: { responseLimit: false } };

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') { res.status(200).end(); return; }

  // Debug: return query object to understand what Vercel passes
  if (req.query._debug) {
    return res.status(200).json({ query: req.query, url: req.url });
  }

  const parts = Array.isArray(req.query.path)
    ? req.query.path
    : req.query.path
      ? [req.query.path]
      : (req.url || '').replace(/^\/api\/bgremoval\/?/, '').split('/').filter(Boolean);

  const filePath = parts.join('/');

  if (!filePath || filePath.includes('..') || filePath.includes('\0')) {
    return res.status(400).json({ error: 'Invalid path', query: req.query, url: req.url });
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
