// @ts-nocheck
// Cloud backup — encrypt full account data

/**
 * Derive a deterministic backup password for Connect Wallet users.
 * Uses wallet address + username so it's unique per user and reproducible
 * on any device without requiring the user to enter anything.
 * Security: backup is also behind server auth (passwordHash check).
 */
export function deriveWalletBackupKey(address: string, username: string): string {
  return `pmt-wbk-v1:${address.toLowerCase()}:${username.toLowerCase().trim()}`;
}

// Cloud backup — encrypt full account data → store directly in Redis via /api/auth
// No Pinata/IPFS needed. Zero-knowledge: password never leaves device.

import { PMTAuth } from './auth';

// ── Encrypt/decrypt ───────────────────────────────────────────────────────────

async function encryptBackup(data: object, password: string, saltHex: string): Promise<string> {
  const enc = new TextEncoder();
  // Defensive: coerce to string in case a non-string sneaks in (e.g. from old account format)
  const toBytes = (h: any) => { const s = typeof h === 'string' ? h : String(h ?? ''); return new Uint8Array((s.match(/.{2}/g) ?? []).map((x: string) => parseInt(x, 16))); };
  if (typeof saltHex !== 'string') throw new Error('encryptBackup: saltHex must be string, got ' + typeof saltHex);
  const keyMat = await crypto.subtle.importKey('raw', enc.encode(password), { name: 'PBKDF2' }, false, ['deriveKey']);
  const key = await crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt: toBytes(saltHex), iterations: 150000, hash: 'SHA-256' },
    keyMat, { name: 'AES-GCM', length: 256 }, false, ['encrypt']
  );
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, enc.encode(JSON.stringify(data)));
  const toHex = (b: Uint8Array) => Array.from(b).map(x => x.toString(16).padStart(2, '0')).join('');
  return JSON.stringify({ v: 3, encrypted: toHex(new Uint8Array(encrypted)), iv: toHex(iv) });
}

async function decryptBackup(blob: string, password: string, saltHex: string): Promise<object> {
  const { encrypted, iv } = JSON.parse(blob);
  const enc = new TextEncoder();
  const toBytes = (h: any) => { const s = typeof h === 'string' ? h : String(h ?? ''); return new Uint8Array((s.match(/.{2}/g) ?? []).map((x: string) => parseInt(x, 16))); };
  if (typeof saltHex !== 'string') throw new Error('decryptBackup: saltHex must be string, got ' + typeof saltHex);
  if (typeof encrypted !== 'string') throw new Error('decryptBackup: encrypted must be string, got ' + typeof encrypted);
  if (typeof iv !== 'string') throw new Error('decryptBackup: iv must be string, got ' + typeof iv);
  const keyMat = await crypto.subtle.importKey('raw', enc.encode(password), { name: 'PBKDF2' }, false, ['deriveKey']);
  const key = await crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt: toBytes(saltHex), iterations: 150000, hash: 'SHA-256' },
    keyMat, { name: 'AES-GCM', length: 256 }, false, ['decrypt']
  );
  const dec = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: toBytes(iv) }, key, toBytes(encrypted));
  return JSON.parse(new TextDecoder().decode(dec));
}

// ── Public API ────────────────────────────────────────────────────────────────

export interface BackupData {
  wallet: { address: string; privateKey?: string; username?: string };
  contacts: object[];
  messages: Record<string, object[]>;
  profile: object;
}

// Compress a base64 image to a backup-safe thumbnail (256x256, JPEG ~15KB)
export async function compressAvatarForBackup(dataUrl: string): Promise<string | null> {
  if (!dataUrl) return null;
  if (!dataUrl.startsWith('data:')) return dataUrl; // already a URL
  return new Promise((resolve) => {
    try {
      const img = new Image();
      img.onload = () => {
        const SIZE = 256;
        const canvas = document.createElement('canvas');
        canvas.width = SIZE; canvas.height = SIZE;
        const ctx = canvas.getContext('2d');
        if (!ctx) { resolve(dataUrl); return; }
        const s = Math.min(img.width, img.height);
        const sx = (img.width - s) / 2;
        const sy = (img.height - s) / 2;
        ctx.drawImage(img, sx, sy, s, s, 0, 0, SIZE, SIZE);
        resolve(canvas.toDataURL('image/jpeg', 0.85));
      };
      img.onerror = () => resolve(null);
      img.src = dataUrl;
    } catch { resolve(null); }
  });
}

/**
 * Save encrypted backup directly to Redis via /api/auth.
 * No Pinata/IPFS required — works with zero external config.
 * Uses the stored passwordSalt so the hash is stable across saves.
 */
