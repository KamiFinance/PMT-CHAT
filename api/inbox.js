// Cross-device message relay — pure fetch REST, no TCP connections
// Works reliably in Vercel serverless (no ioredis, no persistent connections)

function cors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Cache-Control', 'no-store, no-cache');
}

// Execute a Redis command via REST API (works with both Upstash and Redis Cloud REST)
async function redis(cmd, ...args) {
  // Try all common Upstash/Vercel KV env var name patterns
  const url = process.env.UPSTASH_KV_REST_API_URL
    || process.env.KV_REST_API_URL
    || process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_KV_REST_API_TOKEN
    || process.env.KV_REST_API_TOKEN
    || process.env.UPSTASH_REDIS_REST_TOKEN;

  if (!url || !token) throw new Error('No Redis REST credentials found');

  // POST body instead of URL path — avoids 431 for large payloads (image b64, backups)
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
  cors(res);
  if (req.method === 'OPTIONS') { res.status(200).end(); return; }

  const urlObj = new URL(req.url, `http://${req.headers.host}`);
  const address = (urlObj.searchParams.get('address') || '').toLowerCase().trim();
  if (!address) { res.status(400).json({ error: 'address required' }); return; }

  const key = `pmt:${address}`;

  try {
    if (req.method === 'GET') {
      const msgs = await redis('LRANGE', key, '0', '-1');
      if (msgs && msgs.length > 0) await redis('DEL', key);
      const parsed = (msgs || []).map(m => { try { return JSON.parse(m); } catch { return null; } }).filter(Boolean);
      return res.status(200).json(parsed);

    } else if (req.method === 'POST') {
      let body = '';
      await new Promise(resolve => { req.on('data', c => body += c); req.on('end', resolve); });
      const msg = JSON.parse(body);
      await redis('RPUSH', key, JSON.stringify(msg));
      await redis('EXPIRE', key, '604800');

      // Send push notification to recipient (fire-and-forget)
      // Skip push for silent system messages (pin sync, reactions, etc.)
      const skipPushTypes = ['pin', 'reaction'];
      if (!skipPushTypes.includes(msg.type)) {
        try {
          const addrKey = address.toLowerCase();
          const sub = await redis('GET', `push:${addrKey}`);
          console.log('[push] addr:', addrKey.slice(0,14), 'sub_type:', typeof sub, 'has_sub:', !!sub, 'vapid_pub:', !!process.env.VAPID_PUBLIC_KEY, 'vapid_priv:', !!process.env.VAPID_PRIVATE_KEY);
          if (sub && process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY) {
            const webpush = await import('web-push').then(m => m.default || m);
            webpush.setVapidDetails('mailto:noreply@pmtchat.app',
              process.env.VAPID_PUBLIC_KEY, process.env.VAPID_PRIVATE_KEY);
            const subscription = typeof sub === 'string' ? JSON.parse(sub) : sub;
            console.log('[push] endpoint:', subscription?.endpoint?.slice(0,40));
            const senderName = msg.fromName || msg.senderName || (msg.from || '').slice(0,8) || 'PMT-Chat';
            const body = msg.type === 'voice' ? '🎵 Voice message'
              : msg.type === 'image' ? '🖼 Image'
              : msg.type === 'video' ? '🎬 Video'
              : msg.type === 'file' ? '📎 File'
              : (msg.text || 'New message').slice(0, 80);
            await webpush.sendNotification(subscription,
              JSON.stringify({ title: senderName, body, icon: '/icon-192.png', url: '/' })
            ).then(() => console.log('[push] sent OK'))
             .catch(async (e) => {
              console.warn('[push] FAILED:', e.statusCode, e.message?.slice(0,100));
              if (e.statusCode === 410 || e.statusCode === 404)
                await redis('DEL', `push:${addrKey}`);
            });
          }
        } catch (pushErr) { console.warn('[push] catch:', pushErr?.message?.slice(0,100)); }
      }

      return res.status(200).json({ ok: true });

    } else {
      res.status(405).end();
    }
  } catch (e) {
    console.error('[inbox]', e.message);
    if (req.method === 'GET') return res.status(200).json([]);
    return res.status(500).json({ error: e.message });
  }
}
