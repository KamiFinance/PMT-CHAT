// IPFS proxy — streams files from Pinata, supports Range requests for video
// GET /api/ipfs?cid=bafkrei...

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Range, Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const cid = req.query.cid;
  if (!cid || !/^[a-zA-Z0-9+/=_-]{10,}$/.test(cid)) {
    return res.status(400).json({ error: 'Invalid CID' });
  }

  const jwt    = process.env.PINATA_JWT;
  const apiKey = process.env.PINATA_API_KEY;
  const secret = process.env.PINATA_SECRET_KEY;
  const gatewayDomain = process.env.PINATA_GATEWAY_DOMAIN || 'gateway.pinata.cloud';

  const rangeHeader = req.headers['range'];

  const tryFetch = async (url, extraHeaders = {}) => {
    const headers = { 'User-Agent': 'PMTChat/1.0', ...extraHeaders };
    if (rangeHeader) headers['Range'] = rangeHeader;
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 30000);
    try {
      const r = await fetch(url, { signal: ctrl.signal, headers });
      clearTimeout(t);
      return r;
    } catch(e) { clearTimeout(t); throw e; }
  };

  const pipe = async (upstream) => {
    const ct  = upstream.headers.get('content-type')  || 'application/octet-stream';
    const cl  = upstream.headers.get('content-length');
    const cr  = upstream.headers.get('content-range');
    const ar  = upstream.headers.get('accept-ranges');
    res.setHeader('Content-Type', ct);
    res.setHeader('Accept-Ranges', ar || 'bytes');
    res.setHeader('Cache-Control', 'private, max-age=3600');
    if (cl) res.setHeader('Content-Length', cl);
    if (cr) res.setHeader('Content-Range', cr);
    res.status(upstream.status);
    const reader = upstream.body.getReader();
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      res.write(Buffer.from(value));
    }
    res.end();
  };

  try {
    const url = `https://${gatewayDomain}/ipfs/${cid}`;

    // 1. Try with API Key+Secret headers (most reliable for public files)
    if (apiKey && secret) {
      const r = await tryFetch(url, { pinata_api_key: apiKey, pinata_secret_api_key: secret }).catch(() => null);
      if (r && (r.ok || r.status === 206)) return await pipe(r);
    }

    // 2. Try with JWT (if it looks valid)
    if (jwt && jwt.startsWith('eyJ') && jwt.length > 100) {
      const r = await tryFetch(url, { Authorization: `Bearer ${jwt}` }).catch(() => null);
      if (r && (r.ok || r.status === 206)) return await pipe(r);
    }

    // 3. Public Pinata gateway, no auth (works for all public IPFS files)
    {
      const r = await tryFetch(`https://gateway.pinata.cloud/ipfs/${cid}`).catch(() => null);
      if (r && (r.ok || r.status === 206)) return await pipe(r);
    }

    // 4. ipfs.io fallback
    {
      const r = await tryFetch(`https://ipfs.io/ipfs/${cid}`).catch(() => null);
      if (r && (r.ok || r.status === 206)) return await pipe(r);
    }

    res.status(502).json({ error: 'Could not retrieve file' });
  } catch(e) {
    if (!res.headersSent) res.status(500).json({ error: e.message });
    else res.end();
  }
}
