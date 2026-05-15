// Typing indicator — ephemeral Redis keys with 4-second TTL
// POST /api/typing?from=X&to=Y  → sets typing status
// GET  /api/typing?from=X&to=Y  → checks if X is typing to Y

async function redis(cmd, ...args) {
  const url =
    process.env.UPSTASH_KV_REST_API_URL ||
    process.env.KV_REST_API_URL ||
    process.env.UPSTASH_REDIS_REST_URL;
  const token =
    process.env.UPSTASH_KV_REST_API_TOKEN ||
    process.env.KV_REST_API_TOKEN ||
    process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) throw new Error('No Redis REST credentials');
  const res = await fetch(url, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify([cmd, ...args]),
  });
  if (!res.ok) throw new Error(`Redis HTTP ${res.status}`);
  const data = await res.json();
  return data.result;
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Cache-Control', 'no-store');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const url = new URL(req.url, `http://${req.headers.host}`);
  const from = (url.searchParams.get('from') || '').toLowerCase().trim();
  const to   = (url.searchParams.get('to')   || '').toLowerCase().trim();
  if (!from || !to) return res.status(400).json({ error: 'from and to required' });

  const key = `pmt:typing:${from}:${to}`;

  if (req.method === 'POST') {
    // Set key with 4-second TTL — expires naturally when user stops typing
    await redis('SET', key, '1', 'EX', '4');
    return res.status(200).json({ ok: true });
  }

  if (req.method === 'GET') {
    try {
      const val = await redis('GET', key);
      return res.status(200).json({ typing: !!val });
    } catch {
      return res.status(200).json({ typing: false });
    }
  }

  return res.status(405).end();
}
