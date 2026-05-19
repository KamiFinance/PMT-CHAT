// Save/remove push subscription for a user address
import { rateLimit, securityHeaders } from './_security.js';


async function redis(cmd, ...args) {
  const url = process.env.UPSTASH_KV_REST_API_URL || process.env.KV_REST_API_URL;
  const token = process.env.UPSTASH_KV_REST_API_TOKEN || process.env.KV_REST_API_TOKEN;
  if (!url || !token) { console.error('push-subscribe: no Redis credentials'); return null; }
  const res = await fetch(url, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify([cmd, ...args]),
  });
  const data = await res.json();
  return data.result;
}

export default async function handler(req, res) {
  const _rl = await rateLimit(req, 'push_sub', 10, 60);
  if (!_rl.allowed) { res.status(429).json({ error: 'Too many requests' }); return; }
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  // Parse body manually — Vercel does not auto-parse JSON in serverless functions
  let body = {};
  try {
    let raw = '';
    await new Promise(resolve => { req.on('data', c => raw += c); req.on('end', resolve); });
    body = raw ? JSON.parse(raw) : {};
  } catch {}

  const { address, subscription } = body;
  if (!address) return res.status(400).json({ error: 'address required' });

  const key = `push:${address.toLowerCase()}`;

  if (req.method === 'DELETE') {
    await redis('DEL', key);
    return res.json({ ok: true });
  }

  if (req.method === 'POST') {
    if (!subscription) return res.status(400).json({ error: 'subscription required' });
    await redis('SET', key, JSON.stringify(subscription), 'EX', 31536000);
    console.log('push-subscribe: saved subscription for', address.toLowerCase());
    return res.json({ ok: true });
  }

  res.status(405).json({ error: 'Method not allowed' });
}
