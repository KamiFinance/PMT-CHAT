// IPFS proxy — fetches from Pinata, supports Range requests for video/audio
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

  const rangeHeader = req.headers['range'];

  const tryFetch = async (url, extraHeaders = {}) => {
    const headers = { 'User-Agent': 'PMTChat/1.0', ...extraHeaders };
    const pinataJwt = process.env.PINATA_JWT || process.env.VITE_PINATA_JWT;
    if (pinataJwt) headers['pinata_gateway_token'] = pinataJwt;
    if (rangeHeader) headers['Range'] = rangeHeader;
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 20000); // 20s for large video files
    try {
      const r = await fetch(url, { signal: ctrl.signal, headers });
      clearTimeout(t);
      return r;
    } catch(e) {
      clearTimeout(t);
      return null;
    }
  };

  const pipe = async (upstream) => {
    const ct  = upstream.headers.get('content-type')  || 'application/octet-stream';
    const cl  = upstream.headers.get('content-length');
    const cr  = upstream.headers.get('content-range');
    const ar  = upstream.headers.get('accept-ranges');
    res.setHeader('Content-Type', ct);
    res.setHeader('Accept-Ranges', ar || 'bytes');
    res.setHeader('Cache-Control', 'public, max-age=86400');
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
    // 1. Public Pinata gateway — fastest for public IPFS files (most files)
    {
      const r = await tryFetch(`https://gateway.pinata.cloud/ipfs/${cid}`);
      if (r && (r.ok || r.status === 206)) return await pipe(r);
    }

    // 2. ipfs.io public gateway — universal fallback
    {
      const r = await tryFetch(`https://ipfs.io/ipfs/${cid}`);
      if (r && (r.ok || r.status === 206)) return await pipe(r);
    }

    // 3. Cloudflare IPFS gateway
    {
      const r = await tryFetch(`https://cloudflare-ipfs.com/ipfs/${cid}`);
      if (r && (r.ok || r.status === 206)) return await pipe(r);
    }

    res.status(502).json({ error: 'Could not retrieve file' });
  } catch(e) {
    if (!res.headersSent) res.status(500).json({ error: e.message });
    else res.end();
  }
}
