// Profile store — GET /api/profile?address=0x... or POST with {address,name,bio,avatarUrl}
// Stores each user's latest public profile in Redis so any device can fetch it.

function cors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Cache-Control', 'no-store');
}

async function redis(cmd, ...args) {
  const url   = process.env.UPSTASH_KV_REST_API_URL  || process.env.KV_REST_API_URL  || process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_KV_REST_API_TOKEN || process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) throw new Error('No Redis credentials');
  const res = await fetch(url, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify([cmd, ...args]),
  });
  if (!res.ok) throw new Error(`Redis HTTP ${res.status}`);
  return (await res.json()).result;
}

export default async function handler(req, res) {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();

  const urlObj = new URL(req.url, `http://${req.headers.host}`);

  try {
    if (req.method === 'GET') {
      // GET /api/profile?address=0x... → {name, bio, avatarUrl, ts}
      const address = (urlObj.searchParams.get('address') || '').toLowerCase().trim();
      if (!address) return res.status(400).json({ error: 'address required' });
      const raw = await redis('GET', `pmt_profile:${address}`);
      if (!raw) return res.status(200).json(null);
      const profile = typeof raw === 'string' ? JSON.parse(raw) : raw;
      return res.status(200).json(profile);

    } else if (req.method === 'POST') {
      // POST /api/profile  body: {address, name, bio, avatarUrl}
      let body = '';
      await new Promise(resolve => { req.on('data', c => body += c); req.on('end', resolve); });
      const { address, name, bio, avatarUrl } = JSON.parse(body);
      if (!address) return res.status(400).json({ error: 'address required' });
      const addr = address.toLowerCase().trim();
      const profile = { name: name || '', bio: bio || '', avatarUrl: avatarUrl || null, ts: Date.now() };
      await redis('SET', `pmt_profile:${addr}`, JSON.stringify(profile), 'EX', 2592000); // 30 days
      return res.status(200).json({ ok: true });

    } else {
      return res.status(405).end();
    }
  } catch (e) {
    console.error('[profile]', e.message);
    return res.status(500).json({ error: e.message });
  }
}
