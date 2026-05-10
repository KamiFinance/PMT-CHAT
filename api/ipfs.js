// Private IPFS proxy — fetches files from Pinata using server-side JWT
// GET /api/ipfs?cid=bafkrei...
// This lets Pinata files stay private while clients can still access them

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const cid = req.query.cid;
  if (!cid || !/^[a-zA-Z0-9]{46,}$/.test(cid)) {
    return res.status(400).json({ error: 'Invalid CID' });
  }

  const jwt = process.env.PINATA_JWT;
  if (!jwt) return res.status(500).json({ error: 'PINATA_JWT not configured' });

  // Try Pinata dedicated gateway first, then public fallback
  const gatewayDomain = process.env.PINATA_GATEWAY_DOMAIN || 'gateway.pinata.cloud';
  const url = `https://${gatewayDomain}/ipfs/${cid}`;

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);
    const upstream = await fetch(url, {
      signal: controller.signal,
      headers: {
        Authorization: `Bearer ${jwt}`,
        'User-Agent': 'PMTChat/1.0',
      },
    });
    clearTimeout(timeout);

    if (!upstream.ok) {
      return res.status(upstream.status).json({ error: `Pinata: ${upstream.status}` });
    }

    const contentType = upstream.headers.get('content-type') || 'application/octet-stream';
    const buf = await upstream.arrayBuffer();

    res.setHeader('Content-Type', contentType);
    res.setHeader('Cache-Control', 'public, max-age=86400'); // 24h cache
    res.setHeader('Content-Length', buf.byteLength);
    return res.status(200).send(Buffer.from(buf));
  } catch (e) {
    return res.status(502).json({ error: e.message });
  }
}
