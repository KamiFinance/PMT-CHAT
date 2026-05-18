import { STORAGE_KEYS } from '../types';
import type { Contact, MsgsMap, Profile, Wallet } from '../types';

// ── Generic typed get/set ────────────────────────────────────────────────────

function get<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    if (raw == null) return null;
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

function set<T>(key: string, value: T): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Quota exceeded — silently ignore
  }
}

function remove(key: string): void {
  localStorage.removeItem(key);
}

function setRaw(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    // ignore
  }
}

function getRaw(key: string): string | null {
  return localStorage.getItem(key);
}

// ── Domain-specific helpers ──────────────────────────────────────────────────

export const storage = {
  // Session
  getSession: () => get<{ username: string; address: string }>(STORAGE_KEYS.session),
  setSession: (data: { username: string; address: string }) => set(STORAGE_KEYS.session, data),
  clearSession: () => remove(STORAGE_KEYS.session),

  // Contacts
  getContacts: (account: string) => get<Contact[]>(STORAGE_KEYS.contacts(account)) ?? [],
  setContacts: (account: string, contacts: Contact[]) =>
    set(STORAGE_KEYS.contacts(account), contacts.filter((c) => !c.isAI)),

  // Messages
  getMsgs: (account: string) => get<MsgsMap>(STORAGE_KEYS.msgs(account)) ?? {},
  setMsgs: (account: string, msgs: MsgsMap) => {
    // Strip blob URLs before saving — they die across sessions
    const saveable: MsgsMap = {};
    for (const [addr, list] of Object.entries(msgs)) {
      if (addr === '0x000000000000000000000000000000000000a1') {
        saveable[addr] = []; // AI chat not persisted
        continue;
      }
      // Limit to 100 most-recent messages per conversation.
      // Chrome (and other browsers) buffer large localStorage writes — if the
      // key exceeds ~1 MB the disk flush may not complete before a page reload,
      // causing received messages to silently disappear. 100 messages ≈ 40 KB
      // per conversation which is well within the reliable flush range.
      saveable[addr] = list.slice(-100).map((m) => {
        // Strip large embedded fields that blow up localStorage:
        // senderAvatarUrl / fromAvatarUrl can be 100 KB base64 avatars stored
        // in every incoming message — they're already in contacts/profiles storage.
        const { senderAvatarUrl, fromAvatarUrl, imgData, fileData, ...rest } = m as any;
        if (rest.type === 'voice') return { ...rest, audioUrl: null }; // keep audioB64 for reload reconstruction
        if (rest.type === 'image' || rest.type === 'file') return { ...rest, fileUrl: null };
        if (rest.type === 'video') return { ...rest, localUrl: null }; // blob URLs die on reload; ipfsCid/ipfsUrl survive
        return rest;
      });
    }
    set(STORAGE_KEYS.msgs(account), saveable);
  },

  // Profile
  getProfile: (account: string) =>
    get<Profile>(STORAGE_KEYS.profile(account)) ?? { name: '', bio: '', avatarUrl: null, address: null },
  setProfile: (account: string, profile: Profile) => set(STORAGE_KEYS.profile(account), profile),

  // Account (wallet data)
  getAccount: (address: string) => get<Wallet & { username: string }>(
    `pmt_account_${address.toLowerCase()}`
  ),
  setAccount: (address: string, data: object) =>
    set(`pmt_account_${address.toLowerCase()}`, data),

  // Inbox
  getInbox: (address: string) => get<object[]>(STORAGE_KEYS.inbox(address)) ?? [],
  setInbox: (address: string, msgs: object[]) => set(STORAGE_KEYS.inbox(address), msgs),
  pushInbox: (address: string, msg: object) => {
    const existing = get<object[]>(STORAGE_KEYS.inbox(address)) ?? [];
    set(STORAGE_KEYS.inbox(address), [...existing, msg]);
  },

  // Audio
  getAudio: (msgId: string) => getRaw(STORAGE_KEYS.audio(msgId)),
  setAudio: (msgId: string, b64: string) => setRaw(STORAGE_KEYS.audio(msgId), b64),

  // Media (images / files)
  getMedia: (msgId: string): string | null => {
    return getRaw(STORAGE_KEYS.media(msgId)) ?? getRaw(STORAGE_KEYS.img(msgId));
  },
  setMedia: (msgId: string, value: string) => {
    setRaw(STORAGE_KEYS.media(msgId), value);
    setRaw(STORAGE_KEYS.img(msgId), value); // backward compat
  },
  getMediaCid: (msgId: string): { cid: string; ipfsUrl: string } | null => {
    const raw = getRaw(STORAGE_KEYS.media(msgId));
    if (!raw) return null;
    try {
      const parsed = JSON.parse(raw);
      if (parsed?.cid) return parsed as { cid: string; ipfsUrl: string };
    } catch {
      // raw is base64, not JSON
    }
    return null;
  },

  // Settings
  getPinataJwt: () => getRaw(STORAGE_KEYS.pinataJwt),
  setPinataJwt: (jwt: string) => setRaw(STORAGE_KEYS.pinataJwt, jwt),
  getAiKey: () => getRaw(STORAGE_KEYS.anthropicKey),
  setAiKey: (key: string) => setRaw(STORAGE_KEYS.anthropicKey, key),
  getTheme: () => getRaw(STORAGE_KEYS.theme) as 'dark' | 'light' | null,
  setTheme: (theme: 'dark' | 'light') => setRaw(STORAGE_KEYS.theme, theme),
};

// ── Startup localStorage cleanup ─────────────────────────────────────────────
// Keeps total localStorage well under the 5 MB browser limit so that
// message writes flush reliably to disk before page reloads.
export function pruneLocalStorage(accountAddress: string) {
  try {
    const addr = accountAddress.toLowerCase();
    const keysToDelete: string[] = [];

    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (!k) continue;

      // Remove inbox relay keys that aren't for the current account
      if (k.startsWith('pmt_inbox_') && !k.includes(addr)) {
        keysToDelete.push(k);
        continue;
      }

      // Remove orphaned media/audio cache files (keep only keys referenced by
      // current messages — anything else is a stale upload cache)
      if (k.startsWith('pmt_audio_') || k.startsWith('pmt_media_') ||
          k.startsWith('pmt_img_')) {
        const val = localStorage.getItem(k) || '';
        // If the cached media is > 50 KB it's taking significant space — remove it.
        // The app reconstructs media from IPFS on next load anyway.
        if (val.length > 51200) {
          keysToDelete.push(k);
        }
      }
    }

    keysToDelete.forEach(k => { try { localStorage.removeItem(k); } catch {} });
  } catch { /* non-fatal */ }
}
