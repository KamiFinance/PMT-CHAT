export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).end();

  const jwt = process.env.PINATA_JWT;
  if (!jwt) return res.status(500).json({ error: 'PINATA_JWT not configured' });

  try {
    const { data: base64Data, name, mimeType } = req.body || {};
    if (!base64Data) return res.status(400).json({ error: 'data required' });

    // Convert base64 to binary
    const binary = Buffer.from(base64Data, 'base64');

    // Build multipart form
    const boundary = '----PMTBoundary' + Date.now();
    const filename = name || 'file';

    const header = [
      `--${boundary}`,
      `Content-Disposition: form-data; name="file"; filename="${filename}"`,
      `Content-Type: ${mimeType || 'application/octet-stream'}`,
      '',
    ].join('\r\n') + '\r\n';

    const middle = [
      '',
      `--${boundary}`,
      'Content-Disposition: form-data; name="pinataMetadata"',
      '',
      JSON.stringify({ name: filename }),
      `--${boundary}--`,
      '',
    ].join('\r\n');

    const body = Buffer.concat([
      Buffer.from(header, 'utf8'),
      binary,
      Buffer.from(middle, 'utf8'),
    ]);

    const upstream = await fetch('https://api.pinata.cloud/pinning/pinFileToIPFS', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${jwt}`,
        'Content-Type': `multipart/form-data; boundary=${boundary}`,
      },
      body,
    });

    const result = await upstream.json();
    if (!upstream.ok) {
      console.error('Pinata error:', result);
      return res.status(upstream.status).json({ error: result?.error?.details || result?.error || 'Pinata error' });
    }

    const cid = result.IpfsHash;
    return res.json({ cid, url: `https://gateway.pinata.cloud/ipfs/${cid}` });
  } catch (e) {
    console.error('pinata-upload error:', e);
    res.status(500).json({ error: e.message });
  }
}
