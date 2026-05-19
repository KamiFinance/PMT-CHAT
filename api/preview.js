// Fetch Open Graph / meta tags for link preview
// GET /api/preview?url=https://example.com
import { rateLimit, securityHeaders, isBlockedUrl } from './_security.js';

export default async function handler(req, res) {
  securityHeaders(res);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const rl = await rateLimit(req, 'preview', 20, 60);
  if (!rl.allowed) return res.status(429).json({ error: 'Too many requests' });

  const rawUrl = req.query.url;
  if (!rawUrl) return res.status(400).json({ error: 'url required' });

  // Ensure URL has protocol
  const url = /^https?:\/\//i.test(rawUrl) ? rawUrl : 'https://' + rawUrl;

  // SSRF protection: block internal/private addresses
  if (isBlockedUrl(url)) return res.status(403).json({ error: 'URL not allowed' });

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);
    const r = await fetch(url, {
      signal: controller.signal,
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; PMTChat/1.0; +https://pmt-chat3.vercel.app)' },
    });
    clearTimeout(timeout);

    const contentType = r.headers.get('content-type') || '';
    if (!contentType.includes('text/html')) {
      // Non-HTML (image, PDF, etc.) — return basic info
      const urlObj = new URL(url);
      return res.json({ url, domain: urlObj.hostname, title: urlObj.pathname || url, description: '', image: '' });
    }

    const html = await r.text();
    const urlObj = new URL(url);
    const domain = urlObj.hostname.replace('www.', '');

    const get = (pattern) => { const m = html.match(pattern); return m ? m[1].trim() : ''; };
    const decode = (s) => s.replace(/&amp;/g,'&').replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&quot;/g,'"').replace(/&#39;/g,"'").replace(/&#x27;/g,"'").replace(/&#039;/g,"'").replace(/&nbsp;/g,' ').replace(/&apos;/g,"'");

    const ogTitle = decode(get(/<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/i) || get(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:title["']/i));
    const ogDesc  = decode(get(/<meta[^>]+property=["']og:description["'][^>]+content=["']([^"']+)["']/i) || get(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:description["']/i));
    const ogImg   = get(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i) || get(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["']/i);
    const tTitle  = decode(get(/<title[^>]*>([^<]{1,200})<\/title>/i));
    const metaDesc= decode(get(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)["']/i) || get(/<meta[^>]+content=["']([^"']+)["'][^>]+name=["']description["']/i));
    const favicon = get(/<link[^>]+rel=["'][^"']*icon[^"']*["'][^>]+href=["']([^"']+)["']/i);

    const title = (ogTitle || tTitle || domain).slice(0, 120);
    const description = (ogDesc || metaDesc || '').slice(0, 200);
    const image = ogImg ? (ogImg.startsWith('http') ? ogImg : urlObj.origin + (ogImg.startsWith('/') ? ogImg : '/' + ogImg)) : '';
    const faviconUrl = favicon ? (favicon.startsWith('http') ? favicon : urlObj.origin + (favicon.startsWith('/') ? favicon : '/' + favicon)) : `https://www.google.com/s2/favicons?domain=${domain}&sz=32`;

    return res.json({ url, domain, title, description, image, favicon: faviconUrl });
  } catch (e) {
    const urlObj = new URL(url.startsWith('http') ? url : 'https://' + url);
    return res.json({ url, domain: urlObj.hostname.replace('www.',''), title: urlObj.hostname, description: '', image: '', favicon: `https://www.google.com/s2/favicons?domain=${urlObj.hostname}&sz=32`, error: e.message });
  }
}
