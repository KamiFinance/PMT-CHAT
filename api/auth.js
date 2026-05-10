// User registry: username → { passwordHash, salt, address, encryptedBackup }
// Pure fetch REST — no ioredis, no TCP connections
// encryptedBackup stored directly in Redis (no Pinata/IPFS needed)

function cors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

async function redis(cmd, ...args) {
  const url = process.env.UPSTASH_KV_REST_API_URL
    || process.env.KV_REST_API_URL
    || process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_KV_REST_API_TOKEN
    || process.env.KV_REST_API_TOKEN
    || process.env.UPSTASH_REDIS_REST_TOKEN;

  if (!url || !token) throw new Error('No Redis REST credentials found');

  // Use POST body instead of URL path — avoids 431 "URL too long" for large values
  // Upstash REST API accepts: POST / with body [cmd, ...args]
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify([cmd, ...args]),
  });
  if (!res.ok) throw new Error(`Redis HTTP ${res.status}`);
  const data = await res.json();
  return data.result;
}

export default async function handler(req, res) {
  cors(res);
  if (req.method === 'OPTIONS') { res.status(200).end(); return; }

  try {
    // GET /api/auth?username=xxx — fetch record (for login / username check)
    if (req.method === 'GET') {
      const urlObj = new URL(req.url, `http://${req.headers.host}`);
      const username = (urlObj.searchParams.get('username') || '').toLowerCase().trim();
      const address = (urlObj.searchParams.get('address') || '').toLowerCase().trim();
      // Address lookup: find which account owns this wallet address
      if (address) {
        const uname = await redis('GET', `pmt:addr:${address}`);
        if (!uname) { res.status(404).json({ error: 'No account found for this address' }); return; }
        const raw2 = await redis('GET', `pmt:user:${uname}`);
        if (!raw2) { res.status(404).json({ error: 'Account not found' }); return; }
        const rec = JSON.parse(raw2);
        return res.status(200).json({ username: uname, address: rec.address, hasBackup: !!rec.encryptedBackup });
      }
      if (!username) { res.status(400).json({ error: 'username required' }); return; }
      const raw = await redis('GET', `pmt:user:${username}`);
      if (!raw) { res.status(404).json({ error: 'User not found' }); return; }
      return res.status(200).json(JSON.parse(raw));
    }

    // POST /api/auth — create or update account + backup
    if (req.method === 'POST') {
      let body = '';
      await new Promise(resolve => { req.on('data', c => body += c); req.on('end', resolve); });
      const { username, passwordHash, salt, address, encryptedBackup, cid } = JSON.parse(body);
      if (!username || !passwordHash || !salt || !address) {
        res.status(400).json({ error: 'Missing required fields' }); return;
      }
      const key = `pmt:user:${username.toLowerCase().trim()}`;
      const existing = await redis('GET', key);
      if (existing) {
        const prev = JSON.parse(existing);
        // Allow update only if passwordHash matches (owner verification)
        // Salt is fixed per account so hash is stable
        if (prev.passwordHash !== passwordHash) {
          res.status(403).json({ error: 'Username already taken' }); return;
        }
      }
      const record = {
        username: username.toLowerCase().trim(),
        passwordHash,
        salt,
        address,
        // Store encrypted backup inline (replaces IPFS CID approach)
        ...(encryptedBackup ? { encryptedBackup } : {}),
        // Keep cid for backward compat if present
        ...(cid ? { cid } : {}),
        updated: Date.now(),
      };
      await redis('SET', key, JSON.stringify(record));
      // Store address->username reverse lookup for wallet import detection
      if (address) await redis('SET', `pmt:addr:${address.toLowerCase()}`, username.toLowerCase().trim());
      return res.status(200).json({ ok: true });
    }

    res.status(405).end();
  } catch (e) {
    console.error('[auth]', e.message);
    res.status(500).json({ error: e.message });
  }
}
