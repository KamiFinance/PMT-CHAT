// Server-side pin storage for 1-on-1 chats
// Key: pmt:pins:{addr1}-{addr2} (addresses sorted so both users use the same key)

async function redis(cmd, ...args) {
  const url = process.env.UPSTASH_KV_REST_API_URL || process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
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

async function readBody(req) {
  let body = '';
  await new Promise(r => { req.on('data', c => body += c); req.on('end', r); });
  return JSON.parse(body);
}

function convKey(addr1, addr2) {
  // Sort so Alice-Bob and Bob-Alice use the same key
  const [a, b] = [addr1.toLowerCase(), addr2.toLowerCase()].sort();
  return `pmt:pins:${a}-${b}`;
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    if (req.method === 'GET') {
      // GET /api/pins?addr1=0x...&addr2=0x...
      const url = new URL(req.url, `http://${req.headers.host}`);
      const addr1 = url.searchParams.get('addr1') || '';
      const addr2 = url.searchParams.get('addr2') || '';
      if (!addr1 || !addr2) return res.status(400).json({ error: 'addr1 and addr2 required' });
      const key = convKey(addr1, addr2);
      const raw = await redis('GET', key);
      const pins = raw ? (typeof raw === 'string' ? JSON.parse(raw) : raw) : [];
      return res.json({ ok: true, pins: Array.isArray(pins) ? pins : [] });
    }

    if (req.method === 'POST') {
      const body = await readBody(req);
      const { addr1, addr2, pin, unpinId } = body;
      if (!addr1 || !addr2) return res.status(400).json({ error: 'addr1 and addr2 required' });
      const key = convKey(addr1, addr2);
      const raw = await redis('GET', key);
      let pins = raw ? (typeof raw === 'string' ? JSON.parse(raw) : raw) : [];
      if (!Array.isArray(pins)) pins = [];

      if (unpinId) {
        // Unpin
        pins = pins.filter(p => p.id !== unpinId);
      } else if (pin) {
        // Pin — deduplicate and sort by msgTs
        if (!pins.some(p => p.id === pin.id)) {
          pins = [...pins, pin].sort((a, b) => (a.msgTs || 0) - (b.msgTs || 0));
        }
      }

      await redis('SET', key, JSON.stringify(pins));
      await redis('EXPIRE', key, String(60*60*24*90)); // 90 days
      return res.json({ ok: true, pins });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
