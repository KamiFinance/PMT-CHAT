// Shared security utilities for all API endpoints

// Redis helper (shared across files)
export async function redis(cmd, ...args) {
  const url   = process.env.UPSTASH_KV_REST_API_URL  || process.env.KV_REST_API_URL  || process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_KV_REST_API_TOKEN || process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) throw new Error('Redis env vars not set');
  const r = await fetch(url, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify([cmd, ...args]),
  });
  if (!r.ok) throw new Error(`Redis HTTP ${r.status}`);
  return (await r.json()).result;
}

// Security headers applied to every response
export function securityHeaders(res) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
}

// Rate limiter: max `limit` requests per `windowSecs` per IP
// Returns { allowed: bool, remaining: number }
export async function rateLimit(req, key, limit = 20, windowSecs = 60) {
  const ip = req.headers['x-forwarded-for']?.split(',')[0]?.trim()
    || req.headers['x-real-ip']
    || 'unknown';
  const rKey = `pmt:rl:${key}:${ip}`;
  try {
    const count = await redis('INCR', rKey);
    if (count === 1) await redis('EXPIRE', rKey, windowSecs);
    return { allowed: count <= limit, remaining: Math.max(0, limit - count), ip };
  } catch {
    return { allowed: true, remaining: limit, ip }; // fail open if Redis down
  }
}
