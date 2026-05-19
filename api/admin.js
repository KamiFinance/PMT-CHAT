// Admin dashboard API — returns all registered users from Redis.
// Protected by X-Admin-Key header. Set ADMIN_SECRET as Vercel env var.

async function redis(cmd, ...args) {
  const url  = process.env.KV_REST_API_URL  || process.env.UPSTASH_REDIS_REST_URL;
  const token= process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) throw new Error('Redis env vars not set');
  const res = await fetch(`${url}/${[cmd, ...args].map(encodeURIComponent).join('/')}`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  const json = await res.json();
  if (json.error) throw new Error(json.error);
  return json.result;
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') { res.status(200).end(); return; }

  // Auth check
  const secret = process.env.ADMIN_SECRET;
  const provided = req.headers['x-admin-key'] || '';
  if (!secret || provided !== secret) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  try {
    // SCAN all pmt:user:* keys
    let cursor = '0';
    const allKeys = [];
    do {
      const result = await redis('SCAN', cursor, 'MATCH', 'pmt:user:*', 'COUNT', '100');
      cursor = result[0];
      allKeys.push(...result[1]);
    } while (cursor !== '0');

    // Fetch each user record
    const users = await Promise.all(
      allKeys.map(async key => {
        try {
          const raw = await redis('GET', key);
          if (!raw) return null;
          const rec = typeof raw === 'string' ? JSON.parse(raw) : raw;
          return {
            username: rec.username || key.replace('pmt:user:', ''),
            address:  rec.address  || '—',
            hasBackup: !!rec.encryptedBackup,
            createdAt: rec.createdAt || null,
          };
        } catch { return null; }
      })
    );

    const valid = users.filter(Boolean).sort((a, b) => a.username.localeCompare(b.username));
    res.status(200).json({ count: valid.length, users: valid, fetchedAt: new Date().toISOString() });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}
