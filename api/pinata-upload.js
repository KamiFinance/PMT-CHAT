// Server-side Pinata upload proxy — JWT stays on server, never in client bundle
// POST /api/pinata-upload (multipart/form-data with 'file', 'name' fields)

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).end();

  const jwt = process.env.PINATA_JWT;
  if (!jwt) return res.status(500).json({ error: 'PINATA_JWT not configured' });

  try {
    // Read raw body and forward to Pinata (preserve multipart)
    const chunks = [];
    await new Promise((resolve, reject) => {
      req.on('data', c => chunks.push(c));
      req.on('end', resolve);
      req.on('error', reject);
    });
    const body = Buffer.concat(chunks);
    const contentType = req.headers['content-type'] || '';

    const upstream = await fetch('https://api.pinata.cloud/pinning/pinFileToIPFS', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${jwt}`,
        'Content-Type': contentType,
        'Content-Length': body.length,
      },
      body,
    });

    const data = await upstream.json();
    if (!upstream.ok) return res.status(upstream.status).json(data);
    return res.status(200).json({ IpfsHash: data.IpfsHash });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
