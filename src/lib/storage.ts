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
      saveable[addr] = list.map((m) => {
        if (m.type === 'voice') return { ...m, audioUrl: null }; // keep audioB64 for reload reconstruction
        if (m.type === 'image' || m.type === 'file') return { ...m, fileUrl: null };
        if (m.type === 'video') return { ...m, localUrl: null }; // blob URLs die on reload; ipfsCid/ipfsUrl survive
        return m;
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
