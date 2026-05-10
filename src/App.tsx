// @ts-nocheck
import React, { useState, useEffect, useRef, useCallback } from 'react';
import type { Wallet, Profile, Contact, MsgsMap, Message, Screen } from './types';
import { STORAGE_KEYS } from './types';
import { storage } from './lib/storage';
import { AppContext } from './lib/context';
import { now, rndHash, uid, normalizeAddress, shortHash, nextBlock, b64ToObjectUrl } from './lib/utils';

function playNotifSound() {
  try {
    const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.connect(g); g.connect(ctx.destination);
    o.frequency.setValueAtTime(880, ctx.currentTime);
    o.frequency.exponentialRampToValueAtTime(1100, ctx.currentTime + 0.08);
    g.gain.setValueAtTime(0.3, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.4);
    o.start(ctx.currentTime); o.stop(ctx.currentTime + 0.4);
  } catch { /* ignore */ }
}
import { uploadToPinata, getIpfsUrl } from './lib/pinata';
import { saveCloudBackup } from './lib/cloudBackup';
import { ethers } from 'ethers';

import { getWCProvider, resetWCProvider } from './lib/walletconnect';
import { hashMessage, broadcastMessage } from './lib/pmtchain';
import { useInboxPoll } from './hooks/useInboxPoll';
import { AI_AGENT_ADDRESS, AI_AGENT_CONTACT } from './constants/ai';

// ── Chat error boundary ────────────────────────────────────────────────────
class ChatErrorBoundary extends React.Component<
  {children: React.ReactNode; onReset: () => void},
  {error: Error | null}
