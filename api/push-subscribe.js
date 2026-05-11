// Save/remove push subscription for a user address
async function redis(cmd, ...args) {
  const url = process.env.UPSTASH_KV_REST_API_URL || process.env.KV_REST_API_URL;
  const token = process.env.UPSTASH_KV_REST_API_TOKEN || process.env.KV_REST_API_TOKEN;
  if (!url || !token) throw new Error('No Redis credentials');
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

  let body = '';
  await new Promise(r => { req.on('data', c => body += c); req.on('end', r); });
  const { address, subscription } = JSON.parse(body || '{}');
  if (!address) return res.status(400).json({ error: 'address required' });

  if (req.method === 'DELETE') {
    await redis('DEL', `push:${address.toLowerCase()}`);
    return res.json({ ok: true });
  }

  if (req.method === 'POST') {
    if (!subscription) return res.status(400).json({ error: 'subscription required' });
    // Store with 1-year expiry
    await redis('SET', `push:${address.toLowerCase()}`, JSON.stringify(subscription), 'EX', 31536000);
    return res.json({ ok: true });
  }

  res.status(405).json({ error: 'Method not allowed' });
}
