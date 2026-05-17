// @ts-nocheck
import React, { useState, useEffect, useRef, useCallback } from 'react';
import type { Wallet, Profile, Contact, MsgsMap, Message, Screen } from './types';
import { STORAGE_KEYS } from './types';
import { storage } from './lib/storage';
import { AppContext } from './lib/context';
import { now, rndHash, uid, normalizeAddress, shortHash, nextBlock, b64ToObjectUrl } from './lib/utils';
import { getWalletProvider, ensurePMTchain } from './lib/wallet';

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
import { deriveWalletBackupKey } from './lib/cloudBackup';
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
          // Internal wallets (Create/Import) set pmt_wallet_internal_<addr> permanently
          // External wallets (Connect Wallet) require 24h verification token
          const isInternal = !!localStorage.getItem(`pmt_wallet_internal_${address.toLowerCase()}`);
          if (isInternal) return 'chat';
          // Also check if the account has an encryptedWallet (internal) vs isMetaMask (external)
          try {
            const acctKey = `pmt_account_${username.toLowerCase()}`;
            const acct = localStorage.getItem(acctKey);
            if (acct) {
              const parsed = JSON.parse(acct);
              if (!parsed.isMetaMask && parsed.encryptedWallet) return 'chat';
            }
          } catch {}
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
            return { address, privateKey: acc.isMetaMask ? 'metamask' : pk, balance: '0.000', network: 'PMTchain', username: acc.username || username, ...(acc.isMetaMask ? { isMetaMask: true } : {}) };
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
  const [showWalletRestore, setShowWalletRestore] = useState(false);
  const [walletRestoreMigrate, setWalletRestoreMigrate] = useState<{address:string,username:string,backupKey:string}|null>(null);
  const [walletRestoreErr, setWalletRestoreErr] = useState('');
  const [walletRestorePwd, setWalletRestorePwd] = useState('');
  const [walletRestoreLoading, setWalletRestoreLoading] = useState(false);
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
  // Tracks "last seen" timestamp per contact for unread divider
  const lastSeenRef = useRef<Record<string, number>>({});
  const contactsRef = useRef<Contact[]>([]);
  const msgsRef = useRef<Record<string, any[]>>({});
  const pinnedMsgsRef = useRef<Record<string, any[]>>({});
  // True when user has an internal wallet but pk is missing/stale — SendModal shows password field
  const needsPasswordToSend = React.useMemo(() => {
    const w = wallet;
    if (!w?.username || isDemo) return false;
    // Connect Wallet users (MetaMask/WalletConnect) never need password — they sign via wallet
    if ((w as any).isMetaMask || w.privateKey === 'metamask') return false;
    // Look up account by username OR address
    const accountRaw = localStorage.getItem(`pmt_account_${w.username.toLowerCase()}`)
      || localStorage.getItem(`pmt_account_${w.address?.toLowerCase()}`);
    if (!accountRaw) return !!w.address; // mobile without saved account = needs pk
    try {
      const account = JSON.parse(accountRaw);
      if (account.isMetaMask) return false; // Connect Wallet — never needs password
      if (!account.encryptedWallet || account.needsReimport) return false;
    } catch { return false; }
    // Create Wallet / Import Wallet users always enter password to send — no pk in persistent storage
    return true;
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
  // pinnedMsgs: { [conversationAddr]: Array<{id,text,senderName,time}> }
  // Populated from cloud backup restore — no localStorage
  const [pinnedMsgs, setPinnedMsgs] = useState<Record<string,any[]>>(() => {
    try {
      // One-time migration: read old localStorage format if it exists, then ignore it going forward
      const raw = JSON.parse(localStorage.getItem('pmt_pinned') || '{}');
      localStorage.removeItem('pmt_pinned'); // clean up old key
      const migrated: Record<string,any[]> = {};
      Object.entries(raw).forEach(([k, v]: any) => {
        if (Array.isArray(v)) migrated[k] = v;
        else if (v && v.id) migrated[k] = [v];
      });
      return migrated;
    } catch { return {}; }
  });
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
  const [chatWallpaper, setChatWallpaper] = useState<string>(() => { try { return localStorage.getItem('chatWallpaper') || 'none'; } catch { return 'none'; } });
  const handleSetWallpaper = (wp: string) => {
    setChatWallpaper(wp);
    try { localStorage.setItem('chatWallpaper', wp); } catch {}
    // Immediately persist to cloud backup
    const pwd = sessionPasswordRef.current;
    if (pwd && !isDemo) setTimeout(() => runBackup(pwd).catch(() => {}), 500);
  };

  useEffect(() => {
    walletRef.current = wallet;
    profileRef.current = profile;
  }, [wallet, profile]);

  useEffect(() => { contactsRef.current = contacts; }, [contacts]);
  useEffect(() => { msgsRef.current = msgs; }, [msgs]);
  useEffect(() => { pinnedMsgsRef.current = pinnedMsgs; }, [pinnedMsgs]);

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



  // Listen for chain changes and update wallet.network in real time
  // Only applies to Connect Wallet users (MetaMask/WC) — Create/Import users always use PMTchain
  useEffect(() => {
    if (!wallet?.address || isDemo) return;
    // Create Wallet / Import Wallet users always use PMTchain directly — never update their network tag
    if (!(wallet as any).isMetaMask) return;
    const netNames: Record<string,string> = {
      '0x1':'Ethereum','0x89':'Polygon','0xa':'Optimism',
      '0xa4b1':'Arbitrum','0xaa36a7':'Sepolia','0x46df2':'PMTchain'
    };
    const updateChain = (chainId: string) => {
      const hex = chainId.startsWith('0x') ? chainId : '0x'+parseInt(chainId).toString(16);
      const name = netNames[hex.toLowerCase()] || ('Chain '+parseInt(hex,16));
      setWallet(prev => prev ? { ...prev, network: name, chainId: hex } : prev);
    };
    // Injected wallet (desktop / wallet browser) — listen + read current chain
    const win = (window as any).ethereum;
    if (win?.on) win.on('chainChanged', updateChain);
    // Read initial chain from injected wallet immediately
    if (win?.request) {
      win.request({ method: 'eth_chainId' }).then(updateChain).catch(() => {});
    }
    // Also try EIP-6963 providers (more reliable for multi-wallet setups)
    const announceHandler = (e: any) => {
      const provider = e?.detail?.provider;
      if (provider?.request) {
        provider.request({ method: 'eth_chainId' }).then(updateChain).catch(() => {});
        provider.on?.('chainChanged', updateChain);
      }
    };
    window.addEventListener('eip6963:announceProvider', announceHandler);
    window.dispatchEvent(new Event('eip6963:requestProvider'));
    // WalletConnect provider
    getWCProvider().then(wc => {
      if (wc?.on) {
        wc.on('chainChanged', updateChain);
        // Also set current chain from WC provider
        if (wc.chainId) {
          const hex = '0x'+Number(wc.chainId).toString(16);
          updateChain(hex);
        }
      }
    }).catch(() => {});
    return () => {
      if (win?.removeListener) win.removeListener('chainChanged', updateChain);
      window.removeEventListener('eip6963:announceProvider', announceHandler);
      getWCProvider().then(wc => {
        if (wc?.removeListener) wc.removeListener('chainChanged', updateChain);
      }).catch(() => {});
    };
  }, [wallet?.address, isDemo]);

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
          // Messages already in storage were definitely sent — clear stale pending flag
          if (m.pending && m.out && m.confirms > 0) m = { ...m, pending: false };
          if ((m.type === 'image' || m.type === 'file') && !m.fileUrl) {
            if (m.ipfsCid) m.fileUrl = getIpfsUrl(m.ipfsCid);
            else if (m.b64Data) m.fileUrl = m.b64Data;
          }
          if (m.type === 'voice' && !m.audioUrl) {
            try {
              // Try audioB64 first (present on recipient side after inbox delivery)
              const b64 = (m as any).audioB64 || (m.audioMsgId ? storage.getAudio(m.audioMsgId) : null);
              if (b64) {
                // Preserve full MIME type including codecs for correct Blob type
                const mimeMatch = (b64 as string).match(/^data:([^;]+(?:;codecs=[^;]+)?);base64,/);
                const mime = mimeMatch ? mimeMatch[1] : 'audio/mp4';
                try {
                  const dec = atob((b64 as string).split(',')[1]);
                  const bytes = new Uint8Array(dec.length);
                  for (let i = 0; i < dec.length; i++) bytes[i] = dec.charCodeAt(i);
                  m.audioUrl = URL.createObjectURL(new Blob([bytes], { type: mime }));
                } catch { m.audioUrl = b64ToObjectUrl(b64); }
              }
              else if (m.ipfsCid) m.audioUrl = `https://gateway.pinata.cloud/ipfs/${m.ipfsCid}`;
            } catch {}
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

  // ── Shared backup helper — called by both auto-backup and login-backup effects ──
  const runBackup = useCallback(async (password: string) => {
    const username = walletRef.current?.username;
    const addr = walletRef.current?.address;
    if (!username || !addr || isDemo) return;
    // Snapshot current state via refs to avoid stale closure issues
    const currentMsgs = msgsRef.current ?? {};
    const currentContacts = contactsRef.current ?? [];
    const cleanMsgs: Record<string, object[]> = {};
    Object.entries(currentMsgs).forEach(([a, arr]) => {
      // Keep last 200 messages per contact (was 50 — increased for better coverage)
      cleanMsgs[a] = (arr as any[]).slice(a === AI_AGENT_ADDRESS.toLowerCase() ? -100 : -200).map((m: any) => {
        const { audioUrl, fileUrl, imgData, fileData,
                uploading, _toAddr, audioB64, ...keep } = m;
        // Keep waveform for voice (visualizer needs it after restore)
        if (keep.type !== 'voice') delete keep.waveform;
        // Keep b64Data only for small inline images/files without a Pinata CID
        if (keep.ipfsCid || !keep.b64Data || keep.b64Data.length > 80000) delete keep.b64Data;
        return keep;
      });
    });
    const enrichedCtx = await Promise.all(currentContacts.map(async (ct: any) => {
      try {
        if (ct.avatarUrl?.startsWith('data:')) {
          const { compressAvatarForBackup } = await import('./lib/cloudBackup');
          const thumb = await compressAvatarForBackup(ct.avatarUrl);
          const p = JSON.parse(localStorage.getItem(`pmt_profile_${ct.address?.toLowerCase()}`) ?? 'null');
          return { ...ct, avatarUrl: thumb, bio: ct.bio || p?.bio || '' };
        }
        const p = JSON.parse(localStorage.getItem(`pmt_profile_${ct.address?.toLowerCase()}`) ?? 'null');
        if (!p) return ct;
        const av = ct.avatarUrl || p.avatarUrl || null;
        return { ...ct, avatarUrl: (av?.startsWith?.('http') ? av : null), bio: ct.bio || p.bio || '' };
      } catch { return ct; }
    }));
    const { compressAvatarForBackup } = await import('./lib/cloudBackup');
    const av = profileRef.current?.avatarUrl;
    const compressedAv = av ? await compressAvatarForBackup(av).catch(() => null) : null;
    await saveCloudBackup(username, password, {
      wallet: { address: addr, privateKey: sessionStorage.getItem(`pmt_pk_${addr.toLowerCase()}`) || walletRef.current?.privateKey || '', username },
      contacts: enrichedCtx,
      messages: cleanMsgs,
      profile: profileRef.current ? { ...profileRef.current, avatarUrl: compressedAv } : {},
      pinnedMsgs: (() => {
        const pm: Record<string,any[]> = {};
        Object.entries(pinnedMsgsRef.current || {}).forEach(([k,v]: any) => {
          if (Array.isArray(v) && v.length > 0) pm[k] = v;
        });
        return pm;
      })(),
      settings: {
        chatWallpaper: (() => { try { return localStorage.getItem('chatWallpaper') || null; } catch { return null; } })(),
      },
    });
  }, [isDemo]);

  // Auto cloud backup — immediate for key events, 1s debounce otherwise.
  const prevContactCount = useRef(0);
  const prevMsgCount     = useRef(0);
  const prevProfileRef   = useRef<string>('');
  useEffect(() => {
    if (!wallet?.address || isDemo) return;
    const password = sessionPasswordRef.current;
    if (!password) return;

    const realContacts = contacts.filter((c: any) => !c.isAI);
    const realCount    = realContacts.length;
    const totalMsgs    = Object.values(msgs).reduce((n: number, arr: any) => n + arr.length, 0);
    const profileSig   = JSON.stringify({ name: profile?.name, avatarUrl: profile?.avatarUrl });

    const contactAdded = realCount > prevContactCount.current;
    const msgSent      = totalMsgs > prevMsgCount.current;
    const profileChanged = profileSig !== prevProfileRef.current && prevProfileRef.current !== '';

    prevContactCount.current = realCount;
    prevMsgCount.current     = totalMsgs;
    prevProfileRef.current   = profileSig;

    if (contactAdded || msgSent || profileChanged) {
      // Immediate backup: new contact / message sent / profile updated / group create/join
      runBackup(password).catch(() => {});
      return;
    }
    // Debounced for other changes
    const timer = setTimeout(() => {
      runBackup(password).catch(() => {});
    }, 1000);
    return () => clearTimeout(timer);
  }, [contacts, msgs, profile, chatWallpaper, wallet?.address, wallet?.username, isDemo, runBackup]);

  // On page load: restore sessionPassword so auto-backup works after page refresh
  useEffect(() => {
    if (!wallet?.address || sessionPasswordRef.current) return;
    // Create/Import wallet: restore from sessionStorage (set on login, clears on tab close)
    const stored = sessionStorage.getItem('pmt_bkpwd_' + wallet.address.toLowerCase());
    const key = stored
      || ((wallet as any).isMetaMask && wallet.username
          ? deriveWalletBackupKey(wallet.address, wallet.username)  // sync, no import needed
          : null);
    if (!key) return;
    sessionPasswordRef.current = key;
    // Auto-backup already ran with null password — kick it off now that we have the key
    setTimeout(() => runBackup(key).catch(() => {}), 1000);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wallet?.address]);

  // Startup restore: when app loads with existing Connect Wallet session,
  // try to restore from backup (runs once on mount when wallet.isMetaMask is set)
  useEffect(() => {
    const w = walletRef.current;
    if (!w?.address || !(w as any).isMetaMask || isDemo) return;
    const username = w.username || '';
    if (!username) return;
    // Check if contacts already loaded
    const { storage: st } = require('./lib/storage') as any;
    const ak = `user_${w.address.toLowerCase()}`;
    const existingContacts = st.getContacts(ak).filter((c: any) => !c.isAI);
    if (existingContacts.length > 0) return; // already have data
    // Try derived key first
    const backupKey = deriveWalletBackupKey(w.address, username);
    import('./lib/cloudBackup').then(({ loadCloudBackup }) =>
      loadCloudBackup(username, backupKey).then(backup => {
        if (!backup) return;
        sessionPasswordRef.current = backupKey;
        handleWallet({ ...w, sessionPassword: backupKey,
          restoredContacts: backup.contacts ?? [],
          restoredMessages: backup.messages ?? {},
          restoredProfile:  backup.profile  ?? {},
          restoredPinnedMsgs: backup.pinnedMsgs ?? {},
          restoredSettings: (backup as any).settings ?? {} });
      }).catch(e => {
        if (e?.message === 'WRONG_PASSWORD') {
          setShowWalletRestore(true);
          setWalletRestoreMigrate({ address: w.address, username, backupKey });
        }
      })
    );
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);  // run once on mount only

  // Flush backup when app goes to background or page is hidden/closed.
  // Critical for incognito tabs (no persistent localStorage) and iOS (kills tabs fast).
  useEffect(() => {
    const flush = () => {
      const password = sessionPasswordRef.current;
      if (!password || !wallet?.address || isDemo) return;
      runBackup(password).catch(() => {});
    };
    const onHide = () => { if (document.hidden) flush(); };
    document.addEventListener('visibilitychange', onHide);
    window.addEventListener('pagehide', flush);
    // beforeunload fires on tab close in most browsers (including Chrome incognito)
    window.addEventListener('beforeunload', flush);
    return () => {
      document.removeEventListener('visibilitychange', onHide);
      window.removeEventListener('pagehide', flush);
      window.removeEventListener('beforeunload', flush);
    };
  }, [wallet?.address, isDemo, runBackup]);

  const pushNotif = useCallback((contact: Contact, text: string) => {
    // Skip notification for muted groups
    try {
      const muted: string[] = JSON.parse(localStorage.getItem('pmt_muted_groups') || '[]');
      const gid = (contact as any).groupId || (contact as any).id;
      if (gid && muted.includes(gid)) return;
    } catch {}
    const id = uid();
    const n: Notif = { id, contact, text, ts: Date.now() };
    setNotifs(p => [...p.slice(-4), n]);
    playNotifSound();
    setTimeout(() => setNotifs(p => p.filter(x => x.id !== id)), 5000);
  }, []);

  useInboxPoll({ wallet, isDemo, setMsgs, setContacts, setPinnedMsgs, pushNotif });

  // ── Modal scroll lock — single source of truth ────────────────────────────
  // Adds .modal-open to <body> which CSS uses to lock all background scroll
  const anyModalOpen = !!(showProfile||showSettings||showWallet||showNew||showGroup||
                          manageGroupContact||editContact||showSearch);
  useEffect(() => {
    if (anyModalOpen) {
      document.body.classList.add('modal-open');
    } else {
      document.body.classList.remove('modal-open');
    }
    return () => { document.body.classList.remove('modal-open'); };
  }, [anyModalOpen]);

  // Native non-passive wheel blocker — always preventDefault when modal open, manually scroll modal content
  useEffect(() => {
    const handler = (e: WheelEvent) => {
      if (!document.body.classList.contains('modal-open')) return;
      // Always prevent browser native scroll when modal is open
      e.preventDefault();
      // Manually scroll the innermost scrollable element under the cursor (modal content)
      let node = e.target as Element | null;
      while (node && node !== document.body) {
        const s = getComputedStyle(node);
        if ((s.overflowY === 'auto' || s.overflowY === 'scroll') && node.scrollHeight > node.clientHeight + 2) {
          (node as HTMLElement).scrollTop += e.deltaY;
          return;
        }
        node = node.parentElement;
      }
    };
    document.addEventListener('wheel', handler, { passive: false });
    return () => document.removeEventListener('wheel', handler);
  }, []);

  // ── Fetch fresh group roles when a group chat is opened ──────────────────
  // Ensures promoted admin/mod users see their own role immediately without
  // needing to send a message first.
  useEffect(() => {
    if (!active?.isGroup || !active.groupId || isDemo) return;
    const gid = active.groupId;
    fetch(`/api/groups?id=${gid}`)
      .then(r => r.ok ? r.json() : null)
      .then(d => {
        if (!d) return;
        const fresh: Partial<any> = {};
        if (d.roles)   fresh.roles   = d.roles;
        if (d.members) fresh.members = d.members;
        if (d.bannedMembers) fresh.bannedMembers = d.bannedMembers;
        if (!Object.keys(fresh).length) return;
        setContacts(p => p.map(c => (c.groupId === gid || c.id === gid) ? { ...c, ...fresh } : c));
        // Use functional updater so we never overwrite with stale closure data
        setActive((prev: any) => {
          if (!prev || (prev.groupId !== gid && prev.id !== gid)) return prev;
          const updated = { ...prev, ...fresh };
          activeRef.current = updated;
          return updated;
        });
      })
      .catch(() => {});
  // Re-run whenever the active group changes
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active?.groupId]);

  // ── Profile sync — pull latest profiles from /api/profile (no inbox messages) ──
  // Applies fresh name/bio/avatar to contacts whenever the remote profile is newer.
  const applyRemoteProfile = useCallback((addr: string, remote: any) => {
    if (!remote || !addr) return;
    setContacts((prev: any[]) => prev.map((c: any) => {
      if (normalizeAddress(c.address) !== addr) return c;
      const changed =
        (remote.name && remote.name !== c.name) ||
        (remote.bio  !== undefined && remote.bio !== c.bio) ||
        (remote.avatarUrl && remote.avatarUrl !== c.avatarUrl);
      if (!changed) return c;
      try {
        const key = `pmt_profile_${addr}`;
        const ex  = JSON.parse(localStorage.getItem(key) || '{}');
        localStorage.setItem(key, JSON.stringify({ ...ex, ...remote, address: addr }));
      } catch {}
      return {
        ...c,
        ...(remote.name      ? { name:      remote.name }      : {}),
        ...(remote.avatarUrl ? { avatarUrl: remote.avatarUrl } : {}),
        ...(remote.bio !== undefined ? { bio: remote.bio }     : {}),
      };
    }));
  }, []);

  // Fetch one contact's profile from the API and apply it
  const fetchAndApplyProfile = useCallback((addr: string) => {
    if (!addr || isDemo) return;
    fetch(`/api/profile?address=${addr}`)
      .then(r => r.ok ? r.json() : null)
      .then(data => { if (data) applyRemoteProfile(addr, data); })
      .catch(() => {});
  }, [isDemo, applyRemoteProfile]);

  // On load: fetch all contacts' profiles once
  useEffect(() => {
    if (!wallet?.address || isDemo) return;
    const addrs = contactsRef.current
      .filter((c: any) => !c.isAI && !c.isGroup && c.address)
      .map((c: any) => normalizeAddress(c.address))
      .filter(Boolean);
    addrs.forEach((a: string) => fetchAndApplyProfile(a));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wallet?.address]);

  // Refresh active contact's profile every 3 s, all contacts every 30 s
  useEffect(() => {
    if (!wallet?.address || isDemo) return;
    let tick = 0;
    const id = setInterval(() => {
      tick++;
      // Active contact — every tick (~3 s)
      const active = activeRef.current;
      if (active && !active.isAI && !active.isGroup && active.address) {
        fetchAndApplyProfile(normalizeAddress(active.address));
      }
      // All contacts — every 10 ticks (~30 s)
      if (tick % 10 === 0) {
        contactsRef.current
          .filter((c: any) => !c.isAI && !c.isGroup && c.address)
          .forEach((c: any) => fetchAndApplyProfile(normalizeAddress(c.address)));
      }
    }, 3000);
    return () => clearInterval(id);
  }, [wallet?.address, isDemo, fetchAndApplyProfile]);

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
    setContacts(p => {
      const target = p.find(c => c.id === contact.id);
      if (!target) return p;
      return [{ ...target, preview: `◈ Sent ${amount} PMT` }, ...p.filter(c => c.id !== contact.id)];
    });

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
          const accountRaw = localStorage.getItem(`pmt_account_${username.toLowerCase()}`)
            || localStorage.getItem(`pmt_account_${myAddr}`);
          if (!accountRaw) throw new Error('Wallet not found. Please log out and log back in.');
          const account = JSON.parse(accountRaw);
          if (!account.encryptedWallet) throw new Error('Wallet data missing. Please log out and log back in — your account will be restored automatically.');
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
          const tx = await signer.sendTransaction({ to: addr, value: BigInt(Math.floor(parseFloat(amount) * 1e18)) });
          txHash = tx.hash;
        } else {
          // External wallet — try injected (desktop) then WalletConnect (mobile)
          let eth = await getWalletProvider().catch(() => null) as any;
          const isWC = !eth;
          if (!eth) {
            // Mobile: use WalletConnect provider
            try { eth = await getWCProvider(); } catch {}
          }
          if (!eth) throw new Error('No wallet connected. Please connect your wallet first.');
          // Ensure on PMTchain (auto-add if needed)
          await ensurePMTchain(eth);
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
          } catch { /* use wallet nonce if fetch fails */ }
          const txParams: any = { from: fromAddr, to: addr, value: weiHex };
          if (nonceHex) txParams.nonce = nonceHex;
          // On mobile WalletConnect: open wallet app so user sees the approval popup
          if (isWC && /iPhone|iPad|Android/i.test(navigator.userAgent)) {
            const walletName = (walletRef.current as any)?.walletName || '';
            const schemeMap: Record<string,string> = {
              'MetaMask': 'metamask://', 'SafePal': 'safepalwallet://',
              'Trust': 'trust://', 'Rainbow': 'rainbow://',
            };
            const scheme = schemeMap[walletName] || 'metamask://';
            setTimeout(() => { window.location.href = scheme; }, 300);
          }
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
          await fetch(`/api/inbox?address=${addr}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payNotif),
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
    const isVideo = typeof input === 'object' && input.type === 'video';
    // Text can be plain string OR {type:'text', text:'...', replyTo:...} when replying
    const textContent: string = typeof input === 'string' ? input : ((input as Message).text ?? '');
    const block = nextBlock();
    const inputReplyTo = typeof input === 'string' ? null : (input as Message).replyTo ?? null;
    const msg: Message = (isVoice || isImage || isFile)
      ? { id: uid(), out: true, ...(input as object), type: (input as Message).type, text: '', time: now(), block, confirms: 0, hash: rndHash(), pending: true, ...(inputReplyTo && { replyTo: inputReplyTo }) }
      : { id: uid(), out: true, type: 'text', text: textContent, time: now(), block, confirms: 0, hash: rndHash(), pending: true, ...(inputReplyTo && { replyTo: inputReplyTo }) };
    const addr = normalizeAddress(activeRef.current.address);
    setMsgs(p => ({ ...p, [addr]: [...(p[addr] ?? []), { ...msg, _toAddr: addr }] }));
    // Skip relay for uploading:true messages — local-only previews
    if (typeof input === 'object' && (input as Message).uploading) {
      // Still add to local state (handled below) but do NOT relay
    }
    const preview = isVoice ? '🎙 Voice message' : isImage ? '🖼 Image' : isFile ? `📄 ${(input as Message).fileName ?? 'File'}` : isVideo ? '🎬 Video' : textContent;
    // Update preview and bubble the active contact to top of sidebar
    setContacts(p => {
      const id = activeRef.current?.id;
      const target = p.find(c => c.id === id);
      if (!target) return p;
      return [{ ...target, preview }, ...p.filter(c => c.id !== id)];
    });

    // AI Agent
    if (activeRef.current.isAI && (typeof input === 'string' || (typeof input === 'object' && (input as Message).type === 'text'))) {
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
- Block explorer: https://pmtscan.com
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
- Block explorer: https://pmtscan.com

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
      if ((input as Message).uploading) return; // local preview only — don't relay
      const msgContent = isVoice ? '🎙 Voice message' : isImage ? '🖼 Image' : isFile ? `📄 ${(input as Message).fileName ?? 'File'}` : isVideo ? '🎬 Video' : textContent;
      const msgType = isVoice ? 'voice' : isImage ? 'image' : isFile ? 'file' : isVideo ? 'video' : 'text';
      const replyTo = typeof input === 'string' ? null : (input as Message).replyTo ?? null;
      try {
        const inboxMsg = { id: msg.id, type: msg.type, text: msgContent, ...(replyTo && { replyTo }), ...(isVoice && (() => {
          const vi = input as Message;
          // If no IPFS CID, include the base64 audio directly so recipient can play it cross-device
          const audioB64 = (!vi.ipfsCid && vi.audioMsgId) ? (() => { try { return storage.getAudio(vi.audioMsgId!); } catch { return null; } })() : null;
          const b64 = (vi as any).audioB64 || audioB64; // prefer direct b64 from message
          return { duration: vi.duration, waveform: vi.waveform, audioMsgId: vi.audioMsgId, ipfsCid: vi.ipfsCid, ipfsUrl: vi.ipfsUrl, ...(b64 ? { audioB64: b64 } : {}) };
        })()), ...((isImage || isFile) && { ipfsCid: (input as Message).ipfsCid ?? null, b64Data: (input as Message).b64Data ?? null, mediaMsgId: (input as Message).mediaMsgId, imgMsgId: (input as Message).imgMsgId, fileName: (input as Message).fileName, fileSize: (input as Message).fileSize, mimeType: (input as Message).mimeType }), ...(isVideo && { ipfsCid: (input as Message).ipfsCid ?? null, ipfsUrl: (input as Message).ipfsUrl ?? null, fileName: (input as Message).fileName, fileSize: (input as Message).fileSize, mimeType: (input as Message).mimeType }), from: w.address, fromName: profileRef.current?.name || w.username || w.address.slice(0, 8), fromAvatarUrl: (() => { const av = profileRef.current?.avatarUrl; return av?.startsWith('http') ? av : profileRef.current?._thumbUrl ?? null; })(), fromBio: profileRef.current?.bio ?? '', time: now(), block, hash: msg.hash, confirms: 0, ts: Date.now() };
        const existing: object[] = JSON.parse(localStorage.getItem(STORAGE_KEYS.inbox(toAddr)) ?? '[]');
        localStorage.setItem(STORAGE_KEYS.inbox(toAddr), JSON.stringify([...existing, inboxMsg]));
        // Also deliver via cross-device API relay (fire-and-forget)
        fetch(`/api/inbox?address=${toAddr}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(inboxMsg),
        }).then(r => {
          if (!r.ok) console.warn('[PMT relay] POST failed:', r.status);
          else {
            // Mark as delivered — no longer pending
            setMsgs(p => ({ ...p, [toAddr]: (p[toAddr] ?? []).map(m =>
              m.id === msg.id ? { ...m, pending: false, confirms: 1 } : m
            )}));
          }
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
        // Always use PMTchain local ledger — never ask wallet to sign each message
        // (using eth_sendTransaction per message would trigger a popup for every message)
        const { txHash, chain } = await broadcastMessage({ from: w.address, to: toAddr, msgHash, msgType, blockNum: block, useMetaMask: false, metaMaskProvider: null });
        setMsgs(p => ({ ...p, [toAddr]: (p[toAddr] ?? []).map(m => m.id === msg.id ? { ...m, pending: false, hash: shortHash(txHash), chain, onChain: true } : m) }));
      } catch {}
    }

    // Group message relay — fetch fresh member list from server then send to each member
    if (activeRef.current.isGroup && !isDemo && walletRef.current?.address) {
      const w = walletRef.current;
      const grp = activeRef.current;
      const groupId = grp.groupId || grp.id;
      const msgContent = isVoice ? '🎙 Voice message' : isImage ? '🖼 Image' : isFile ? `📄 ${(input as Message).fileName ?? 'File'}` : isVideo ? '🎬 Video' : input as string;
      const inboxMsg = {
        id: msg.id, type: msg.type, text: msgContent,
        ...((isImage || isFile) && { ipfsCid: (input as Message).ipfsCid ?? null, b64Data: (input as Message).b64Data ?? null, mediaMsgId: (input as Message).mediaMsgId, imgMsgId: (input as Message).imgMsgId, fileName: (input as Message).fileName, fileSize: (input as Message).fileSize, mimeType: (input as Message).mimeType }),
        ...(isVideo && { ipfsCid: (input as Message).ipfsCid ?? null, ipfsUrl: (input as Message).ipfsUrl ?? null, fileName: (input as Message).fileName, fileSize: (input as Message).fileSize, mimeType: (input as Message).mimeType }),
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
        // Determine sender's role: owner > admin > moderator > none
        const myAddrLower = w.address.toLowerCase();
        const grpRoles: Record<string,string> = grpData.roles || {};
        const senderRole = grpData.createdBy?.toLowerCase() === myAddrLower
          ? 'owner'
          : grpRoles[myAddrLower] || null;
        // Attach role to inbox message so receivers can display badge
        if (senderRole) (inboxMsg as any).senderRole = senderRole;
        // Also attach to local message
        if (senderRole) (msg as any).senderRole = senderRole;
        // Update local contact's member list + roles
        if (grpData.members || grpData.roles) {
          setContacts(p => p.map(c => c.groupId === groupId ? {
            ...c,
            ...(grpData.members ? { members: grpData.members } : {}),
            ...(grpData.roles ? { roles: grpData.roles } : {}),
          } : c));
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
        // Store in server-side group history so new members see it
        fetch('/api/groups?action=storeMessage', {
          method: 'POST', headers: {'Content-Type':'application/json'},
          body: JSON.stringify({ groupId, message: inboxMsg }),
        }).catch(() => {});
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
        // Store in history even in fallback path
        fetch('/api/groups?action=storeMessage', {
          method: 'POST', headers: {'Content-Type':'application/json'},
          body: JSON.stringify({ groupId, message: inboxMsg }),
        }).catch(() => {});
      }
    }
  }, [isDemo, handleMediaUploaded]);

  const selectContact = useCallback((c: Contact) => {
    if (!c || !c.address) return;
    setActiveAndRef(c);
    const addr = normalizeAddress(c.address);
    setMsgs(p => p[addr] ? p : { ...p, [addr]: [] });
    setContacts(p => p.map(x => x.id === c.id ? { ...x, unread: 0 } : x));
    // Record when this contact was last opened, so ChatPanel can show unread divider
    // on next open; persist in localStorage so it survives refresh
    const nowTs = Date.now();
    lastSeenRef.current[addr] = nowTs;
    try { localStorage.setItem(`pmt_lastseen_${addr}`, String(nowTs)); } catch {}
    setMobileSidebarOpen(false);

    if (!isDemo && walletRef.current?.address) {
      const myAddr = walletRef.current.address;
      if (c.isGroup) {
        const groupId = c.groupId || c.id?.replace(/^group_/,'');
        // Fetch group data for pinned messages
        fetch(`/api/groups?id=${groupId}`).then(r=>r.json()).then(grpData => {
          if (grpData.pinnedMsgs?.length) {
            setPinnedMsgs(prev => {
              const existing = prev[addr] || [];
              if (existing.length < grpData.pinnedMsgs.length) return { ...prev, [addr]: grpData.pinnedMsgs };
              return prev;
            });
          }
        }).catch(()=>{});

        // Fetch group message history — use msgsRef (always fresh) to check if we need it
        const existingMsgs = msgsRef.current?.[addr] || [];
        if (existingMsgs.length === 0) {
          fetch('/api/groups?action=getHistory', {
            method: 'POST', headers: {'Content-Type':'application/json'},
            body: JSON.stringify({ groupId })
          }).then(r=>r.json()).then(d => {
            if (!d.messages?.length) return;
            setMsgs(prev => {
              if ((prev[addr] || []).length > 0) return prev; // messages arrived in the meantime
              const history = d.messages.map((m: any) => ({
                ...m, out: m.from?.toLowerCase() === myAddr?.toLowerCase(), confirms: 3, pending: false, read: true
              }));
              return { ...prev, [addr]: history };
            });
          }).catch(()=>{});
        }
      } else if (!c.isAI) {
        // 1-on-1: fetch pins from shared Redis key
        fetch(`/api/pins?addr1=${myAddr}&addr2=${addr}`).then(r=>r.json()).then(d => {
          if (d.pins?.length) {
            setPinnedMsgs(prev => {
              const existing = prev[addr] || [];
              if (existing.length < d.pins.length) return { ...prev, [addr]: d.pins };
              return prev;
            });
          }
        }).catch(()=>{});
      }
    }
  }, [setActiveAndRef, isDemo]);

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
                isAnnouncement: g.isAnnouncement || false,
                preview: d.alreadyMember ? 'Already a member' : 'Joined group', unread: 0,
              };
              if (!d.alreadyMember) setContacts(p => { if (p.find(x => x.id === g.id)) return p; return [contact, ...p]; });
              // Ensure server index is updated (in case this is a re-join or first join)
              if (!d.alreadyMember && wallet?.address) {
                fetch('/api/groups?action=join', { method:'POST', headers:{'Content-Type':'application/json'},
                  body: JSON.stringify({ linkId: joinId, address: wallet.address }) }).catch(()=>{});
              }
              selectContact(contact);
            } else { alert('Could not join: ' + d.error); }
          });
        }
      })
      .catch(() => alert('Could not fetch invite link info.'));
  }, [wallet?.address, setContacts, selectContact]);

  // ── Muted groups — stored in localStorage, checked before push notifications ──
  const [mutedGroupIds, setMutedGroupIds] = useState<Set<string>>(() => {
    try { return new Set(JSON.parse(localStorage.getItem('pmt_muted_groups') || '[]')); }
    catch { return new Set(); }
  });
  const handleToggleMute = useCallback((contact: any) => {
    const gid = contact.groupId || contact.id;
    setMutedGroupIds(prev => {
      const next = new Set(prev);
      if (next.has(gid)) next.delete(gid); else next.add(gid);
      try { localStorage.setItem('pmt_muted_groups', JSON.stringify([...next])); } catch {}
      return next;
    });
  }, []);

  // ── Leave group ────────────────────────────────────────────────────────────
  const handleLeaveGroup = useCallback(async (contact: any) => {
    if (!wallet?.address) return;
    const groupId = contact.groupId || contact.id;
    if (!groupId) return;
    try {
      const r = await fetch('/api/groups?action=leave', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ groupId, address: wallet.address }),
      });
      const d = await r.json();
      if (!d.ok) { alert(d.error || 'Could not leave group'); return; }
    } catch (e: any) { alert('Could not leave group: ' + e.message); return; }
    // Navigate away if currently in this group
    if (active && (active.id === contact.id || active.groupId === groupId)) setActiveAndRef(null);
    // Remove from contacts + messages
    setContacts(p => p.filter(c => c.id !== contact.id));
    const addr = normalizeAddress(contact.address);
    setMsgs(p => { const n = { ...p }; delete n[addr]; return n; });
    // Remove from muted list if muted
    setMutedGroupIds(prev => { const next = new Set(prev); next.delete(groupId); return next; });
  }, [wallet?.address, active, setActiveAndRef, setContacts, setMsgs]);

  const handleDeleteMsg = useCallback((msg: any, forAll: boolean) => {
    if (!activeRef.current) return;
    const addr = normalizeAddress(activeRef.current.address);
    // Remove from local state immediately
    setMsgs(prev => ({ ...prev, [addr]: (prev[addr] || []).filter((m: any) => m.id !== msg.id) }));
    if (!forAll || isDemo || !walletRef.current?.address) return;
    const myAddr = walletRef.current.address;
    const deleteNotif = { id: uid(), type: 'delete', deleteMsgId: msg.id, from: myAddr, ts: Date.now() };
    if (!activeRef.current.isGroup) {
      fetch('/api/inbox?address=' + addr, { method:'POST', headers:{'Content-Type':'application/json'},
        body: JSON.stringify(deleteNotif) }).catch(() => {});
    } else {
      const grp = activeRef.current;
      const groupId = grp.groupId || grp.id;
      const members: string[] = (grp.members || []).map((m: any) => normalizeAddress(typeof m === 'string' ? m : ''));
      members.filter(m => m !== normalizeAddress(myAddr)).forEach(m => {
        fetch('/api/inbox?address=' + m, { method:'POST', headers:{'Content-Type':'application/json'},
          body: JSON.stringify({ ...deleteNotif, groupId }) }).catch(() => {});
      });
    }
  }, [isDemo]);

  const handleEditMsg = useCallback((msg: any, newText: string) => {
    if (!activeRef.current || !walletRef.current?.address) return;
    const addr = normalizeAddress(activeRef.current.address);
    const editedAt = Date.now();

    // Update locally
    setMsgs(prev => ({
      ...prev,
      [addr]: (prev[addr] || []).map(m =>
        m.id === msg.id ? { ...m, text: newText, editedAt } : m
      ),
    }));

    if (isDemo) return;

    const myAddr = walletRef.current.address;
    const editSync = {
      id: uid(), type: 'edit', editMsgId: msg.id, editText: newText, editedAt,
      from: myAddr, ts: Date.now(),
    };

    if (!activeRef.current.isGroup) {
      fetch('/api/inbox?address=' + addr, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(editSync),
      }).catch(() => {});
    } else {
      const grp = activeRef.current;
      const groupId = grp.groupId || grp.id;
      const members: string[] = (grp.members || []).map((m: any) => normalizeAddress(typeof m === 'string' ? m : ''));
      members.filter(m => m !== normalizeAddress(myAddr)).forEach(m => {
        fetch('/api/inbox?address=' + m, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ...editSync, groupId }),
        }).catch(() => {});
      });
    }
  }, [isDemo]);

  const handleForwardMsg = useCallback((msg: any, targetContact: Contact) => {
    if (!walletRef.current?.address || !targetContact?.address) return;
    const addr = normalizeAddress(targetContact.address);
    const myAddr = walletRef.current.address;
    const fwdId = uid();
    const forwarded: Message = {
      id: fwdId,
      out: true,
      type: msg.type || 'text',
      text: msg.text || '',
      time: now(),
      block: nextBlock(),
      confirms: 0,
      hash: rndHash(),
      pending: false,
      forwarded: true,
      // Preserve media for image/file/voice forwards
      ...(msg.type === 'image' && { b64Data: msg.b64Data, fileUrl: msg.fileUrl, ipfsCid: msg.ipfsCid, mediaMsgId: fwdId, mimeType: msg.mimeType }),
      ...(msg.type === 'file'  && { b64Data: msg.b64Data, fileUrl: msg.fileUrl, fileName: msg.fileName, fileSize: msg.fileSize, mimeType: msg.mimeType, mediaMsgId: fwdId }),
      ...(msg.type === 'voice' && { audioUrl: msg.audioUrl, audioB64: msg.audioB64, duration: msg.duration, waveform: msg.waveform, ipfsCid: msg.ipfsCid, ipfsUrl: msg.ipfsUrl }),
    };
    setMsgs(prev => ({ ...prev, [addr]: [...(prev[addr] ?? []), forwarded] }));
    if (!isDemo && walletRef.current?.address) {
      const inboxMsg = {
        ...forwarded,
        from: myAddr,
        fromName: profileRef.current?.name || walletRef.current?.username || myAddr.slice(0, 8),
        fromAvatarUrl: (() => { const av = profileRef.current?.avatarUrl; return av?.startsWith('http') ? av : (profileRef.current as any)?._thumbUrl ?? null; })(),
        ts: Date.now(),
      };

      if (targetContact.isGroup) {
        // Group forward: relay to each member individually (same as sendMsg group path)
        const groupId = targetContact.groupId || targetContact.id;
        const groupInboxMsg = { ...inboxMsg, groupId, groupName: targetContact.name, groupAvatarUrl: (targetContact as any).avatarUrl ?? null };
        const relayToMembers = (members: string[]) => {
          members.forEach(memberAddr => {
            if (!memberAddr || normalizeAddress(memberAddr) === normalizeAddress(myAddr)) return;
            fetch(`/api/inbox?address=${normalizeAddress(memberAddr)}`, {
              method: 'POST', headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(groupInboxMsg),
            }).catch(() => {});
          });
          fetch('/api/groups?action=storeMessage', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ groupId, message: groupInboxMsg }),
          }).catch(() => {});
        };
        // Fetch fresh member list then fall back to local
        fetch(`/api/groups?id=${groupId}`)
          .then(r => r.json())
          .then(grpData => relayToMembers((grpData.members ?? targetContact.members ?? []).map((m: any) => typeof m === 'string' ? m : '')))
          .catch(() => relayToMembers((targetContact.members ?? []).map((m: any) => typeof m === 'string' ? m : '')));
      } else {
        // 1-on-1 forward
        fetch(`/api/inbox?address=${addr}`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(inboxMsg),
        }).catch(() => {});
      }
    }
    // Navigate to the conversation where the message was forwarded
    setActiveAndRef(targetContact);
  }, [isDemo, setActiveAndRef]);

  // Pin/unpin with choice: 'just_me' | 'for_both'
  // forBoth defaults to true for groups, optional for 1-on-1
  const handlePin = useCallback(async (msg: any, forBoth?: boolean) => {
    if (!activeRef.current) return;
    const grp = activeRef.current;
    const addr = normalizeAddress(grp.address);
    const currentPins: any[] = pinnedMsgs[addr] || [];
    const alreadyPinned = currentPins.some(p => p.id === msg.id);
    const myAddr = walletRef.current?.address?.toLowerCase() || '';
    const pin = grp.isGroup ? true : (forBoth ?? true); // groups always pin for all

    // Store pinnedBy so only pinner can unpin
    // Extract the original message send time for sorting
    // uid() = 'u' + Date.now() + random, so parse the timestamp from the id
    const msgTs: number = msg.ts
      || (msg.id?.startsWith('u') ? parseInt(msg.id.slice(1)) : 0)
      || 0;

    const newPins = alreadyPinned
      ? currentPins.filter(p => p.id !== msg.id)
      : [...currentPins, { id: msg.id, text: msg.text || '', senderName: msg.senderName || '', time: msg.time, msgTs, pinnedAt: Date.now(), pinnedBy: myAddr }]
          .sort((a, b) => (a.msgTs || a.pinnedAt || 0) - (b.msgTs || b.pinnedAt || 0)); // sort by original send time

    setPinnedMsgs(prev => ({ ...prev, [addr]: newPins }));
    setMsgs(prev => ({
      ...prev,
      [addr]: (prev[addr] || []).map(m => m.id === msg.id ? { ...m, pinned: !alreadyPinned } : m)
    }));

    // Persist pin to server so all users/devices always see it
    if (!isDemo && walletRef.current?.address) {
      const myAddr = walletRef.current.address;
      if (grp.isGroup) {
        const groupId = grp.groupId || grp.id;
        if (alreadyPinned) {
          fetch('/api/groups?action=unpinMsg', { method:'POST', headers:{'Content-Type':'application/json'},
            body: JSON.stringify({ groupId, pinId: msg.id, requestedBy: myAddr }) }).catch(()=>{});
        } else {
          const pin = newPins.find(p => p.id === msg.id);
          if (pin) fetch('/api/groups?action=pinMsg', { method:'POST', headers:{'Content-Type':'application/json'},
            body: JSON.stringify({ groupId, pin, requestedBy: myAddr }) }).catch(()=>{});
        }
      } else {
        // 1-on-1: store in shared Redis key
        const contactAddr = normalizeAddress(grp.address);
        if (alreadyPinned) {
          fetch('/api/pins', { method:'POST', headers:{'Content-Type':'application/json'},
            body: JSON.stringify({ addr1: myAddr, addr2: contactAddr, unpinId: msg.id }) }).catch(()=>{});
        } else {
          const pin = newPins.find(p => p.id === msg.id);
          if (pin) fetch('/api/pins', { method:'POST', headers:{'Content-Type':'application/json'},
            body: JSON.stringify({ addr1: myAddr, addr2: contactAddr, pin }) }).catch(()=>{});
        }
      }
    }

    if (!pin || isDemo || !walletRef.current?.address) return;

    const pinnerName = profileRef.current?.name || walletRef.current?.username || myAddr.slice(0,8);
    const systemMsg = {
      id: uid(), type: 'pin', pinMsgId: msg.id, pinMsgText: msg.text || '',
      pinAction: alreadyPinned ? 'unpin' : 'pin',
      pinnedBy: myAddr, msgTs,
      from: walletRef.current.address, ts: Date.now(),
    };

    if (!grp.isGroup) {
      // 1-on-1: silent pin sync to contact
      fetch('/api/inbox?address=' + addr, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(systemMsg),
      }).catch(() => {});
    } else {
      // Group: always send silent pin sync; notify members only if forBoth=true
      const groupId = grp.groupId || grp.id;
      const members: string[] = (grp.members || []).map((m: any) => normalizeAddress(typeof m === 'string' ? m : ''));
      const otherMembers = members.filter(m => m !== normalizeAddress(walletRef.current!.address));
      otherMembers.forEach(m => {
        fetch('/api/inbox?address=' + m, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ...systemMsg, groupId }),
        }).catch(() => {});
      });
      // Push notification only (no chat message) when "Pin + notify" chosen
      if (!alreadyPinned && pin) {
        const pushMsg = {
          id: uid(), type: 'pin_notify',
          text: `📌 ${pinnerName} pinned a message`,
          from: walletRef.current.address, ts: Date.now(),
          groupId, groupName: grp.name,
        };
        otherMembers.forEach(m => {
          fetch('/api/inbox?address=' + m, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(pushMsg),
          }).catch(() => {});
        });
      }
    }
  }, [isDemo, pinnedMsgs]);

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

    // Generate 120x120 thumbnail then publish to profile API (no inbox messages)
    const publishProfile = (thumbUrl?: string) => {
      const addr = walletRef.current?.address;
      if (!addr || isDemo) return;
      const avatarForRelay = thumbUrl || (np.avatarUrl?.startsWith('http') ? np.avatarUrl : null);
      fetch('/api/profile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ address: addr, name: np.name || '', bio: np.bio || '', avatarUrl: avatarForRelay }),
      }).catch(() => {});
    };

    if (np.avatarUrl?.startsWith('data:')) {
      const img = new Image();
      img.onload = () => {
        const s  = Math.min(img.width, img.height);
        const sx = (img.width  - s) / 2;
        const sy = (img.height - s) / 2;
        const drawSquare = (size: number, quality: number) => {
          const c = document.createElement('canvas');
          c.width = size; c.height = size;
          const ctx = c.getContext('2d');
          if (!ctx) return null;
          ctx.imageSmoothingEnabled = true;
          ctx.imageSmoothingQuality = 'high';
          ctx.drawImage(img, sx, sy, s, s, 0, 0, size, size);
          return c.toDataURL('image/jpeg', quality);
        };
        // 120×120 for relay message embedding (small, fast to transfer)
        const thumbUrl  = drawSquare(120, 0.92);
        // 400×400 for profile API (sharp at all display sizes up to 400px)
        const largeUrl  = drawSquare(400, 0.92);
        const updated: Profile = { ...np, _thumbUrl: thumbUrl ?? undefined } as any;
        profileRef.current = updated;
        if (accountKey) storage.setProfile(accountKey, updated);
        // Publish large version to profile API so other users see it sharp
        publishProfile(largeUrl ?? thumbUrl ?? undefined);
      };
      img.onerror = () => publishProfile();
      img.src = np.avatarUrl;
    } else {
      publishProfile();
    }
  }, [accountKey, isDemo]);

  const handleWalletConnect = async () => {
    setWcErr(null);
    setWcConnecting(true);
    try {
      // Try any EIP-6963 wallet (MetaMask, Coinbase, Rainbow, Trust, etc.)
      const injected = await getWalletProvider();
      if (injected) {
        const perms = await (injected as any).request({method:'wallet_requestPermissions', params:[{eth_accounts:{}}]}).catch(() => null);
        let accounts: string[] = [];
        if (perms) {
          const perm = perms?.find((p: any) => p.parentCapability === 'eth_accounts');
          accounts = perm?.caveats?.find((cv: any) => cv.type === 'restrictReturnedAccounts')?.value || [];
        }
        if (!accounts.length) accounts = await (injected as any).request({method:'eth_requestAccounts'});
        if (accounts.length) {
          const chainId = await (injected as any).request({method:'eth_chainId'});
          const balHex = await (injected as any).request({method:'eth_getBalance',params:[accounts[0],'latest']}).catch(()=>'0x0');
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

  const handleWallet = useCallback((w: Wallet & { restoredContacts?: any[]; restoredMessages?: Record<string,any[]>; restoredProfile?: any; sessionPassword?: string; restoredPinnedMsgs?: Record<string,any[]> }) => {
    // Write restored data to storage BEFORE setWallet so the accountKey useEffect
    // finds them and doesn't overwrite with AI_AGENT_CONTACT only
    if (w.address && w.restoredContacts !== undefined) {
      const ak = normalizeAddress(w.address);
      storage.setContacts(ak, w.restoredContacts.length ? w.restoredContacts : [AI_AGENT_CONTACT]);
      if (w.restoredMessages) storage.setMsgs(ak, w.restoredMessages);
    }
    setWallet(w);
    walletRef.current = w;
    // Keep password in memory for auto cloud backup (never stored to localStorage)
    if (w.sessionPassword) {
      sessionPasswordRef.current = w.sessionPassword;
      // Persist for page refreshes (sessionStorage clears on tab close, not on refresh)
      if (w.address) {
        sessionStorage.setItem('pmt_bkpwd_' + w.address.toLowerCase(), w.sessionPassword);
      }
    }
    // Backup is source of truth — always apply restored data when provided
    if (w.restoredPinnedMsgs) {
      setPinnedMsgs(prev => ({ ...prev, ...w.restoredPinnedMsgs }));
    }
    if (w.restoredContacts !== undefined) {
      const hasAI = w.restoredContacts.some((c: any) => c.isAI);
      const ctx = hasAI ? w.restoredContacts : [AI_AGENT_CONTACT, ...w.restoredContacts];
      setContacts(ctx);
      // Restore contact profile cache
      ctx.forEach((ct: any) => {
        if (!ct.address || ct.isAI || ct.isGroup) return;
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
      // Also recover any groups from server that may be missing from backup
      // (happens when iOS clears sessionStorage and auto-backup stops running)
      if (w.address && !(w as any).isDemo) {
        setTimeout(() => {
          fetch('/api/groups?action=getMyGroups', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ address: w.address }),
          }).then(r => r.json()).then(d => {
            if (!d.groups?.length) return;
            setContacts(prev => {
              const existingIds = new Set(prev.map((c: any) => c.id || c.groupId));
              const missing = d.groups.filter((g: any) => !existingIds.has(g.id));
              if (!missing.length) return prev;
              const newContacts = missing.map((g: any) => ({
                id: g.id, address: `group_${g.id}`, name: g.name, bio: g.bio || '',
                avatarUrl: g.avatarUrl || null, avatar: g.name.slice(0, 2).toUpperCase(),
                color: '#a78bfa', bg: '#1e1b30', online: false, isGroup: true,
                members: g.members || [], groupId: g.id, createdBy: g.createdBy,
                isAnnouncement: g.isAnnouncement || false,
                roles: g.roles || {}, bannedMembers: g.bannedMembers || [],
                preview: 'Group', unread: 0,
              }));
              return [...newContacts, ...prev];
            });
          }).catch(() => {});
        }, 1500); // slight delay to not block the initial render
      }
    }
    if (w.restoredMessages !== undefined) {
      setMsgs(w.restoredMessages as MsgsMap);
    }
    if ((w as any).restoredSettings?.chatWallpaper) {
      const wp = (w as any).restoredSettings.chatWallpaper;
      try { localStorage.setItem('chatWallpaper', wp); } catch {}
      setChatWallpaper(wp);
    }
    if (w.restoredProfile) {
      setProfile(w.restoredProfile as Profile);
      if (w.address) {
        try {
          localStorage.setItem(`pmt_profile_${w.address.toLowerCase()}`,
            JSON.stringify({ ...w.restoredProfile, address: w.address.toLowerCase() }));
        } catch { /* ignore */ }
      }
    }
    // Internal wallets (Create/Import) — never need verify screen
    // Only show verify for explicit MetaMask/external wallets (privateKey === 'metamask')
    const isExternalWallet = w.privateKey === 'metamask' || (w as any).isMetaMask === true;
    if (!isExternalWallet && w.address) {
      // Mark as internal permanently so page reloads skip verify
      localStorage.setItem(`pmt_wallet_internal_${w.address.toLowerCase()}`, '1');
      setScreen('chat');
      if (window.innerWidth < 768) setMobileSidebarOpen(true);
    } else if (w.address) {
      // External wallet (Connect Wallet) — verify every 24h immediately after login
      const verifyTs = localStorage.getItem(`pmt_verify_${w.address.toLowerCase()}`);
      const isValid = verifyTs && (Date.now() - parseInt(verifyTs)) < 86400000;
      if (isValid) {
        setScreen('chat');
        if (window.innerWidth < 768) setMobileSidebarOpen(true);
      } else {
        setScreen('verify');
      }
    } else {
      setScreen('chat');
      if (window.innerWidth < 768) setMobileSidebarOpen(true);
    }
  }, [setContacts, setMsgs]);

  // On mount: if session was restored from localStorage but no password in memory,
  // check if cloud backup exists — if not, show one-time password prompt to create it
  useEffect(() => {
    if (!wallet?.address || isDemo || !wallet.username) return;
    if (sessionPasswordRef.current) return; // already have password from fresh login
    const uname = wallet.username.toLowerCase();
    fetch(`/api/auth?username=${encodeURIComponent(uname)}`)
      .then(r => r.json())
      .then(record => {
        // Only prompt if no backup exists yet — if a backup already exists (e.g. with
        // old password), the migration modal handles it; don't show this and confuse the user.
        if (record?.encryptedBackup) return;
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

  // Trigger a backup 3s after login so the initial state is saved immediately
  useEffect(() => {
    if (!wallet?.address || isDemo || !sessionPasswordRef.current) return;
    if (!wallet.username) return;
    const password = sessionPasswordRef.current;
    const timer = setTimeout(() => {
      runBackup(password).catch(() => { /* silent */ });
    }, 1000);
    return () => clearTimeout(timer);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wallet?.address]);
  const handleDemo = useCallback(() => { setIsDemo(true); const w = { address: 'demo', balance: '2.847', network: 'PMTchain', username: 'Demo' }; setWallet(w); walletRef.current = w; setScreen('chat'); }, []);
  const handleChangePassword = useCallback(async (currentPassword: string, newPassword: string) => {
    const w = walletRef.current;
    if (!w?.address || !w?.username) throw new Error('Not logged in');

    const { PMTAuth } = await import('./lib/auth');
    const { saveCloudBackup } = await import('./lib/cloudBackup');

    // Get private key — prefer sessionStorage (most reliable source) then wallet state
    const pk = sessionStorage.getItem(`pmt_pk_${w.address.toLowerCase()}`) || w.privateKey || '';
    if (!pk) throw new Error('Private key not available. Please log out and log back in first.');

    // 1. Verify current password matches the server record
    const uname = w.username.toLowerCase();
    const serverRes = await fetch(`/api/auth?username=${encodeURIComponent(uname)}`);
    if (!serverRes.ok) throw new Error('Could not reach server');
    const serverRec = await serverRes.json();
    const { hash: curHash } = await PMTAuth.hashPassword(currentPassword, serverRec.salt);
    if (curHash !== serverRec.passwordHash) throw new Error('Current password is incorrect');

    // 2. Re-encrypt backup with new password (passes oldPassword so server accepts the re-key)
    const currentContacts = contactsRef.current ?? [];
    const currentMsgs = msgsRef.current ?? {};
    const cleanMsgs: Record<string, object[]> = {};
    Object.entries(currentMsgs).forEach(([a, arr]: any) => {
      cleanMsgs[a] = arr.slice(-200).map((m: any) => {
        const { b64Data, audioUrl, fileUrl, imgData, fileData, uploading, _toAddr, waveform, audioB64, ...keep } = m;
        return keep;
      });
    });
    await saveCloudBackup(uname, newPassword, {
      wallet: { address: w.address, privateKey: pk, username: uname },
      contacts: currentContacts.filter((c: any) => !c.isAI),
      messages: cleanMsgs,
      profile: profileRef.current ?? {},
    }, currentPassword);

    // 3. Update local account record with new password hash + re-encrypted wallet
    const { hash: newHash, salt: newSalt } = await PMTAuth.hashPassword(newPassword);
    const newEw = await PMTAuth.encryptWallet({ address: w.address, privateKey: pk }, newPassword);
    const acctData = { username: uname, address: w.address, passwordHash: newHash, passwordSalt: newSalt, encryptedWallet: newEw };
    localStorage.setItem(`pmt_account_${uname}`, JSON.stringify(acctData));
    localStorage.setItem(`pmt_account_${w.address.toLowerCase()}`, JSON.stringify(acctData));

    // 4. Update in-memory session key and sessionStorage
    sessionPasswordRef.current = newPassword;
    sessionStorage.setItem(`pmt_bkpwd_${w.address.toLowerCase()}`, newPassword);
    // Keep the pk in sessionStorage (unchanged — only the backup password changes)
  }, []);

  const handleLogout = useCallback(() => { if (walletRef.current?.address) { sessionStorage.removeItem('pmt_pk_' + walletRef.current.address.toLowerCase());
        sessionStorage.removeItem('pmt_bkpwd_' + walletRef.current.address.toLowerCase()); } storage.clearSession(); setWallet(null); walletRef.current = null; setIsDemo(false); setContacts([]); setMsgs({}); setActiveAndRef(null); setScreen('landing'); }, [setActiveAndRef]);

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
                // Returning user — auto-restore backup silently in background
                try {
                  const acct = savedAcct ? JSON.parse(savedAcct) : null;
                  const username = acct?.username || addr.slice(0,8);
                  const fullWallet = { ...w, username, isMetaMask: true, walletName: (w as any).walletName || 'WalletConnect' };
                  setWallet(fullWallet);
                  walletRef.current = fullWallet;
                  // Save pmt_account_ with isMetaMask — but NEVER overwrite an internal wallet
                  const existingByAddr = localStorage.getItem('pmt_account_' + addr);
                  const existingByUser = localStorage.getItem('pmt_account_' + username.toLowerCase());
                  const hasInternal = (s: string|null) => { try { return !!JSON.parse(s||'').encryptedWallet; } catch { return false; } };
                  if (!hasInternal(existingByAddr)) {
                    const acctData = { username, address: w.address, isMetaMask: true };
                    localStorage.setItem('pmt_account_' + addr, JSON.stringify(acctData));
                  }
                  if (!hasInternal(existingByUser)) {
                    const acctData = { username, address: w.address, isMetaMask: true };
                    localStorage.setItem('pmt_account_' + username.toLowerCase(), JSON.stringify(acctData));
                  }
                  localStorage.setItem('pmt_session', JSON.stringify({ username, address: w.address }));
                  setScreen('chat');
                  if (window.innerWidth < 768) setMobileSidebarOpen(true);
                  // Auto-restore backup — try derived key first, fall back to migration modal
                  const backupKey = deriveWalletBackupKey(w.address, username);
                  import('./lib/cloudBackup').then(({ loadCloudBackup, saveCloudBackup }) =>
                    loadCloudBackup(username, backupKey).then(backup => {
                      if (!backup) return;
                      sessionPasswordRef.current = backupKey;
                      handleWallet({ ...fullWallet, sessionPassword: backupKey,
                        restoredContacts: backup.contacts ?? [],
                        restoredMessages: backup.messages ?? {},
                        restoredPinnedMsgs: backup.pinnedMsgs ?? {},
                        restoredProfile:  backup.profile  ?? {},
                        restoredSettings: (backup as any).settings ?? {} });
                    }).catch((e) => {
                      // WRONG_PASSWORD = old backup saved with user-set password → show migration modal
                      if (e?.message === 'WRONG_PASSWORD') {
                        setShowWalletRestore(true);
                        setWalletRestoreMigrate({ address: w.address, username, backupKey });
                      }
                    })
                  );
                } catch {
                  setWallet(w); walletRef.current = w; setScreen('metamask_setup');
                }
              } else {
                // Not in localStorage — check server (works on different device/browser)
                setWallet(w); walletRef.current = w;
                fetch(`/api/auth?address=${addr}`)
                  .then(r => r.ok ? r.json() : null)
                  .then(data => {
                    if (data?.username) {
                      // Existing account found on server — auto-restore in background
                      const fw = { ...w, username: data.username, isMetaMask: true, walletName: (w as any).walletName || 'WalletConnect' };
                      setWallet(fw); walletRef.current = fw;
                      const existingByAddr2 = localStorage.getItem('pmt_account_' + addr);
                      const existingByUser2 = localStorage.getItem('pmt_account_' + data.username.toLowerCase());
                      const hasInt2 = (s: string|null) => { try { return !!JSON.parse(s||'').encryptedWallet; } catch { return false; } };
                      if (!hasInt2(existingByAddr2)) localStorage.setItem('pmt_account_' + addr, JSON.stringify({ username: data.username, address: w.address, isMetaMask: true }));
                      if (!hasInt2(existingByUser2)) localStorage.setItem('pmt_account_' + data.username.toLowerCase(), JSON.stringify({ username: data.username, address: w.address, isMetaMask: true }));
                      localStorage.setItem('pmt_session', JSON.stringify({ username: data.username, address: w.address }));
                      setScreen('chat');
                      if (window.innerWidth < 768) setMobileSidebarOpen(true);
                      const backupKey2 = deriveWalletBackupKey(w.address, data.username);
                      import('./lib/cloudBackup').then(({ loadCloudBackup }) =>
                        loadCloudBackup(data.username, backupKey2).then(backup => {
                          if (!backup) return;
                          sessionPasswordRef.current = backupKey2;
                          handleWallet({ ...fw, sessionPassword: backupKey2,
                            restoredContacts: backup.contacts ?? [],
                            restoredMessages: backup.messages ?? {},
                            restoredPinnedMsgs: backup.pinnedMsgs ?? {},
                            restoredProfile:  backup.profile  ?? {},
                            restoredSettings: (backup as any).settings ?? {} });
                        }).catch((e) => {
                          if (e?.message === 'WRONG_PASSWORD') {
                            setShowWalletRestore(true);
                            setWalletRestoreMigrate({ address: w.address, username: data.username, backupKey: backupKey2 });
                          }
                        })
                      );
                    } else {
                      // Truly new user
                      setScreen('metamask_setup');
                    }
                  })
                  .catch(() => setScreen('metamask_setup'));
              }
            }} />;
  if (screen === 'create') return <CreateWalletFlow onWallet={handleWallet} onBack={() => setScreen('landing')} />;
  if (screen === 'import') return <ImportWalletFlow onWallet={handleWallet} onBack={() => setScreen('landing')} />;
  if (screen === 'login') return <LoginScreen onLogin={handleWallet} onBack={() => setScreen('landing')} />;
  if (screen === 'verify') return <VerifyWalletScreen
    address={wallet?.address ?? ''}
    onVerified={() => {
      if (wallet?.address) {
        // Set 24h verification timestamp for external (Connect Wallet) users
        localStorage.setItem(`pmt_verify_${wallet.address.toLowerCase()}`, String(Date.now()));
      }
      setScreen('chat');
      if (window.innerWidth < 768) setMobileSidebarOpen(true);
    }}
    onLogout={() => { storage.clearSession(); setWallet(null); walletRef.current = null; setScreen('landing'); }}
  />;
  if (screen === 'metamask_setup' && wallet) return <SetupMetaMaskFlow wallet={wallet} onDone={(username, password) => { if (password) sessionPasswordRef.current = password; setWallet(w => w ? { ...w, username, sessionPassword: password } : w); setScreen('chat'); }} onSkip={() => {
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

  const doMigrate = async () => {
    if (!walletRestoreMigrate || !walletRestorePwd) return;
    setWalletRestoreLoading(true); setWalletRestoreErr('');
    try {
      const { loadCloudBackup, saveCloudBackup: scb } = await import('./lib/cloudBackup');
      const backup = await loadCloudBackup(walletRestoreMigrate.username, walletRestorePwd);
      if (!backup) { setWalletRestoreErr('Backup not found.'); setWalletRestoreLoading(false); return; }
      // Re-save with derived key, passing old password so server accepts the re-key
      await scb(walletRestoreMigrate.username, walletRestoreMigrate.backupKey, backup, walletRestorePwd);
      sessionPasswordRef.current = walletRestoreMigrate.backupKey;
      handleWallet({ ...wallet!, username: walletRestoreMigrate.username,
        sessionPassword: walletRestoreMigrate.backupKey,
        restoredContacts: backup.contacts ?? [],
        restoredMessages: backup.messages ?? {},
        restoredPinnedMsgs: backup.pinnedMsgs ?? {},
        restoredProfile:  backup.profile  ?? {},
        restoredSettings: (backup as any).settings ?? {} });
      setShowWalletRestore(false); setWalletRestorePwd(''); setWalletRestoreMigrate(null);
    } catch(e:any) {
      setWalletRestoreErr(e.message === 'WRONG_PASSWORD' ? 'Incorrect password.' : 'Migration failed: '+(e.message||'error'));
    } finally { setWalletRestoreLoading(false); }
  };

  return (
    <AppContext.Provider value={{ wallet, profile, isDemo, darkMode, toggleTheme }}>
      <div className="app-grid">
        <div className={`sidebar-overlay${mobileSidebarOpen ? ' visible' : ''}`} onClick={() => setMobileSidebarOpen(false)} />
        <Sidebar contacts={contacts} activeId={active?.id ?? null} wallet={wallet} isDemo={isDemo} profile={profile} mobileOpen={mobileSidebarOpen} onMobileClose={() => setMobileSidebarOpen(false)} onSelect={selectContact} onNew={() => { setShowNew(true); setMobileSidebarOpen(false); }} onNewGroup={() => { setShowGroup(true); setMobileSidebarOpen(false); }} onProfile={() => { setShowProfile(true); setMobileSidebarOpen(false); }} onSettings={() => { setShowSettings(true); setMobileSidebarOpen(false); }} onWallet={() => { setShowWallet(true); setMobileSidebarOpen(false); }} onLogout={handleLogout} onEditContact={setEditContact} onSearch={() => setShowSearch(true)} onLeaveGroup={handleLeaveGroup} onToggleMute={handleToggleMute} mutedGroupIds={mutedGroupIds} />
        <main className="chat-panel">
          {(active && active.address) ? <ChatErrorBoundary onReset={() => setActiveAndRef(null)}><ChatPanel contact={active} chatWallpaper={chatWallpaper} messages={msgs[normalizeAddress(active.address)] ?? []} onSend={sendMsg} onSendETH={sendETH} isDemo={isDemo} myAddress={wallet?.address?.toLowerCase() ?? ''} onReact={(msgId: string, emoji: string) => handleReact(normalizeAddress(active.address), msgId, emoji)} onMediaUploaded={handleMediaUploaded} onOpenSidebar={() => setMobileSidebarOpen(true)} onBack={() => { setActiveAndRef(null); setMobileSidebarOpen(true); }} onViewContact={(c) => setEditContact(c)} onManageGroup={(g) => setManageGroupContact(g)} needsPasswordToSend={needsPasswordToSend} onJoinGroup={handleJoinGroup} onPin={handlePin} pinnedMsgs={active ? (pinnedMsgs[normalizeAddress(active.address)] || []) : []} onDelete={handleDeleteMsg} onEditMsg={handleEditMsg} contacts={contacts} onForwardMsg={handleForwardMsg} lastSeenTs={active ? (lastSeenRef.current[normalizeAddress(active.address)] ?? (()=>{ try { return parseInt(localStorage.getItem(`pmt_lastseen_${normalizeAddress(active.address)}`) || '0'); } catch { return 0; } })()) : 0} /> </ChatErrorBoundary> : <Empty onNew={() => setShowNew(true)} onOpenSidebar={() => setMobileSidebarOpen(true)} />}
        </main>
      </div>
      {showProfile && <ProfileModal profile={{ ...profile, address: wallet?.address ?? null }} onClose={() => setShowProfile(false)} onSave={saveProfile} />}

      {/* One-time migration modal: shown when old backup uses user-set password, not derived key */}
      {showWalletRestore && walletRestoreMigrate && (
        <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,.85)',display:'flex',alignItems:'center',justifyContent:'center',zIndex:9999,padding:16}}>
          <div style={{background:'var(--panel)',border:'1px solid var(--border)',borderRadius:20,padding:'28px 24px',width:'100%',maxWidth:360,display:'flex',flexDirection:'column',gap:16}}>
            <div style={{fontSize:18,fontWeight:700,color:'var(--text)'}}>One-time backup migration</div>
            <div style={{fontSize:13,color:'var(--text2)',lineHeight:1.5}}>
              Your backup was saved with a password. Enter it once to migrate to automatic backup — you'll never need to do this again.
            </div>
            <input type="password" placeholder="Your backup password" value={walletRestorePwd} autoFocus
              onChange={e=>{setWalletRestorePwd(e.target.value);setWalletRestoreErr('');}}
              onKeyDown={async e=>{ if(e.key==='Enter'&&walletRestorePwd) { await doMigrate(); } }}
              style={{background:'var(--surface)',border:'1px solid var(--border)',borderRadius:10,padding:'12px 14px',color:'var(--text)',fontSize:15,outline:'none',width:'100%'}}/>
            {walletRestoreErr&&<div style={{fontSize:12,color:'var(--danger)'}}>{walletRestoreErr}</div>}
            <div style={{display:'flex',gap:10}}>
              <button onClick={()=>{setShowWalletRestore(false);setWalletRestorePwd('');setWalletRestoreMigrate(null);}}
                style={{flex:1,padding:'11px',background:'var(--surface)',border:'1px solid var(--border)',borderRadius:10,color:'var(--text)',cursor:'pointer',fontSize:14}}>Skip</button>
              <button disabled={!walletRestorePwd||walletRestoreLoading} onClick={doMigrate}
                style={{flex:2,padding:'11px',background:'var(--accent)',border:'none',borderRadius:10,color:'#0a0c14',fontWeight:700,cursor:'pointer',fontSize:14,opacity:(!walletRestorePwd||walletRestoreLoading)?0.5:1}}>
                {walletRestoreLoading?'Migrating…':'Migrate Backup'}
              </button>
            </div>
          </div>
        </div>
      )}

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
                  }catch(err:any){setBackupPromptErr(err.message==='Username already taken'?'This account already has a backup with a different password. Try logging out and back in.':err.message||'Failed — check password');}
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
                  }catch(err:any){setBackupPromptErr(err.message==='Username already taken'?'This account already has a backup with a different password. Try logging out and back in.':err.message||'Failed — check password');}
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
      {showSettings && <SettingsModal onClose={() => setShowSettings(false)} darkMode={darkMode} onToggleTheme={toggleTheme} wallet={wallet} isDemo={isDemo} onChangePassword={handleChangePassword} chatWallpaper={chatWallpaper} onSetWallpaper={handleSetWallpaper} />}
      {showWallet && <WalletModal wallet={wallet} isDemo={isDemo} onClose={() => setShowWallet(false)} />}
      {showNew && <NewChatModal onClose={() => setShowNew(false)} onAdd={(c) => { setContacts(p => p.find(x => normalizeAddress(x.address) === normalizeAddress(c.address)) ? p : [...p, c]); selectContact(c); setShowNew(false); }} />}
      {showGroup && <GroupChatModal contacts={contacts.filter(c => !c.isAI && !c.isGroup)} myAddress={wallet?.address ?? ''} onClose={() => setShowGroup(false)} onCreate={(g) => { setContacts(p => [g, ...p]); selectContact(g); }} />}
      {manageGroupContact && <GroupChatModal contacts={contacts.filter(c => !c.isAI)} myAddress={wallet?.address ?? ''} existingGroup={manageGroupContact} onClose={() => setManageGroupContact(null)} onCreate={() => {}} onRolesUpdated={(newRoles: Record<string,string>) => {
        const gid = manageGroupContact.id || manageGroupContact.groupId;
        setContacts(p => p.map(c => (c.groupId === gid || c.id === gid) ? { ...c, roles: newRoles } : c));
        setActive((prev: any) => {
          if (!prev || (prev.groupId !== gid && prev.id !== gid)) return prev;
          const updated = { ...prev, roles: newRoles };
          activeRef.current = updated;
          return updated;
        });
      }} />}
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