> {
  state = { error: null };
  static getDerivedStateFromError(e: Error) { return { error: e }; }
  componentDidCatch(e: Error) { console.error('[ChatPanel error]', e); }
  render() {
    if (this.state.error) {
      return (
        <div style={{flex:1,display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',
          gap:12,padding:32,background:'var(--bg)'}}>
          <div style={{fontSize:32}}>⚠️</div>
          <div style={{fontSize:15,fontWeight:600,color:'var(--danger)'}}>Chat Error</div>
          <div style={{fontSize:12,color:'var(--muted)',fontFamily:'var(--mono)',
            background:'var(--surface)',padding:'8px 14px',borderRadius:8,maxWidth:300,wordBreak:'break-all'}}>
            {(this.state.error as Error).message}
          </div>
          <button onClick={() => { this.setState({error:null}); this.props.onReset(); }}
            style={{padding:'9px 24px',background:'var(--accent)',border:'none',borderRadius:9,
              color:'#000',fontWeight:600,cursor:'pointer',fontSize:13}}>
            Back to contacts
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
import { DEMO_CONTACTS, buildInitMsgs } from './constants/demo';
import { DEFAULT_AI_KEY, AI_MODEL } from './constants/keys';
import Landing from './components/screens/Landing';
import CreateWalletFlow from './components/screens/CreateWalletFlow';
import ImportWalletFlow from './components/screens/ImportWalletFlow';
import LoginScreen from './components/screens/LoginScreen';
import VerifyWalletScreen from './components/screens/VerifyWalletScreen';
import SetupMetaMaskFlow from './components/screens/SetupMetaMaskFlow';
import Sidebar from './components/sidebar/Sidebar';
import ChatPanel from './components/chat/ChatPanel';
import ProfileModal from './components/modals/ProfileModal';
import SettingsModal from './components/modals/SettingsModal';
import WalletModal from './components/modals/WalletModal';
import EditContactModal from './components/modals/EditContactModal';
import NewChatModal from './components/modals/NewChatModal';
import GroupChatModal from './components/modals/GroupChatModal';
import SearchOverlay from './components/modals/SearchOverlay';
import NotificationToast from './components/notifications/NotificationToast';
import Empty from './components/screens/Empty';

interface Notif {
  id: string;
  contact: Contact;
  text: string;
  ts: number;
}

export default function App() {
  // Auto-restore session if saved
  const [screen, setScreen] = useState<Screen>(() => {
    try {
      const sess = localStorage.getItem('pmt_session');
      if (sess) {
        const { username, address } = JSON.parse(sess);
        if (address && username) {
          // Check if this is an internal wallet (created/imported in-app).
          // Internal wallets store an encrypted wallet in pmt_account_{username} — no external verify needed.
          const accountKey = `pmt_account_${username.toLowerCase()}`;
          const account = localStorage.getItem(accountKey);
          if (account) return 'chat'; // has local account = internal wallet = skip verify
          // External wallets (MetaMask login with username) require 24h verify token
          const verifyTs = localStorage.getItem(`pmt_verify_${address.toLowerCase()}`);
          const isValid  = verifyTs && (Date.now() - parseInt(verifyTs)) < 86400000; // 24h
          return isValid ? 'chat' : 'verify';
        }
        if (address) return 'chat'; // MetaMask/WalletConnect — no password verification needed
      }
    } catch { /* ignore */ }
    return 'landing';
  });
  const [wallet, setWallet] = useState<Wallet | null>(() => {
    try {
      const sess = localStorage.getItem('pmt_session');
      if (sess) {
        const { username, address } = JSON.parse(sess);
        if (address) {
          // Restore privateKey from sessionStorage (set on login, survives page refresh)
          const pk = sessionStorage.getItem('pmt_pk_' + address.toLowerCase()) || '';
          // Load full wallet data if saved
          const saved = localStorage.getItem(`pmt_account_${address.toLowerCase()}`);
          if (saved) {
            const acc = JSON.parse(saved);
            return { address, privateKey: pk, balance: '0.000', network: 'PMTchain', username: acc.username || username };
          }
          return { address, privateKey: pk, balance: '0.000', network: 'PMTchain', username };
        }
      }
    } catch { /* ignore */ }
    return null;
  });
  const [isDemo, setIsDemo] = useState(false);
  // One-time prompt to collect password for cloud backup when session was restored from localStorage
  const [backupPromptPassword, setBackupPromptPassword] = useState('');
  const [showBackupPrompt, setShowBackupPrompt] = useState(false);
  const [backupPromptErr, setBackupPromptErr] = useState('');
  const [backupPromptSaving, setBackupPromptSaving] = useState(false);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [msgs, setMsgs] = useState<MsgsMap>(() => {
    // Load messages synchronously from localStorage on mount (same pattern as wallet init)
    // This avoids timing issues with useEffect-based loading where effects may run in unexpected order
    try {
      const sess = localStorage.getItem('pmt_session');
      if (!sess) return {};
      const { address } = JSON.parse(sess);
      if (!address) return {};
      const key = address.toLowerCase();
      return storage.getMsgs(key) ?? {};
    } catch { return {}; }
  });
  const [active, setActive] = useState<Contact | null>(null);
  const activeRef = useRef<Contact | null>(null);
  const walletRef = useRef<Wallet | null>(null);
  const contactsRef = useRef<Contact[]>([]);
  // True when user has an internal wallet but pk is missing/stale — SendModal shows password field
  const needsPasswordToSend = React.useMemo(() => {
    const w = wallet;
    if (!w?.username || isDemo) return false;
    // MetaMask users: if window.ethereum is available, always use MetaMask — never ask for password
    if (typeof window !== 'undefined' && (window as any).ethereum) return false;
    const accountRaw = localStorage.getItem(`pmt_account_${w.username.toLowerCase()}`);
    if (!accountRaw) {
      // On mobile (no MetaMask), user with address+username likely has a created wallet
      return !!w.address;
    }
    try {
      const account = JSON.parse(accountRaw);
      if (account.address?.toLowerCase() !== w.address?.toLowerCase()) return false;
      if (!account.encryptedWallet || account.needsReimport) return false;
    } catch { return false; }
    const pk = w.privateKey || '';
    if (!pk) return true;
    try { return new ethers.Wallet(pk).address.toLowerCase() !== w.address?.toLowerCase(); }
    catch { return true; }
  }, [wallet, isDemo]);
  const prevAccountKeyRef = useRef<string | null>(null);
  // Session password — kept in memory only, never persisted, used for auto cloud backup
  const sessionPasswordRef = useRef<string | null>(null);
  const profileRef = useRef<Profile>({ name: '', bio: '', avatarUrl: null, address: null });

  const setActiveAndRef = useCallback((c: Contact | null) => {
    setActive(c); activeRef.current = c;
  }, []);

  const [showProfile, setShowProfile] = useState(false);
  const [showWallet, setShowWallet] = useState(false);
  const [wcConnecting, setWcConnecting] = useState(false);
  const [wcErr, setWcErr] = useState<string|null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [showGroup, setShowGroup] = useState(false);
  const [manageGroupContact, setManageGroupContact] = useState<any>(null);
  const [showSearch, setShowSearch] = useState(false);
  const [editContact, setEditContact] = useState<Contact | null>(null);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);

  // Auto-open sidebar on mobile when first entering the chat screen
  useEffect(() => {
    if (screen === 'chat' && !active) {
      const mob = /Android|iPhone|iPad|iPod|Opera Mini|IEMobile|WPDesktop/i.test(navigator.userAgent);
      if (mob) setMobileSidebarOpen(true);
    }
  }, [screen]);
  const [notifs, setNotifs] = useState<Notif[]>([]);
  const [profile, setProfile] = useState<Profile>({ name: '', bio: '', avatarUrl: null, address: null });
  const [darkMode, setDarkMode] = useState<boolean>(() => storage.getTheme() !== 'light');

  useEffect(() => {
    walletRef.current = wallet;
    profileRef.current = profile;
  }, [wallet, profile]);

  useEffect(() => { contactsRef.current = contacts; }, [contacts]);

  // Clean up stale pmt_pk_ entries in sessionStorage that don't belong to current wallet
  React.useEffect(() => {
    const myAddr = wallet?.address?.toLowerCase();
    if (!myAddr) return;
    Object.keys(sessionStorage).filter(k => k.startsWith('pmt_pk_') && k !== `pmt_pk_${myAddr}`).forEach(k => sessionStorage.removeItem(k));
  }, [wallet?.address]);

  // Deduplicate msgs state once on mount — cleans up any dupes already in memory
  // (can happen if local + API relay both delivered same message before dedup fix)
  useEffect(() => {
    setMsgs(prev => {
      let changed = false;
      const clean: MsgsMap = {};
      Object.entries(prev).forEach(([addr, list]) => {
        const seen = new Set<string>();
        const deduped = (list ?? []).filter((m: any) => {
          if (seen.has(m.id)) { changed = true; return false; }
          seen.add(m.id);
          return true;
        });
        clean[addr] = deduped;
      });
      return changed ? clean : prev;
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // run once on mount



  // Fetch balance directly from PMTchain RPC — works for all wallet types
  useEffect(() => {
    if (!wallet?.address || isDemo || wallet.address === 'demo') return;
    const fetchBal = async () => {
      try {
        const res = await fetch('https://node1-ipm.dweb3.wtf', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ jsonrpc: '2.0', method: 'eth_getBalance', params: [wallet.address, 'latest'], id: 1 }),
        });
        const { result } = await res.json();
        if (result) {
          const bal = (parseInt(result, 16) / 1e18).toFixed(4);
          setWallet(prev => prev ? { ...prev, balance: bal } : prev);
        }
      } catch { /* silent */ }
    };
    fetchBal();
    const timer = setInterval(fetchBal, 30000); // refresh every 30s
    return () => clearInterval(timer);
  }, [wallet?.address, isDemo]);

  useEffect(() => {
    document.body.classList.toggle('light-mode', !darkMode);
    storage.setTheme(darkMode ? 'dark' : 'light');
  }, [darkMode]);

  const toggleTheme = useCallback(() => setDarkMode(d => !d), []);

  const accountKey = wallet?.address
    ? normalizeAddress(wallet.address)
    : isDemo ? 'demo' : null;

  useEffect(() => {
    if (!accountKey) return;
    const savedContacts = storage.getContacts(accountKey);
    if (savedContacts.length > 0) {
      savedContacts.forEach(c => { if (c && c.address) c.address = c.address.toLowerCase(); });
      const withAI = savedContacts.some(c => c.isAI) ? savedContacts : [AI_AGENT_CONTACT, ...savedContacts];
      setContacts(withAI);
    } else if (isDemo) {
      const dc = [AI_AGENT_CONTACT, ...DEMO_CONTACTS.map(c => ({ ...c, address: c.address.toLowerCase() }))];
      setContacts(dc);
    } else {
      setContacts([AI_AGENT_CONTACT]);
    }
    const savedMsgs = storage.getMsgs(accountKey);
    // Note: on first mount, msgs are already loaded via useState initializer.
    // This effect handles account switches (logout/login with different account).
    if (Object.keys(savedMsgs).length > 0) {
      const normalized: MsgsMap = {};
      Object.entries(savedMsgs).forEach(([addr, list]) => {
        const key = addr.toLowerCase();
        // Deduplicate by msgId — prevents showing same message twice
        // (can happen if local + API relay both delivered before dedup fix was deployed)
        const seen = new Set<string>();
        const deduped = (list ?? []).filter((m: any) => {
          if (seen.has(m.id)) return false;
          seen.add(m.id);
          return true;
        });
        normalized[key] = [...(normalized[key] ?? []), ...deduped.map(m => {
          if ((m.type === 'image' || m.type === 'file') && !m.fileUrl) {
            if (m.ipfsCid) m.fileUrl = getIpfsUrl(m.ipfsCid);
            else if (m.b64Data) m.fileUrl = m.b64Data;
          }
          if (m.type === 'voice' && m.audioMsgId && !m.audioUrl) {
            try { const b64 = storage.getAudio(m.audioMsgId); if (b64) m.audioUrl = b64ToObjectUrl(b64); } catch {}
          }
          return m;
        })];
      });
      setMsgs(normalized);
    } else if (isDemo) {
      setMsgs(buildInitMsgs());
    }
    const sp = storage.getProfile(accountKey);
    const p = { ...sp, address: walletRef.current?.address ?? null };
    setProfile(p);
    profileRef.current = p;
  }, [accountKey, isDemo]);

  useEffect(() => {
    if (!accountKey || contacts.length === 0) return;
    storage.setContacts(accountKey, contacts);
  }, [contacts, accountKey]);

  useEffect(() => {
    // Always update prevAccountKeyRef on ANY accountKey change (including null on logout)
    // If we check !accountKey first, prevAccountKeyRef stays stale and re-login with same
    // address skips the transition guard and saves empty msgs to localStorage.
    if (accountKey !== prevAccountKeyRef.current) {
      prevAccountKeyRef.current = accountKey;
      return; // skip save during any accountKey transition (load effect fires next)
    }
    if (!accountKey) return;
    // Deduplicate by msgId before saving — guards against any duplication
    // that crept into React state (from concurrent processLocalInbox + processApiInbox)
    const clean: MsgsMap = {};
    Object.entries(msgs).forEach(([addr, list]) => {
      const seen = new Set<string>();
      clean[addr] = (list ?? []).filter((m: any) => {
        if (seen.has(m.id)) return false;
        seen.add(m.id);
        return true;
      });
    });
    storage.setMsgs(accountKey, clean);
  }, [msgs, accountKey]);

  // Auto cloud backup — saves encrypted backup to IPFS whenever contacts or messages change.
  // Debounced 8s to avoid hammering on rapid message receipt.
  // Password is held in sessionPasswordRef (memory only, never persisted).
  useEffect(() => {
    if (!wallet?.address || isDemo) return;
    if (!sessionPasswordRef.current) return; // no password in memory (MetaMask user)
    const username = wallet.username;
    if (!username) return; // MetaMask wallet — no backup needed
    const timer = setTimeout(async () => {
      try {
        const password = sessionPasswordRef.current;
        if (!password) return;
        // Strip binary blobs from messages before backup (keep metadata + IPFS CIDs)
        const cleanMsgs: Record<string, object[]> = {};
        Object.entries(msgs).forEach(([addr, arr]) => {
          cleanMsgs[addr] = (arr as any[]).slice(addr === AI_AGENT_ADDRESS.toLowerCase() ? -100 : -50).map(m => {
            const { b64Data, audioUrl, fileUrl, imgData, fileData,
                    uploading, _toAddr, waveform, audioB64, ...keep } = m;
            return keep;
          });
        });
        // Enrich contacts with pmt_profile_{addr} data so avatar/bio survive backup/restore
        const enrichedCtx = await Promise.all(contacts.map(async (ct: any) => {
          try {
            // Compress any base64 avatar (group or contact) to thumbnail for backup
            if (ct.avatarUrl?.startsWith('data:')) {
              const { compressAvatarForBackup } = await import('./lib/cloudBackup');
              const thumb = await compressAvatarForBackup(ct.avatarUrl);
              const p = JSON.parse(localStorage.getItem(`pmt_profile_${ct.address?.toLowerCase()}`) ?? 'null');
              const bio = p ? (ct.bio || p.bio || '') : ct.bio;
              return { ...ct, avatarUrl: thumb, bio };
            }
            const p = JSON.parse(localStorage.getItem(`pmt_profile_${ct.address?.toLowerCase()}`) ?? 'null');
            if (!p) return ct;
            const av = ct.avatarUrl || p.avatarUrl || null;
            return { ...ct, avatarUrl: (av?.startsWith?.('http') ? av : null), bio: ct.bio || p.bio || '' };
          } catch { return ct; }
        }));
        await saveCloudBackup(username, password, {
          wallet: { address: wallet.address, privateKey: wallet.privateKey ?? '', username },
          contacts: enrichedCtx,
          messages: cleanMsgs,
          profile: profileRef.current ? await (async () => {
            const av = profileRef.current!.avatarUrl;
            // Compress base64 avatar to 64x64 thumbnail (~3KB) for backup
            const { compressAvatarForBackup } = await import('./lib/cloudBackup');
            const compressed = av ? await compressAvatarForBackup(av) : null;
            return { ...profileRef.current, avatarUrl: compressed };
          })() : {},
        });
      } catch { /* offline or Pinata unavailable — silent */ }
    }, 8000);
    return () => clearTimeout(timer);
  }, [contacts, msgs, wallet?.address, wallet?.username, isDemo]);

  const pushNotif = useCallback((contact: Contact, text: string) => {
    const id = uid();
    const n: Notif = { id, contact, text, ts: Date.now() };
    setNotifs(p => [...p.slice(-4), n]);
    playNotifSound();
    setTimeout(() => setNotifs(p => p.filter(x => x.id !== id)), 5000);
  }, []);

  useInboxPoll({ wallet, isDemo, setMsgs, setContacts, pushNotif });

  const handleMediaUploaded = useCallback((mediaMsgId: string, cid: string | null, ipfsUrl: string | null, fallbackB64?: string) => {
    if (!accountKey) return;
    setMsgs(prev => {
      const updated = { ...prev };
      Object.keys(updated).forEach(addr => {
        updated[addr] = (updated[addr] ?? []).map(m => {
          const mId = m.mediaMsgId ?? m.imgMsgId ?? '';
          if (mId !== mediaMsgId) return m;
          if (cid) return { ...m, ipfsCid: cid, fileUrl: ipfsUrl ?? getIpfsUrl(cid), uploading: false, b64Data: undefined };
          if (fallbackB64) return { ...m, fileUrl: fallbackB64, b64Data: fallbackB64, uploading: false };
          return m;
        });
        // Update inbox
        updated[addr]?.forEach(m => {
          if ((m.mediaMsgId ?? m.imgMsgId) !== mediaMsgId) return;
          const toAddr = m._toAddr ?? addr;
          try {
            const inbox: Record<string, unknown>[] = JSON.parse(localStorage.getItem(STORAGE_KEYS.inbox(toAddr)) ?? '[]');
            const ni = inbox.map(im => (im.mediaMsgId ?? im.imgMsgId) !== mediaMsgId ? im : cid ? { ...im, ipfsCid: cid, b64Data: null } : { ...im, b64Data: fallbackB64 });
            localStorage.setItem(STORAGE_KEYS.inbox(toAddr), JSON.stringify(ni));
          } catch {}
        });
      });
      try {
        const stored = storage.getMsgs(accountKey);
        Object.keys(stored).forEach(addr => {
          stored[addr] = (stored[addr] ?? []).map(m => {
            if ((m.mediaMsgId ?? m.imgMsgId) !== mediaMsgId) return m;
            if (cid) return { ...m, ipfsCid: cid, fileUrl: ipfsUrl ?? getIpfsUrl(cid), uploading: false };
            if (fallbackB64) return { ...m, b64Data: fallbackB64, fileUrl: fallbackB64, uploading: false };
            return m;
          });
        });
        storage.setMsgs(accountKey, stored);
      } catch {}
      return updated;
    });
  }, [accountKey]);

  const handleReact = useCallback((contactAddr: string, msgId: string, emoji: string) => {
    setMsgs(p => {
      const addr = contactAddr.toLowerCase();
      return {
        ...p,
        [addr]: (p[addr] ?? []).map(m => {
          if (m.id !== msgId) return m;
          const myAddr = walletRef.current?.address?.toLowerCase() ?? '';
          // Address-keyed reactions: {emoji: {address: 1}} — each user owns their own reaction
          const reactions = { ...(m.reactions ?? {}) } as Record<string, any>;
          const emojiEntry = reactions[emoji];
          const prev = typeof emojiEntry === 'object' ? { ...emojiEntry } : {};
          // Toggle: add if not present, remove if already reacted
          if (prev[myAddr]) {
            delete prev[myAddr];
          } else {
            prev[myAddr] = 1;
          }
          reactions[emoji] = prev;
          if (!isDemo && myAddr) {
            // Include msgHash as fallback identifier — handles cases where msgId differs across devices
            // (can happen when messages arrived via different paths during relay outages)
            const rxnMsg = { id: `rxn_${Date.now()}`, type: 'reaction', msgId, msgHash: m.hash, emoji, reactions, from: walletRef.current.address, ts: Date.now() };
            // Same-device delivery via localStorage
            try {
              const inbox: object[] = JSON.parse(localStorage.getItem(STORAGE_KEYS.inbox(addr)) ?? '[]');
              inbox.push(rxnMsg);
              localStorage.setItem(STORAGE_KEYS.inbox(addr), JSON.stringify(inbox));
            } catch {}
            // Cross-device delivery — for groups relay to each member, for DMs relay to contact
            // Check if this is a group conversation (addr starts with 'group_' or contact.isGroup)
            const contact = contactsRef.current?.find((c: any) => normalizeAddress(c.address) === addr);
            if (contact?.isGroup || addr.startsWith('group_')) {
              // Group reaction: fetch live member list and relay to each
              // Extract groupId: strip 'group_' prefix if present
              const groupId = contact?.groupId || contact?.id || addr.replace(/^group_/, '');
              fetch(`/api/groups?id=${groupId}`)
                .then(r => r.json())
                .then(grpData => {
                  const members: string[] = (grpData.members ?? contact.members ?? []).map((m2: any) => normalizeAddress(typeof m2 === 'string' ? m2 : ''));
                  members.forEach(memberAddr => {
                    if (!memberAddr || memberAddr === myAddr) return;
                    fetch(`/api/inbox?address=${memberAddr}`, {
                      method: 'POST', headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify(rxnMsg),
                    }).catch(() => {});
                  });
                }).catch(() => {});
            } else {
              fetch(`/api/inbox?address=${addr}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(rxnMsg),
              }).catch(() => {});
            }
          }
          return { ...m, reactions };
        }),
      };
    });
  }, [isDemo]);

  // ── Send ETH/PMT ─────────────────────────────────────────────────────────────
  const sendETH = useCallback(async (contact: Contact, amount: string, walletPassword?: string): Promise<string | null> => {
    const block = nextBlock();
    const txId = uid();
    const tx: Message = { id: txId, type: 'tx', out: true, amount, text: '', time: now(), block, confirms: 0, hash: rndHash(), pending: true };
    const addr = normalizeAddress(contact.address);
    setMsgs(p => ({ ...p, [addr]: [...(p[addr] ?? []), tx] }));
    setContacts(p => p.map(c => c.id === contact.id ? { ...c, preview: `◈ Sent ${amount} PMT` } : c));

    if (!isDemo && walletRef.current?.address) {
      try {
        if (!/^0x[0-9a-fA-F]{40}$/.test(addr))
          throw new Error('Invalid address. Please edit the contact and add their full 0x wallet address.');
        const weiHex = '0x' + BigInt(Math.floor(parseFloat(amount) * 1e18)).toString(16);
        let txHash: string;
        // Read address from session (authoritative) not walletRef which may be stale/corrupted
        const sessAddr = (() => { try { return JSON.parse(localStorage.getItem('pmt_session')||'{}').address?.toLowerCase()||''; } catch { return ''; } })();
        const myAddr = sessAddr || walletRef.current.address?.toLowerCase() || '';
        const pkMatches = (k: string) => { try { return !!k && new ethers.Wallet(k).address.toLowerCase() === myAddr; } catch { return false; } };
        // Get private key — validate it matches the current wallet address
        let usePk = walletRef.current.privateKey || '';
        if (usePk && !pkMatches(usePk)) {
          sessionStorage.removeItem('pmt_pk_' + myAddr);
          // Reset walletRef to clean state (may have been corrupted by a previous bad decrypt)
          walletRef.current = { ...walletRef.current, privateKey: '', address: myAddr };
          usePk = '';
        }
        // If no valid pk but user supplied their wallet password, decrypt it now
        if (!usePk && walletPassword) {
          const username = walletRef.current?.username ?? '';
          const accountRaw = localStorage.getItem(`pmt_account_${username.toLowerCase()}`);
          if (!accountRaw) throw new Error('Wallet not found on this device.');
          const account = JSON.parse(accountRaw);
          let walletData: any;
          try {
            walletData = await (await import('./lib/auth')).PMTAuth.decryptWallet(account.encryptedWallet, walletPassword);
          } catch {
            throw new Error('Incorrect password. Please try again.');
          }
          if (!walletData?.privateKey) throw new Error('Incorrect password. Please try again.');
          // Validate the decrypted key is for the current wallet address
          const derivedAddr = new ethers.Wallet(walletData.privateKey).address.toLowerCase();
          if (derivedAddr === myAddr) {
            // Key matches — cache it and use direct ethers.js path
            usePk = walletData.privateKey;
            sessionStorage.setItem('pmt_pk_' + myAddr, usePk);
            walletRef.current = { ...walletRef.current, privateKey: usePk };
          } else {
            // Account data is corrupted — stored key is for a different address.
            // On desktop: fall through to MetaMask. On mobile: show a clear error.
            const noEthereum = !(window as any).ethereum;
            if (noEthereum) {
              throw new Error(`Your saved wallet key doesn't match your current wallet address. Please go to Settings → Import Wallet and re-import using your seed phrase to fix this.`);
            }
            // Mark account as needing re-import so password field stops showing
            try {
              const username = walletRef.current?.username ?? '';
              const accountRaw2 = localStorage.getItem(`pmt_account_${username.toLowerCase()}`);
              if (accountRaw2) {
                const acc2 = JSON.parse(accountRaw2);
                acc2.needsReimport = true;
                acc2.encryptedWallet = null;
                localStorage.setItem(`pmt_account_${username.toLowerCase()}`, JSON.stringify(acc2));
                localStorage.setItem(`pmt_account_${myAddr}`, JSON.stringify(acc2));
              }
            } catch {}
            // Desktop: fall through to MetaMask EIP-6963 path silently
          }
        }
        if (usePk) {
          // Internal wallet — sign & send directly, no MetaMask needed
          const provider = new ethers.JsonRpcProvider('https://node1-ipm.dweb3.wtf');
          const signer = new ethers.Wallet(usePk, provider);
          const tx = await signer.sendTransaction({ to: addr, value: BigInt(Math.floor(parseFloat(amount) * 1e18)), gasLimit: 21000 });
          txHash = tx.hash;
        } else {
          // External wallet (MetaMask) — use EIP-6963 provider directly
          // This bypasses window.ethereum which may be hijacked by other extensions
          const eth = await new Promise<any>((resolve) => {
            const found: any[] = [];
            const h = (e: any) => found.push(e.detail);
            window.addEventListener('eip6963:announceProvider', h);
            window.dispatchEvent(new Event('eip6963:requestProvider'));
            setTimeout(() => {
              window.removeEventListener('eip6963:announceProvider', h);
              const mm = found.find((p: any) => p.info?.rdns === 'io.metamask');
              resolve(mm?.provider ?? (window as any).ethereum ?? null);
            }, 400);
          });
          if (!eth) throw new Error('No crypto wallet found. On mobile, use the ↑PMT button and enter your wallet password to send PMT.');
          // Switch to PMTchain if needed
          const currentChain = await eth.request({ method: 'eth_chainId' });
          if (currentChain !== '0x46df2') {
            try {
              await eth.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: '0x46df2' }] });
            } catch (sw: any) {
              if (sw.code === 4902 || sw.code === -32603) {
                await eth.request({ method: 'wallet_addEthereumChain', params: [{
                  chainId: '0x46df2', chainName: 'PMTchain',
                  nativeCurrency: { name: 'PMT', symbol: 'PMT', decimals: 18 },
                  rpcUrls: ['https://node1-ipm.dweb3.wtf'],
                  blockExplorerUrls: ['https://explorer.publicmasterpiece.com'],
                }]});
              } else if (sw.code !== 4001) throw sw;
            }
          }
          const accounts = await eth.request({ method: 'eth_accounts' });
          const fromAddr = accounts?.[0] ?? walletRef.current.address;
          // Fetch nonce directly from PMTchain RPC to avoid MetaMask nonce tracking mismatch
          let nonceHex: string | undefined;
          try {
            const nonceRes = await fetch('https://node1-ipm.dweb3.wtf', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ jsonrpc: '2.0', method: 'eth_getTransactionCount', params: [fromAddr, 'latest'], id: 1 }),
            });
            const nonceData = await nonceRes.json();
            if (nonceData.result) nonceHex = nonceData.result;
          } catch { /* use MetaMask nonce if fetch fails */ }
          const txParams: any = { from: fromAddr, to: addr, value: weiHex };
          if (nonceHex) txParams.nonce = nonceHex;
          txHash = await eth.request({
            method: 'eth_sendTransaction',
            params: [txParams],
          }) as string;
        }
        setMsgs(p => ({ ...p, [addr]: (p[addr] ?? []).map(m => m.id === txId ? { ...m, hash: txHash, pending: false, confirms: 1 } : m) }));

        // Relay payment notification to recipient's inbox so they see it cross-device
        try {
          const senderName = walletRef.current?.username || myAddr.slice(0, 8) + '...';
          const senderAvatarUrl = profileRef.current?.avatarUrl || null;
          const payNotif = {
            id: 'pay_' + txHash.slice(0, 16),
            type: 'tx',
            out: false,
            amount,
            coin: 'PMT',
            hash: txHash,
            time: now(),
            confirms: 1,
            text: '',
            from: myAddr,
            senderName,
            senderAvatarUrl,
          };
          await fetch('/api/inbox', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ to: addr, msg: payNotif }),
          });
        } catch { /* silent — local tx already recorded */ }

        return txHash;
      } catch (e: any) {
        setMsgs(p => ({ ...p, [addr]: (p[addr] ?? []).filter(m => m.id !== txId) }));
        throw e;
      }
    } else {
      setTimeout(() => setMsgs(p => ({ ...p, [addr]: (p[addr] ?? []).map(m => m.id === txId ? { ...m, confirms: 3, pending: false } : m) })), 2000);
      return null;
    }
  }, [isDemo]);

  const sendMsg = useCallback(async (input: string | Partial<Message>) => {
    if (!activeRef.current) return;
    const isVoice = typeof input === 'object' && input.type === 'voice';
    const isImage = typeof input === 'object' && input.type === 'image';
    const isFile  = typeof input === 'object' && input.type === 'file';
    const block = nextBlock();
    const msg: Message = (isVoice || isImage || isFile)
      ? { id: uid(), out: true, ...(input as object), type: (input as Message).type, text: '', time: now(), block, confirms: 0, hash: rndHash(), pending: true }
      : { id: uid(), out: true, type: 'text', text: input as string, time: now(), block, confirms: 0, hash: rndHash(), pending: true };
    const addr = normalizeAddress(activeRef.current.address);
    setMsgs(p => ({ ...p, [addr]: [...(p[addr] ?? []), { ...msg, _toAddr: addr }] }));
    const preview = isVoice ? '🎙 Voice message' : isImage ? '🖼 Image' : isFile ? `📄 ${(input as Message).fileName ?? 'File'}` : input as string;
    setContacts(p => p.map(c => c.id === activeRef.current?.id ? { ...c, preview } : c));

    // AI Agent
    if (activeRef.current.isAI && typeof input === 'string') {
      const userMsg = input;
      const typingId = `ai_typing_${Date.now()}`;
      setMsgs(p => ({ ...p, [addr]: [...(p[addr] ?? []), { id: typingId, out: false, type: 'text', text: '...', time: now(), block, confirms: 0, hash: rndHash(), isTyping: true }] }));
      setContacts(p => p.map(c => c.isAI ? { ...c, preview: 'Typing...' } : c));
      setMsgs(prev => {
        const history = (prev[addr] ?? []).filter(m => !m.isTyping).slice(-10).map(m => ({ role: m.out ? 'user' : 'assistant', content: m.text }));
        const aiKey = storage.getAiKey() ?? DEFAULT_AI_KEY;
        fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-api-key': aiKey, 'anthropic-version': '2023-06-01', 'anthropic-dangerous-direct-browser-access': 'true' },
          body: JSON.stringify({ model: AI_MODEL, max_tokens: 1500, tools: [{ type: 'web_search_20250305', name: 'web_search' }], system: `You are PMT AI Assistant, a helpful AI built into PMT-Chat — a decentralized, end-to-end encrypted blockchain messenger. You are powered by Claude (Anthropic).

You can answer ANY question: crypto, blockchain, coding, math, science, history, philosophy, advice, creative writing, general knowledge — anything. Be concise, friendly, and direct.

## About PMT Chain & Publicmasterpiece Token (PMT)

**PMT Chain** is a custom EVM-compatible blockchain built for the PMT-Chat ecosystem.
- Chain ID: 0x46df2 (290290 decimal)
- Native token: PMT (Publicmasterpiece Token)
- RPC: wss://node1-ipm.dweb3.wtf (WebSocket) / https://node1-ipm.dweb3.wtf (HTTP)
- Block explorer: https://explorer.publicmasterpiece.com
- Consensus: Proof of Authority (PoA) — fast finality, low fees
- Block time: ~3 seconds
- Gas fees: extremely low (fractions of PMT)

**PMT Token (Publicmasterpiece Token)**
- The native currency of PMTchain
- Used to pay gas fees for all on-chain transactions
- Sent peer-to-peer directly inside PMT-Chat conversations
- Every message sent on PMT-Chat is recorded on-chain as a transaction
- Symbol: PMT
- Wallet addresses are standard Ethereum-format (0x...)

**PMT-Chat features:**
- End-to-end encrypted messages stored on PMTchain
- Send PMT tokens directly in chat (↑PMT button)
- Username/password accounts with cloud backup (encrypted, zero-knowledge)
- Cross-device sync via relay
- Voice messages, images, documents, video attachments
- Emoji reactions with ownership (only you can remove your own reaction)
- Group chats
- WalletConnect + MetaMask support
- AI assistant (you!) powered by Claude

**How to add PMTchain to MetaMask:**
- Network name: PMTchain
- RPC URL: https://node1-ipm.dweb3.wtf
- Chain ID: 290290
- Currency symbol: PMT
- Block explorer: https://explorer.publicmasterpiece.com

Answer questions about PMT, PMTchain, the app, or anything else the user asks.`, messages: [...history, { role: 'user', content: userMsg }] }),
        })
        .then(r => r.json())
        .then(data => {
          const reply: string = (data.content ?? [])
            .filter((b: any) => b.type === 'text')
            .map((b: any) => b.text)
            .join('') || 'Sorry, I could not respond right now.';
          setMsgs(p => ({ ...p, [addr]: (p[addr] ?? []).filter(m => m.id !== typingId).concat({ id: `ai_${Date.now()}`, out: false, type: 'text', text: reply, time: now(), block, confirms: 3, hash: rndHash() }) }));
          setContacts(p => p.map(c => c.isAI ? { ...c, preview: reply.slice(0, 50) + (reply.length > 50 ? '...' : '') } : c));
        })
        .catch(() => {
          setMsgs(p => ({ ...p, [addr]: (p[addr] ?? []).filter(m => m.id !== typingId).concat({ id: `ai_err_${Date.now()}`, out: false, type: 'text', text: '⚠️ AI unavailable right now. Please try again.', time: now(), block, confirms: 0, hash: rndHash() }) }));
        });
        return prev;
      });
      return;
    }

    // Blockchain delivery
    if (!activeRef.current.isGroup && !activeRef.current.isAI && !isDemo && walletRef.current?.address) {
      const w = walletRef.current;
      const toAddr = normalizeAddress(activeRef.current.address);
      const msgContent = isVoice ? '🎙 Voice message' : isImage ? '🖼 Image' : isFile ? `📄 ${(input as Message).fileName ?? 'File'}` : input as string;
      const msgType = isVoice ? 'voice' : isImage ? 'image' : isFile ? 'file' : 'text';
      try {
        const inboxMsg = { id: msg.id, type: msg.type, text: msgContent, ...(isVoice && (() => {
          const vi = input as Message;
          // If no IPFS CID, include the base64 audio directly so recipient can play it cross-device
          const audioB64 = (!vi.ipfsCid && vi.audioMsgId) ? (() => { try { return storage.getAudio(vi.audioMsgId!); } catch { return null; } })() : null;
          return { duration: vi.duration, waveform: vi.waveform, audioMsgId: vi.audioMsgId, ipfsCid: vi.ipfsCid, ipfsUrl: vi.ipfsUrl, ...(audioB64 ? { audioB64 } : {}) };
        })()), ...((isImage || isFile) && { ipfsCid: (input as Message).ipfsCid ?? null, b64Data: (input as Message).b64Data ?? null, mediaMsgId: (input as Message).mediaMsgId, imgMsgId: (input as Message).imgMsgId, fileName: (input as Message).fileName, fileSize: (input as Message).fileSize, mimeType: (input as Message).mimeType }), from: w.address, fromName: profileRef.current?.name || w.username || w.address.slice(0, 8), fromAvatarUrl: (() => { const av = profileRef.current?.avatarUrl; return av?.startsWith('http') ? av : profileRef.current?._thumbUrl ?? null; })(), fromBio: profileRef.current?.bio ?? '', time: now(), block, hash: msg.hash, confirms: 0, ts: Date.now() };
        const existing: object[] = JSON.parse(localStorage.getItem(STORAGE_KEYS.inbox(toAddr)) ?? '[]');
        localStorage.setItem(STORAGE_KEYS.inbox(toAddr), JSON.stringify([...existing, inboxMsg]));
        // Also deliver via cross-device API relay (fire-and-forget)
        fetch(`/api/inbox?address=${toAddr}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(inboxMsg),
        }).then(r => {
          if (!r.ok) console.warn('[PMT relay] POST failed:', r.status);
        }).catch(e => {
          console.warn('[PMT relay] POST error:', e?.message);
          // Retry once after 2 seconds
          setTimeout(() => {
            fetch(`/api/inbox?address=${toAddr}`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(inboxMsg),
            }).catch(() => {});
          }, 2000);
        });
      } catch {}
      try {
        const msgHash = await hashMessage(w.address, toAddr, msgContent, Date.now());
        const { txHash, chain } = await broadcastMessage({ from: w.address, to: toAddr, msgHash, msgType, blockNum: block, useMetaMask: !!(window.ethereum && w.isMetaMask), metaMaskProvider: window.ethereum ?? null });
        setMsgs(p => ({ ...p, [toAddr]: (p[toAddr] ?? []).map(m => m.id === msg.id ? { ...m, hash: shortHash(txHash), chain, onChain: true } : m) }));
      } catch {}
    }

    // Group message relay — fetch fresh member list from server then send to each member
    if (activeRef.current.isGroup && !isDemo && walletRef.current?.address) {
      const w = walletRef.current;
      const grp = activeRef.current;
      const groupId = grp.groupId || grp.id;
      const msgContent = isVoice ? '🎙 Voice message' : isImage ? '🖼 Image' : isFile ? `📄 ${(input as Message).fileName ?? 'File'}` : input as string;
      const inboxMsg = {
        id: msg.id, type: msg.type, text: msgContent,
        ...((isImage || isFile) && { ipfsCid: (input as Message).ipfsCid ?? null, b64Data: (input as Message).b64Data ?? null, mediaMsgId: (input as Message).mediaMsgId, imgMsgId: (input as Message).imgMsgId, fileName: (input as Message).fileName, fileSize: (input as Message).fileSize, mimeType: (input as Message).mimeType }),
        ...(isVoice && (() => { const vi = input as Message; const audioB64 = (!vi.ipfsCid && vi.audioMsgId) ? (() => { try { return storage.getAudio(vi.audioMsgId!); } catch { return null; } })() : null; return { duration: vi.duration, waveform: vi.waveform, audioMsgId: vi.audioMsgId, ipfsCid: vi.ipfsCid, ipfsUrl: vi.ipfsUrl, ...(audioB64 ? { audioB64 } : {}) }; })()),
        from: w.address, fromName: profileRef.current?.name || w.username || w.address.slice(0, 8),
        fromAvatarUrl: (() => { const av = profileRef.current?.avatarUrl; return av?.startsWith('http') ? av : profileRef.current?._thumbUrl ?? null; })(),
        fromBio: profileRef.current?.bio ?? '',
        groupId,
        groupName: grp.name,
        groupAvatarUrl: grp.avatarUrl ?? null,
        time: now(), block, hash: msg.hash, confirms: 0, ts: Date.now(),
      };
      try {
        // Always fetch latest member list from server (local list may be stale)
        const grpRes = await fetch(`/api/groups?id=${groupId}`);
        const grpData = await grpRes.json();
        const members: string[] = (grpData.members ?? grp.members ?? []).map((m: any) => normalizeAddress(typeof m === 'string' ? m : ''));
        // Update local contact's member list
        if (grpData.members) {
          setContacts(p => p.map(c => c.groupId === groupId ? { ...c, members: grpData.members } : c));
        }
        // Relay to each member except self
        members.forEach(memberAddr => {
          if (!memberAddr || memberAddr === normalizeAddress(w.address)) return;
          fetch(`/api/inbox?address=${memberAddr}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(inboxMsg),
          }).catch(() => {});
        });
      } catch {
        // Fallback to local member list
        const members: string[] = (grp.members ?? []).map((m: any) => normalizeAddress(typeof m === 'string' ? m : ''));
        members.forEach(memberAddr => {
          if (!memberAddr || memberAddr === normalizeAddress(w.address)) return;
          fetch(`/api/inbox?address=${memberAddr}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(inboxMsg),
          }).catch(() => {});
        });
      }
    }
  }, [isDemo, handleMediaUploaded]);

  const selectContact = useCallback((c: Contact) => {
    if (!c || !c.address) return;
    setActiveAndRef(c);
    const addr = normalizeAddress(c.address);
    setMsgs(p => p[addr] ? p : { ...p, [addr]: [] });
    setContacts(p => p.map(x => x.id === c.id ? { ...x, unread: 0 } : x));
    setMobileSidebarOpen(false);
  }, [setActiveAndRef]);

  // Join group by invite link — defined after selectContact to avoid TDZ
  const handleJoinGroup = useCallback((joinId: string) => {
    if (!wallet?.address) return;
    fetch(`/api/groups?link=${encodeURIComponent(joinId)}`)
      .then(r => r.json())
      .then(data => {
        if (data.error) { alert('Invite link error: ' + data.error); return; }
        const pmtLine = (data.minPMT ?? 0) > 0 ? `\n◈ Requires ${data.minPMT} PMT to join` : '';
        if (window.confirm(`Join group "${data.group.name}"?\n${data.group.bio || ''}\nMembers: ${data.group.memberCount}${pmtLine}`)) {
          fetch('/api/groups?action=join', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ linkId: joinId, address: wallet!.address }),
          }).then(r => r.json()).then(d => {
            if (d.ok) {
              const g = d.group;
              const contact = {
                id: g.id, address: 'group_' + g.id, name: g.name, bio: g.bio,
                avatarUrl: g.avatarUrl, avatar: g.name.slice(0, 2).toUpperCase(),
                color: '#a78bfa', bg: '#1e1b30', online: false, isGroup: true,
                members: g.members, groupId: g.id, createdBy: g.createdBy,
                preview: d.alreadyMember ? 'Already a member' : 'Joined group', unread: 0,
              };
              if (!d.alreadyMember) setContacts(p => { if (p.find(x => x.id === g.id)) return p; return [contact, ...p]; });
              selectContact(contact);
            } else { alert('Could not join: ' + d.error); }
          });
        }
      })
      .catch(() => alert('Could not fetch invite link info.'));
  }, [wallet?.address, setContacts, selectContact]);

  // Handle invite link join on page load (?join=linkId)
  React.useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const joinId = params.get('join');
    if (!joinId || !wallet?.address) return;
    window.history.replaceState({}, '', window.location.pathname);
    handleJoinGroup(joinId);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wallet?.address]);


  const saveProfile = useCallback((np: Profile) => {
    setProfile(np); profileRef.current = np;
    if (accountKey) storage.setProfile(accountKey, np);
    // Generate a 40x40 thumbnail for relay messages (tiny — ~2KB base64, safe for Redis)
    if (np.avatarUrl?.startsWith('data:')) {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = 40; canvas.height = 40;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        // Crop center square then resize
        const s = Math.min(img.width, img.height);
        const sx = (img.width - s) / 2;
        const sy = (img.height - s) / 2;
        ctx.drawImage(img, sx, sy, s, s, 0, 0, 40, 40);
        const thumbUrl = canvas.toDataURL('image/jpeg', 0.8);
        const updated: Profile = { ...np, _thumbUrl: thumbUrl } as any;
        profileRef.current = updated;
        if (accountKey) storage.setProfile(accountKey, updated);
      };
      img.src = np.avatarUrl;
    }
    // If avatar is a real URL (IPFS), no thumbnail needed — use URL directly
  }, [accountKey, wallet?.address]);

  const handleWalletConnect = async () => {
    setWcErr(null);
    setWcConnecting(true);
    try {
      // Try injected wallet first (MetaMask, Trust, etc.)
      if (window.ethereum) {
        const perms = await (window.ethereum as any).request({method:'wallet_requestPermissions', params:[{eth_accounts:{}}]}).catch(() => null);
        let accounts: string[] = [];
        if (perms) {
          const perm = perms?.find((p: any) => p.parentCapability === 'eth_accounts');
          accounts = perm?.caveats?.find((cv: any) => cv.type === 'restrictReturnedAccounts')?.value || [];
        }
        if (!accounts.length) accounts = await (window.ethereum as any).request({method:'eth_requestAccounts'});
        if (accounts.length) {
          const chainId = await (window.ethereum as any).request({method:'eth_chainId'});
          const balHex = await (window.ethereum as any).request({method:'eth_getBalance',params:[accounts[0],'latest']}).catch(()=>'0x0');
          const balEth = (parseInt(balHex,16)/1e18).toFixed(4);
          const netNames: Record<string,string> = {'0x1':'Ethereum','0x89':'Polygon','0xa':'Optimism','0xa4b1':'Arbitrum','0xaa36a7':'Sepolia','0x46df2':'PMTchain'};
          setWallet(prev => prev ? {...prev, connectedAddress: accounts[0], connectedNetwork: netNames[chainId]||('Chain '+parseInt(chainId,16)), connectedBalance: balEth} : prev);
          setWcErr(null);
          setWcConnecting(false);
          return;
        }
      }
      // Fallback: WalletConnect QR
      resetWCProvider();
      const provider = await getWCProvider();
      provider.once('display_uri', (uri: string) => {
        // open WC URI in same tab on mobile, new window on desktop
        if (/Mobi|Android/i.test(navigator.userAgent)) {
          window.location.href = `metamask://wc?uri=${encodeURIComponent(uri)}`;
        } else {
          window.open(`https://metamask.app.link/wc?uri=${encodeURIComponent(uri)}`, '_blank');
        }
      });
      await provider.connect();
      const addr = provider.accounts?.[0];
      if (addr) setWallet(prev => prev ? {...prev, connectedAddress: addr} : prev);
    } catch(e: any) {
      if (e?.code !== 4001) setWcErr(e?.message || 'WalletConnect failed');
    } finally {
      setWcConnecting(false);
    }
  };

  const handleWallet = useCallback((w: Wallet & { restoredContacts?: any[]; restoredMessages?: Record<string,any[]>; restoredProfile?: any; sessionPassword?: string }) => {
    // Write restored data to storage BEFORE setWallet so the accountKey useEffect
    // finds them and doesn't overwrite with AI_AGENT_CONTACT only
    if (w.address && (w.restoredContacts?.length || w.restoredMessages)) {
      const ak = normalizeAddress(w.address);
      if (w.restoredContacts?.length) storage.setContacts(ak, w.restoredContacts);
      if (w.restoredMessages && Object.keys(w.restoredMessages).length) storage.setMsgs(ak, w.restoredMessages);
    }
    setWallet(w);
    walletRef.current = w;
    // Keep password in memory for auto cloud backup (never stored to localStorage)
    if (w.sessionPassword) sessionPasswordRef.current = w.sessionPassword;
    // If cloud restore: seed contacts and messages
    if (w.restoredContacts?.length) {
      // Always ensure AI agent contact is present after restore
      const hasAI = w.restoredContacts.some((c: any) => c.isAI);
      setContacts(hasAI ? w.restoredContacts : [AI_AGENT_CONTACT, ...w.restoredContacts]);
      // Restore pmt_profile_{addr} keys so contact avatars/bios are available immediately
      w.restoredContacts.forEach((ct: any) => {
        if (!ct.address || ct.isAI) return;
        // Groups: skip pmt_profile (all data is in the contact object itself)
        if (ct.isGroup) return;
        try {
          const key = `pmt_profile_${ct.address.toLowerCase()}`;
          const existing = JSON.parse(localStorage.getItem(key) ?? '{}');
          localStorage.setItem(key, JSON.stringify({
            ...existing,
            ...(ct.avatarUrl ? { avatarUrl: ct.avatarUrl } : {}),
            ...(ct.bio ? { bio: ct.bio } : {}),
            ...(ct.name ? { name: ct.name } : {}),
            address: ct.address.toLowerCase(),
          }));
        } catch { /* ignore */ }
      });
    }
    if (w.restoredMessages && Object.keys(w.restoredMessages).length) {
      setMsgs(w.restoredMessages as MsgsMap);
    }
    if (w.restoredProfile) {
      setProfile(w.restoredProfile as Profile);
      profileRef.current = w.restoredProfile as Profile;
      // Also save own profile to pmt_profile_{addr} for cross-component access
      if (w.address) {
        try {
          localStorage.setItem(`pmt_profile_${w.address.toLowerCase()}`,
            JSON.stringify({ ...w.restoredProfile, address: w.address.toLowerCase() }));
        } catch { /* ignore */ }
      }
    }
    setScreen('chat');
  }, [setContacts, setMsgs]);

  // On mount: if session was restored from localStorage but no password in memory,
  // check if cloud backup exists — if not, show one-time password prompt to create it
  useEffect(() => {
    if (!wallet?.address || isDemo || !wallet.username) return;
    if (sessionPasswordRef.current) return; // already have password from fresh login
    const uname = wallet.username.toLowerCase();
    fetch(`/api/auth?username=${encodeURIComponent(uname)}`)
      .then(r => r.json())
      .then(() => {
        // Show backup prompt once per 24h on session restore so auto-backup stays active
        const promptKey = `pmt_backup_prompted_${wallet?.address?.toLowerCase()}`;
        const lastPrompt = localStorage.getItem(promptKey);
        if (!lastPrompt || Date.now() - parseInt(lastPrompt) > 86400000) {
          localStorage.setItem(promptKey, String(Date.now()));
          setShowBackupPrompt(true);
        }
      })
      .catch(() => {});
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wallet?.address]);

  // Trigger an immediate backup 3s after login (so contacts/msgs are loaded into state first)
  // This ensures the backup fires even if the user doesn't change any data
  useEffect(() => {
    if (!wallet?.address || isDemo || !sessionPasswordRef.current) return;
    const username = wallet.username;
    if (!username) return;
    const timer = setTimeout(async () => {
      try {
        const password = sessionPasswordRef.current;
        if (!password) return;
        const cleanMsgs: Record<string, object[]> = {};
        Object.entries(msgs).forEach(([addr, arr]) => {
          cleanMsgs[addr] = (arr as any[]).slice(addr === AI_AGENT_ADDRESS.toLowerCase() ? -100 : -50).map(m => {
            const { b64Data, audioUrl, fileUrl, imgData, fileData,
                    uploading, _toAddr, waveform, audioB64, ...keep } = m;
            return keep;
          });
        });
        // Enrich contacts with pmt_profile_{addr} data so avatar/bio survive backup/restore
        const enrichedCtx = await Promise.all(contacts.map(async (ct: any) => {
          try {
            // Compress any base64 avatar (group or contact) to thumbnail for backup
            if (ct.avatarUrl?.startsWith('data:')) {
              const { compressAvatarForBackup } = await import('./lib/cloudBackup');
              const thumb = await compressAvatarForBackup(ct.avatarUrl);
              const p = JSON.parse(localStorage.getItem(`pmt_profile_${ct.address?.toLowerCase()}`) ?? 'null');
              const bio = p ? (ct.bio || p.bio || '') : ct.bio;
              return { ...ct, avatarUrl: thumb, bio };
            }
            const p = JSON.parse(localStorage.getItem(`pmt_profile_${ct.address?.toLowerCase()}`) ?? 'null');
            if (!p) return ct;
            const av = ct.avatarUrl || p.avatarUrl || null;
            return { ...ct, avatarUrl: (av?.startsWith?.('http') ? av : null), bio: ct.bio || p.bio || '' };
          } catch { return ct; }
        }));
        await saveCloudBackup(username, password, {
          wallet: { address: wallet.address, privateKey: wallet.privateKey ?? '', username },
          contacts: enrichedCtx,
          messages: cleanMsgs,
          profile: profileRef.current ? await (async () => {
            const av = profileRef.current!.avatarUrl;
            // Compress base64 avatar to 64x64 thumbnail (~3KB) for backup
            const { compressAvatarForBackup } = await import('./lib/cloudBackup');
            const compressed = av ? await compressAvatarForBackup(av) : null;
            return { ...profileRef.current, avatarUrl: compressed };
          })() : {},
        });
      } catch { /* silent */ }
    }, 3000);
    return () => clearTimeout(timer);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wallet?.address]);
  const handleDemo = useCallback(() => { setIsDemo(true); const w = { address: 'demo', balance: '2.847', network: 'PMTchain', username: 'Demo' }; setWallet(w); walletRef.current = w; setScreen('chat'); }, []);
  const handleLogout = useCallback(() => { if (walletRef.current?.address) sessionStorage.removeItem('pmt_pk_' + walletRef.current.address.toLowerCase()); storage.clearSession(); setWallet(null); walletRef.current = null; setIsDemo(false); setContacts([]); setMsgs({}); setActiveAndRef(null); setScreen('landing'); }, [setActiveAndRef]);

  if (screen === 'landing') return <Landing onDemo={handleDemo} onCreateWallet={() => setScreen('create')} onImportWallet={() => setScreen('import')} onLogin={() => setScreen('login')} onMetaMask={(w: Wallet) => {
              // Check if this wallet address already has a saved account
              const addr = w.address.toLowerCase();
              const savedAcct = localStorage.getItem(`pmt_account_${addr}`);
              // Also check if there's an active session for this address
              let sessMatch = false;
              try {
                const sess = localStorage.getItem('pmt_session');
                if (sess) {
                  const s = JSON.parse(sess);
                  if (s.address?.toLowerCase() === addr) sessMatch = true;
                }
              } catch {}

              if (savedAcct || sessMatch) {
                // Returning user — go straight to chat
                try {
                  const acct = savedAcct ? JSON.parse(savedAcct) : null;
                  const username = acct?.username || addr.slice(0,8);
                  const fullWallet = { ...w, username };
                  setWallet(fullWallet);
                  walletRef.current = fullWallet;
                  localStorage.setItem('pmt_session', JSON.stringify({ username, address: w.address }));
                  setScreen('chat');
                } catch {
                  setWallet(w); walletRef.current = w; setScreen('metamask_setup');
                }
              } else {
                // New user — needs to create username/password
                setWallet(w); walletRef.current = w; setScreen('metamask_setup');
              }
            }} />;
  if (screen === 'create') return <CreateWalletFlow onWallet={handleWallet} onBack={() => setScreen('landing')} />;
  if (screen === 'import') return <ImportWalletFlow onWallet={handleWallet} onBack={() => setScreen('landing')} />;
  if (screen === 'login') return <LoginScreen onLogin={handleWallet} onBack={() => setScreen('landing')} />;
  if (screen === 'verify') return <VerifyWalletScreen
    address={wallet?.address ?? ''}
    onVerified={() => {
      if (wallet?.address) localStorage.setItem(`pmt_verify_${wallet.address.toLowerCase()}`, String(Date.now()));
      setScreen('chat');
    }}
    onLogout={() => { storage.clearSession(); setWallet(null); walletRef.current = null; setScreen('landing'); }}
  />;
  if (screen === 'metamask_setup' && wallet) return <SetupMetaMaskFlow wallet={wallet} onDone={(username) => { setWallet(w => w ? { ...w, username } : w); setScreen('chat'); }} onSkip={() => {
                // Save minimal account so returning users skip setup next time
                try {
                  const addr = walletRef.current?.address?.toLowerCase();
                  if (addr && !localStorage.getItem(`pmt_account_${addr}`)) {
                    const acct = { username: addr.slice(0,8), address: walletRef.current?.address, isMetaMask: true, skipped: true, createdAt: Date.now() };
                    localStorage.setItem(`pmt_account_${addr}`, JSON.stringify(acct));
                    localStorage.setItem('pmt_session', JSON.stringify({ username: acct.username, address: walletRef.current?.address }));
                  }
                } catch {}
                setScreen('chat');
              }} />;

  return (
    <AppContext.Provider value={{ wallet, profile, isDemo, darkMode, toggleTheme }}>
      <div className="app-grid">
        <div className={`sidebar-overlay${mobileSidebarOpen ? ' visible' : ''}`} onClick={() => setMobileSidebarOpen(false)} />
        <Sidebar contacts={contacts} activeId={active?.id ?? null} wallet={wallet} isDemo={isDemo} profile={profile} mobileOpen={mobileSidebarOpen} onMobileClose={() => setMobileSidebarOpen(false)} onSelect={selectContact} onNew={() => setShowNew(true)} onNewGroup={() => setShowGroup(true)} onProfile={() => { setShowProfile(true); setMobileSidebarOpen(false); }} onSettings={() => { setShowSettings(true); setMobileSidebarOpen(false); }} onWallet={() => setShowWallet(true)} onLogout={handleLogout} onEditContact={setEditContact} onSearch={() => setShowSearch(true)} />
        <main className="chat-panel">
          {(active && active.address) ? <ChatErrorBoundary onReset={() => setActiveAndRef(null)}><ChatPanel contact={active} messages={msgs[normalizeAddress(active.address)] ?? []} onSend={sendMsg} onSendETH={sendETH} isDemo={isDemo} myAddress={wallet?.address?.toLowerCase() ?? ''} onReact={(msgId: string, emoji: string) => handleReact(normalizeAddress(active.address), msgId, emoji)} onMediaUploaded={handleMediaUploaded} onOpenSidebar={() => setMobileSidebarOpen(true)} onBack={() => { setActiveAndRef(null); setMobileSidebarOpen(true); }} onViewContact={(c) => setEditContact(c)} onManageGroup={(g) => setManageGroupContact(g)} needsPasswordToSend={needsPasswordToSend} onJoinGroup={handleJoinGroup} /> </ChatErrorBoundary> : <Empty onNew={() => setShowNew(true)} onOpenSidebar={() => setMobileSidebarOpen(true)} />}
        </main>
      </div>
      {showProfile && <ProfileModal profile={{ ...profile, address: wallet?.address ?? null }} onClose={() => setShowProfile(false)} onSave={saveProfile} />}

      {/* One-time backup password prompt — appears when session was restored but no cloud backup exists */}
      {showBackupPrompt && (
        <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,.7)',display:'flex',alignItems:'center',justifyContent:'center',zIndex:9999,padding:16}}>
          <div style={{background:'var(--panel)',border:'1px solid var(--border)',borderRadius:16,padding:'24px 20px',width:'100%',maxWidth:380,display:'flex',flexDirection:'column',gap:14}}>
            <div style={{fontSize:16,fontWeight:600}}>Enable cloud backup</div>
            <div style={{fontSize:13,color:'var(--text2)',lineHeight:1.5}}>Enter your password once to save an encrypted backup. This lets you restore your account on any device.</div>
            <input type="password" placeholder="Your password" value={backupPromptPassword}
              onChange={e=>{setBackupPromptPassword(e.target.value);setBackupPromptErr('');}}
              onKeyDown={async e=>{
                if(e.key==='Enter'&&backupPromptPassword){
                  setBackupPromptSaving(true);setBackupPromptErr('');
                  try{
                    const uname=wallet?.username?.toLowerCase()??'';
                    // Password used for encryption only — no local hash check
                    // (local account may not have passwordHash stored; server rejects wrong owners)
                    sessionPasswordRef.current=backupPromptPassword;
                    const cleanMsgs:Record<string,object[]>={};
                    Object.entries(msgs).forEach(([addr,arr])=>{
                      cleanMsgs[addr]=(arr as any[]).slice(addr===AI_AGENT_ADDRESS.toLowerCase()?-100:-50).map(m=>{const{b64Data,audioUrl,fileUrl,imgData,fileData,uploading,_toAddr,waveform,audioB64,...keep}=m;return keep;});
                    });
                    const {compressAvatarForBackup:cabE}=await import('./lib/cloudBackup');
                    const enrichedC=await Promise.all(contacts.map(async(ct:any)=>{try{if(ct.avatarUrl?.startsWith('data:')){const th=await cabE(ct.avatarUrl);return{...ct,avatarUrl:th};}const p=JSON.parse(localStorage.getItem(`pmt_profile_${ct.address?.toLowerCase()}`)||'null');return p?{...ct,avatarUrl:ct.avatarUrl||p.avatarUrl||null,bio:ct.bio||p.bio||''}:ct;}catch{return ct;}}));
                    const{saveCloudBackup:scb}=await import('./lib/cloudBackup');
                    await scb(uname,backupPromptPassword,{
                      wallet:{address:wallet?.address??'',privateKey:wallet?.privateKey??'',username:uname},
                      contacts:enrichedC,messages:cleanMsgs,profile:profileRef.current ? await (async()=>{
                        const {compressAvatarForBackup:cab}=await import('./lib/cloudBackup');
                        const av=profileRef.current!.avatarUrl;
                        return {...profileRef.current,avatarUrl:av?await cab(av):null};
                      })() : {}
                    });
                    setShowBackupPrompt(false);setBackupPromptPassword('');
                  }catch(err:any){setBackupPromptErr(err.message||'Failed — check password');}
                  finally{setBackupPromptSaving(false);}
                }
              }}
              autoFocus
              style={{background:'var(--surface)',border:'1px solid var(--border)',borderRadius:9,padding:'10px 13px',color:'var(--text)',fontSize:14,outline:'none',width:'100%'}}/>
            {backupPromptErr&&<div style={{fontSize:12,color:'var(--danger)'}}>{backupPromptErr}</div>}
            <div style={{display:'flex',gap:8}}>
              <button onClick={()=>{setShowBackupPrompt(false);setBackupPromptPassword('');}}
                style={{flex:1,padding:'10px',background:'var(--surface)',border:'1px solid var(--border)',borderRadius:9,color:'var(--text)',cursor:'pointer',fontSize:13}}>
                Later
              </button>
              <button disabled={!backupPromptPassword||backupPromptSaving}
                onClick={async()=>{
                  setBackupPromptSaving(true);setBackupPromptErr('');
                  try{
                    const uname=wallet?.username?.toLowerCase()??'';
                    sessionPasswordRef.current=backupPromptPassword;
                    const cleanMsgs:Record<string,object[]>={};
                    Object.entries(msgs).forEach(([addr,arr])=>{
                      cleanMsgs[addr]=(arr as any[]).slice(addr===AI_AGENT_ADDRESS.toLowerCase()?-100:-50).map(m=>{const{b64Data,audioUrl,fileUrl,imgData,fileData,uploading,_toAddr,waveform,audioB64,...keep}=m;return keep;});
                    });
                    const {compressAvatarForBackup:cabE}=await import('./lib/cloudBackup');
                    const enrichedC=await Promise.all(contacts.map(async(ct:any)=>{try{if(ct.avatarUrl?.startsWith('data:')){const th=await cabE(ct.avatarUrl);return{...ct,avatarUrl:th};}const p=JSON.parse(localStorage.getItem(`pmt_profile_${ct.address?.toLowerCase()}`)||'null');return p?{...ct,avatarUrl:ct.avatarUrl||p.avatarUrl||null,bio:ct.bio||p.bio||''}:ct;}catch{return ct;}}));
                    const{saveCloudBackup:scb}=await import('./lib/cloudBackup');
                    await scb(uname,backupPromptPassword,{
                      wallet:{address:wallet?.address??'',privateKey:wallet?.privateKey??'',username:uname},
                      contacts:enrichedC,messages:cleanMsgs,profile:profileRef.current ? await (async()=>{
                        const {compressAvatarForBackup:cab}=await import('./lib/cloudBackup');
                        const av=profileRef.current!.avatarUrl;
                        return {...profileRef.current,avatarUrl:av?await cab(av):null};
                      })() : {}
                    });
                    setShowBackupPrompt(false);setBackupPromptPassword('');
                  }catch(err:any){setBackupPromptErr(err.message||'Failed — check password');}
                  finally{setBackupPromptSaving(false);}
                }}
                style={{flex:2,padding:'10px',background:'var(--accent)',border:'none',borderRadius:9,
                  color:'#0a0c14',fontWeight:600,fontSize:13,cursor:'pointer',
                  opacity:!backupPromptPassword||backupPromptSaving?0.6:1}}>
                {backupPromptSaving?'Saving…':'Save Backup'}
              </button>
            </div>
          </div>
        </div>
      )}
      {showSettings && <SettingsModal onClose={() => setShowSettings(false)} darkMode={darkMode} onToggleTheme={toggleTheme} />}
      {showWallet && <WalletModal wallet={wallet} isDemo={isDemo} onClose={() => setShowWallet(false)} />}
      {showNew && <NewChatModal onClose={() => setShowNew(false)} onAdd={(c) => { setContacts(p => p.find(x => normalizeAddress(x.address) === normalizeAddress(c.address)) ? p : [...p, c]); selectContact(c); setShowNew(false); }} />}
      {showGroup && <GroupChatModal contacts={contacts.filter(c => !c.isAI && !c.isGroup)} myAddress={wallet?.address ?? ''} onClose={() => setShowGroup(false)} onCreate={(g) => { setContacts(p => [g, ...p]); selectContact(g); }} />}
      {manageGroupContact && <GroupChatModal contacts={[]} myAddress={wallet?.address ?? ''} existingGroup={manageGroupContact} onClose={() => setManageGroupContact(null)} onCreate={() => {}} />}
      {editContact && <EditContactModal contact={editContact} onClose={() => setEditContact(null)} onSave={(u) => { setContacts(p => p.map(c => c.id === editContact.id ? { ...c, ...u } : c)); if (active?.id === editContact.id) setActiveAndRef({ ...active, ...u }); setEditContact(null); }} onDelete={() => { setContacts(p => p.filter(c => c.id !== editContact.id)); if (active?.id === editContact.id) setActiveAndRef(null); setEditContact(null); }} />}
      {showSearch && <SearchOverlay contacts={contacts} msgs={msgs} onClose={() => setShowSearch(false)} onNavigate={(cId) => { const c = contacts.find(x => x.id === cId); if (c) { selectContact(c); setShowSearch(false); }}} />}
      <NotificationToast notifs={notifs} onDismiss={(id) => setNotifs(p => p.filter(n => n.id !== id))} onSelect={(n) => { selectContact(n.contact); setNotifs(p => p.filter(x => x.id !== n.id)); }} />
    </AppContext.Provider>
  );
}

declare global {
  interface Window {
    ethereum?: { request: (args: { method: string; params?: unknown[] }) => Promise<unknown>; isMetaMask?: boolean; };
    _PMT_AI_KEY?: string;
  }
}
