// Admin dashboard API — returns all registered users from Redis.
// Protected by X-Admin-Key header (set ADMIN_SECRET as Vercel env var).
// Rate limited to 5 attempts/minute per IP to prevent brute force.

import { redis, securityHeaders, rateLimit } from './_security.js';

export default async function handler(req, res) {
  securityHeaders(res);
  res.setHeader('Access-Control-Allow-Origin', 'self'); // admin only — no cross-origin
  if (req.method === 'OPTIONS') { res.status(200).end(); return; }

  // Rate limit: 5 requests/min per IP (prevents brute force on key)
  const rl = await rateLimit(req, 'admin', 5, 60);
  if (!rl.allowed) {
    res.status(429).json({ error: 'Too many requests. Try again later.' });
    return;
  }

  // Auth check — constant-time comparison to prevent timing attacks
  const secret = process.env.ADMIN_SECRET || '';
  const provided = req.headers['x-admin-key'] || '';
  if (!secret || provided.length !== secret.length || !timingSafeEqual(provided, secret)) {
    // Track failed attempts separately (stricter limit)
    await rateLimit(req, 'admin_fail', 3, 300); // 3 failures per 5 min
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  try {
    let cursor = '0';
    const allKeys = [];
    do {
      const result = await redis('SCAN', cursor, 'MATCH', 'pmt:user:*', 'COUNT', '100');
      cursor = result[0];
      allKeys.push(...result[1]);
    } while (cursor !== '0');

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
    res.status(500).json({ error: 'Internal error' }); // don't leak error details
  }
}

// Constant-time string comparison (prevents timing attacks)
function timingSafeEqual(a, b) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