export async function saveCloudBackup(
  username: string,
  password: string,
  data: BackupData,
  oldPassword?: string   // for one-time migration re-key only
): Promise<void> {
  const uname = username.toLowerCase().trim();

  // Reuse existing salt so passwordHash stays consistent (lets server verify ownership).
  // Account may be stored under username key OR address key — check both.
  const byUsername = localStorage.getItem(`pmt_account_${uname}`);
  const byAddress = data.wallet.address
    ? localStorage.getItem(`pmt_account_${data.wallet.address.toLowerCase()}`)
    : null;
  const accountData = byUsername ? JSON.parse(byUsername) : byAddress ? JSON.parse(byAddress) : null;
  // Enforce string — old accounts may have stored salt as a Uint8Array-like object
  const rawSalt = accountData?.passwordSalt ?? accountData?.salt ?? null;
  const existingSalt = typeof rawSalt === 'string' ? rawSalt : null;

  // If no salt stored locally (Connect Wallet users have no passwordSalt in pmt_account_),
  // derive a deterministic salt from the password so passwordHash is always the same.
  // Random salt caused 403 on every backup update since server checks passwordHash consistency.
  let finalSalt = existingSalt;
  if (!finalSalt) {
    const hashBuf = await crypto.subtle.digest('SHA-256',
      new TextEncoder().encode('pmt-backup-salt-v1:' + password));
    finalSalt = Array.from(new Uint8Array(hashBuf)).map(x => x.toString(16).padStart(2,'0')).join('');
  }

  const { hash: passwordHash, salt } = await PMTAuth.hashPassword(password, finalSalt);

  // Save salt back to localStorage so we never need to re-derive
  if (accountData && !existingSalt) {
    const updated = { ...accountData, passwordSalt: finalSalt };
    localStorage.setItem(`pmt_account_${uname}`, JSON.stringify(updated));
    if (data.wallet.address) {
      localStorage.setItem(`pmt_account_${data.wallet.address.toLowerCase()}`, JSON.stringify(updated));
    }
  }

  // Encrypt the full backup with this salt
  const encryptedBackup = await encryptBackup(data, password, salt);

  // For migration: compute old password hash using old password + old salt from server
  let oldPasswordHash: string | undefined;
  if (oldPassword) {
    const srvRes = await fetch(`/api/auth?username=${encodeURIComponent(uname)}`);
    if (srvRes.ok) {
      const srvRec = await srvRes.json();
      const { hash: oldHash } = await PMTAuth.hashPassword(oldPassword, srvRec.salt);
      oldPasswordHash = oldHash;
    }
  }

  const res = await fetch('/api/auth', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      username: uname,
      passwordHash,
      salt,
      address: data.wallet.address,
      encryptedBackup,
      ...(oldPasswordHash ? { oldPasswordHash } : {}),
    }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || `Backup error: ${res.status}`);
  }
}

/**
 * Load and decrypt backup from Redis for cross-device login.
 * Returns null if user not found. Throws if password wrong.
 */
export async function loadCloudBackup(
  username: string,
  password: string
): Promise<BackupData | null> {
  const res = await fetch(`/api/auth?username=${encodeURIComponent(username.toLowerCase().trim())}`);
  if (res.status === 404) return null;
  if (!res.ok) return null;
  const record = await res.json();

  // Verify password before decrypting
  let ok = await PMTAuth.verifyPassword(password, record.passwordHash, record.salt);
  if (!ok) {
    // Fallback: try deterministic salt (for accounts saved with old random-salt code)
    const hashBuf = await crypto.subtle.digest('SHA-256',
      new TextEncoder().encode('pmt-backup-salt-v1:' + password));
    const detSalt = Array.from(new Uint8Array(hashBuf)).map((x:number) => x.toString(16).padStart(2,'0')).join('');
    ok = await PMTAuth.verifyPassword(password, record.passwordHash, detSalt);
  }
  if (!ok) throw new Error('WRONG_PASSWORD');

  if (!record.encryptedBackup) {
    // User is registered but backup was never saved (e.g. first login after migration).
    // Return a minimal record so they can log in — data will be empty but wallet address is known.
    throw new Error('NO_BACKUP');
  }

  const data = await decryptBackup(record.encryptedBackup, password, record.salt) as BackupData;
  // Attach the canonical salt so LoginScreen can persist it locally —
  // ensures future saveCloudBackup calls reuse the same salt → same passwordHash
  (data as any)._canonicalSalt = record.salt;
  (data as any)._passwordHash = record.passwordHash;
  return data;
}

/**
 * Check if a username is already registered.
 */
export async function checkUsernameAvailable(username: string): Promise<boolean> {
  const res = await fetch(`/api/auth?username=${encodeURIComponent(username.toLowerCase().trim())}`);
  return res.status === 404;
}
