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

// SSRF protection — block private/internal IP ranges and cloud metadata endpoints
export function isBlockedUrl(rawUrl) {
  let url;
  try { url = new URL(rawUrl); } catch { return true; } // invalid URL → block

  const hostname = url.hostname.toLowerCase();

  // Block non-HTTP protocols
  if (!['http:', 'https:'].includes(url.protocol)) return true;

  // Block localhost and loopback
  if (['localhost', '127.0.0.1', '::1', '0.0.0.0'].includes(hostname)) return true;

  // Block cloud metadata endpoints (AWS, GCP, Azure, DigitalOcean)
  if (['169.254.169.254', 'metadata.google.internal', '168.63.129.16',
       '100.100.100.200', 'fd00:ec2::254'].includes(hostname)) return true;
  if (hostname.endsWith('.internal') || hostname.endsWith('.local')) return true;

  // Block private IP ranges
  const ipv4 = hostname.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (ipv4) {
    const [, a, b] = ipv4.map(Number);
    if (a === 10) return true;                       // 10.0.0.0/8
    if (a === 172 && b >= 16 && b <= 31) return true; // 172.16.0.0/12
    if (a === 192 && b === 168) return true;          // 192.168.0.0/16
    if (a === 127) return true;                       // loopback
    if (a === 169 && b === 254) return true;          // link-local
    if (a === 0) return true;                         // this network
    if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT
  }

  return false;
}

