// Pinata file upload — tries API Key+Secret (v1, reliable) then JWT fallback
// POST /api/pinata-upload  { data: base64, name, mimeType }

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).end();

  const apiKey = process.env.PINATA_API_KEY;
  const secret = process.env.PINATA_SECRET_KEY;
  const jwt    = process.env.PINATA_JWT;

  try {
    const { data: base64Data, name, mimeType } = req.body || {};
    if (!base64Data) return res.status(400).json({ error: 'data required' });

    const binary   = Buffer.from(base64Data, 'base64');
    const filename = name || 'file';
    const boundary = '----PMTBoundary' + Date.now();

    const header = Buffer.from(
      `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${filename}"\r\nContent-Type: ${mimeType || 'application/octet-stream'}\r\n\r\n`,
      'utf8'
    );
    const footer = Buffer.from(
      `\r\n--${boundary}\r\nContent-Disposition: form-data; name="pinataMetadata"\r\n\r\n${JSON.stringify({ name: filename })}\r\n--${boundary}\r\nContent-Disposition: form-data; name="pinataOptions"\r\n\r\n${JSON.stringify({ cidVersion: 1 })}\r\n--${boundary}--\r\n`,
      'utf8'
    );
    const body = Buffer.concat([header, binary, footer]);

    // Auth: prefer API Key+Secret (more reliable), fall back to JWT
    const authHeaders = (apiKey && secret)
      ? { pinata_api_key: apiKey, pinata_secret_api_key: secret }
      : { Authorization: `Bearer ${jwt}` };

    const upstream = await fetch('https://api.pinata.cloud/pinning/pinFileToIPFS', {
      method: 'POST',
      headers: { ...authHeaders, 'Content-Type': `multipart/form-data; boundary=${boundary}` },
      body,
    });

    const result = await upstream.json();
    if (!upstream.ok) {
      console.error('Pinata upload error:', JSON.stringify(result).slice(0, 200));
      return res.status(upstream.status).json({ error: result?.error?.details || result?.error || 'Pinata error' });
    }

    const cid = result.IpfsHash;
    return res.json({ cid, url: `/api/ipfs?cid=${cid}` });
  } catch (e) {
    console.error('pinata-upload error:', e.message);
    res.status(500).json({ error: e.message });
  }
}
