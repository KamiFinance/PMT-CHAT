// Giphy proxy — keeps API key server-side
import { rateLimit, securityHeaders } from './_security.js';

export default async function handler(req, res) {
  securityHeaders(res);
  const rl = await rateLimit(req, 'giphy', 30, 60);
  if (!rl.allowed) { res.status(429).json({ error: 'Too many requests' }); return; }
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const apiKey = process.env.GIPHY_API_KEY || 'dc6zaTOxFJmzC';
  const { q, type = 'gif', limit = 30, offset = 0 } = req.query;
  const isSticker = type === 'sticker';
  const base = isSticker
    ? 'https://api.giphy.com/v1/stickers'
    : 'https://api.giphy.com/v1/gifs';
  const endpoint = q
    ? `${base}/search?q=${encodeURIComponent(q)}&api_key=${apiKey}&limit=${limit}&offset=${offset}&rating=g&lang=en`
    : `${base}/trending?api_key=${apiKey}&limit=${limit}&offset=${offset}&rating=g`;

  try {
    const r = await fetch(endpoint, { headers: { 'User-Agent': 'PMTChat/1.0' } });
    if (!r.ok) return res.status(r.status).json({ error: 'Giphy error', items: [] });
    const d = await r.json();
    const items = (d.data || []).map(g => ({
      id: g.id,
      url: g.images?.fixed_height?.url || g.images?.downsized?.url || g.images?.fixed_height_downsampled?.url || g.images?.original?.url || '',
      width: parseInt(g.images?.fixed_height?.width || g.images?.original?.width || '200'),
      height: parseInt(g.images?.fixed_height?.height || g.images?.original?.height || '200'),
      preview: g.images?.fixed_height_small?.url || g.images?.fixed_height?.url || '',
      title: g.title || '',
    })).filter(g => g.url);
    res.json({ items });
  } catch (e) {
    res.status(500).json({ error: e.message, items: [] });
  }
}
