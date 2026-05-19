// User registry: username → { passwordHash, salt, address, encryptedBackup }
import { redis, securityHeaders, rateLimit } from './_security.js';

function cors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

export default async function handler(req, res) {
  cors(res);
  securityHeaders(res);
  if (req.method === 'OPTIONS') { res.status(200).end(); return; }

  // Rate limit: 30 req/min per IP
  const rl = await rateLimit(req, 'auth', 30, 60);
  if (!rl.allowed) {
    res.status(429).json({ error: 'Too many requests' }); return;
  }

  try {
    // GET /api/auth?username=xxx — fetch record
    if (req.method === 'GET') {
      const urlObj = new URL(req.url, `http://${req.headers.host}`);
      const username = (urlObj.searchParams.get('username') || '').toLowerCase().trim();
      const address = (urlObj.searchParams.get('address') || '').toLowerCase().trim();

      if (address) {
        const uname = await redis('GET', `pmt:addr:${address}`);
        if (!uname) { res.status(404).json({ error: 'No account found for this address' }); return; }
        const raw2 = await redis('GET', `pmt:user:${uname}`);
        if (!raw2) { res.status(404).json({ error: 'Account not found' }); return; }
        const rec = JSON.parse(raw2);
        return res.status(200).json({ username: uname, address: rec.address, hasBackup: !!rec.encryptedBackup }); // passwordHash intentionally excluded
      }
      if (!username) { res.status(400).json({ error: 'username required' }); return; }
      const raw = await redis('GET', `pmt:user:${username}`);
      if (!raw) { res.status(404).json({ error: 'User not found' }); return; }
      const rec2 = JSON.parse(raw);
      // SECURITY: never return passwordHash to client — prevents offline cracking
      const { passwordHash: _ph, ...safeRec } = rec2;
      return res.status(200).json(safeRec);
    }

    // POST /api/auth — create or update account + backup
    if (req.method === 'POST') {
      let body = '';
      await new Promise(resolve => { req.on('data', c => body += c); req.on('end', resolve); });
      const { username, passwordHash, salt, address, encryptedBackup, cid, oldPasswordHash } = JSON.parse(body);
      if (!username || !passwordHash || !salt || !address) {
        res.status(400).json({ error: 'Missing required fields' }); return;
      }
      const key = `pmt:user:${username.toLowerCase().trim()}`;
      const existing = await redis('GET', key);
      if (existing) {
        const prev = JSON.parse(existing);
        if (oldPasswordHash) {
          // Migration re-key: verify old password, allow changing to new passwordHash
          // This lets users migrate from user-set password to derived key
          if (prev.passwordHash !== oldPasswordHash) {
            res.status(403).json({ error: 'Old password verification failed' }); return;
          }
          // Allow the re-key — fall through to save
        } else {
          // Normal save: passwordHash must match existing
          if (prev.passwordHash !== passwordHash) {
            res.status(403).json({ error: 'Username already taken' }); return;
          }
        }
      }
      const record = {
        username: username.toLowerCase().trim(),
        passwordHash,
        salt,
        address,
        ...(encryptedBackup ? { encryptedBackup } : {}),
        ...(cid ? { cid } : {}),
        updated: Date.now(),
      };
      await redis('SET', key, JSON.stringify(record));
      if (address) await redis('SET', `pmt:addr:${address.toLowerCase()}`, username.toLowerCase().trim());
      return res.status(200).json({ ok: true });
    }

    res.status(405).end();
  } catch (e) {
    console.error('[auth]', e.message);
    res.status(500).json({ error: e.message });
  }
}
