// Catch-all proxy for @imgly/background-removal CDN assets.
// In Vercel catch-all routes, the param is req.query['...path'] (not req.query.path).
import { rateLimit } from '../_security.js';
export const config = { api: { responseLimit: false } };

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  // Rate limit: 50 req/min (model files are cached, so 50 is plenty for real use)
  const rl = await rateLimit(req, 'bgremoval', 50, 60);
  if (!rl.allowed) { res.status(429).end(); return; }
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  if (req.method === 'OPTIONS') { res.status(200).end(); return; }

  // Vercel catch-all: param key is '...path', value is array of path segments
  const raw = req.query['...path'];
  const parts = Array.isArray(raw) ? raw : raw ? [raw] : [];
  const filePath = parts.join('/');

  if (!filePath || filePath.includes('..') || filePath.includes('\0')) {
    return res.status(400).json({ error: 'Invalid path' });
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
