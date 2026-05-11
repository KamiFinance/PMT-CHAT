// Save/remove push subscription for a user address
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
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  // Vercel auto-parses JSON bodies — use req.body directly
  const { address, subscription } = req.body || {};
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
