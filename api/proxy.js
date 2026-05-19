// Server-side web proxy — strips X-Frame-Options so sites load in iframe
// GET /api/proxy?url=https://example.com
import { rateLimit, securityHeaders, isBlockedUrl } from './_security.js';

export default async function handler(req, res) {
  securityHeaders(res);
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') return res.status(200).end();

  // Rate limit proxy: 20 req/min (prevents use as anonymous web scraper)
  const rl = await rateLimit(req, 'proxy', 20, 60);
  if (!rl.allowed) return res.status(429).json({ error: 'Too many requests' });

  const rawUrl = req.query.url;
  if (!rawUrl) return res.status(400).send('url required');
  const url = /^https?:\/\//i.test(rawUrl) ? rawUrl : 'https://' + rawUrl;

  // SSRF protection: block internal/private addresses
  if (isBlockedUrl(url)) return res.status(403).json({ error: 'URL not allowed' });

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);
    const upstream = await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5',
      },
      redirect: 'follow',
    });
    clearTimeout(timeout);

    const contentType = upstream.headers.get('content-type') || 'text/html';

    // For non-HTML resources (images, CSS, JS), proxy as-is
    if (!contentType.includes('text/html')) {
      const buf = await upstream.arrayBuffer();
      res.setHeader('Content-Type', contentType);
      res.setHeader('Cache-Control', 'public, max-age=3600');
      return res.status(upstream.status).send(Buffer.from(buf));
    }

    let html = await upstream.text();
    const finalUrl = upstream.url || url;
    const origin = new URL(finalUrl).origin;
    const base = new URL(finalUrl).href.replace(/[^/]*$/, '');

    // Inject <base> tag so relative URLs resolve correctly
    const baseTag = `<base href="${finalUrl}">`;
    // Inject proxy interceptor to rewrite navigation inside the iframe
    const interceptScript = `
<script>
(function() {
  // Rewrite link clicks to go through proxy
  document.addEventListener('click', function(e) {
    var el = e.target.closest('a');
    if (!el) return;
    var href = el.getAttribute('href');
    if (!href || href.startsWith('#') || href.startsWith('javascript')) return;
    e.preventDefault();
    var abs = new URL(href, document.baseURI).href;
    window.parent.postMessage({type:'proxy-navigate', url: abs}, '*');
  }, true);
  // Notify parent of page title
  window.addEventListener('load', function() {
    window.parent.postMessage({type:'proxy-title', title: document.title}, '*');
  });
})();
</script>`;

    // Inject base tag and script into <head>
    if (/<head[^>]*>/i.test(html)) {
      html = html.replace(/<head[^>]*>/i, (m) => m + baseTag + interceptScript);
    } else {
      html = baseTag + interceptScript + html;
    }

    // Strip frame-busting JS patterns
    html = html
      .replace(/if\s*\(\s*(?:window\.top|top|window\.parent|parent)\s*[!=]=+\s*(?:window(?:\.self)?|self)\s*\)/gi, 'if(false)')
      .replace(/(?:window\.top|top)\s*\.location(?:\.href)?\s*=\s*/gi, 'void/*blocked*/');

    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('X-Frame-Options', 'ALLOWALL');
    res.setHeader('Cache-Control', 'no-store');
    res.status(200).send(html);
  } catch (e) {
    res.status(502).send(`<html><body style="font-family:sans-serif;padding:20px;background:#0a0c14;color:#ccc">
      <h3 style="color:#f87171">Could not load page</h3>
      <p>${e.message}</p>
      <p><a href="${url}" target="_blank" style="color:#7dd3fc">Open in external browser →</a></p>
    </body></html>`);
  }
}
