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
          // Load full wallet data if saved
          const saved = localStorage.getItem(`pmt_account_${address.toLowerCase()}`);
          if (saved) {
            const acc = JSON.parse(saved);
            return { address, balance: '0.000', network: 'PMChain', username: acc.username || username };
          }
          return { address, balance: '0.000', network: 'PMChain', username };
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
  const [msgs, setMsgs] = useState<MsgsMap>({});
  const [active, setActive] = useState<Contact | null>(null);
  const activeRef = useRef<Contact | null>(null);
  const walletRef = useRef<Wallet | null>(null);
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
    if (Object.keys(savedMsgs).length > 0) {
      const normalized: MsgsMap = {};
      Object.entries(savedMsgs).forEach(([addr, list]) => {
        const key = addr.toLowerCase();
        normalized[key] = [...(normalized[key] ?? []), ...(list ?? []).map(m => {
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
    if (!accountKey) return;
    storage.setMsgs(accountKey, msgs);
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
        const enrichedCtx = contacts.map((ct: any) => {
          try {
            const p = JSON.parse(localStorage.getItem(`pmt_profile_${ct.address?.toLowerCase()}`) ?? 'null');
            if (!p) return ct;
            const av = ct.avatarUrl || p.avatarUrl || null;
            return { ...ct, avatarUrl: (av?.startsWith?.('http') ? av : null), bio: ct.bio || p.bio || '' };
          } catch { return ct; }
        });
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
            // Cross-device delivery via relay API
            fetch(`/api/inbox?address=${addr}`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(rxnMsg),
            }).catch(() => {});
          }
          return { ...m, reactions };
        }),
      };
    });
  }, [isDemo]);

  // ── Send ETH/PMT ─────────────────────────────────────────────────────────────
  const sendETH = useCallback(async (contact: Contact, amount: string): Promise<string | null> => {
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
        if (walletRef.current.privateKey) {
          // Internal wallet (created/imported) — sign & send directly, no MetaMask needed
          const provider = new ethers.JsonRpcProvider('https://node1-ipm.dweb3.wtf');
          const signer = new ethers.Wallet(walletRef.current.privateKey, provider);
          const tx = await signer.sendTransaction({ to: addr, value: BigInt(Math.floor(parseFloat(amount) * 1e18)) });
          txHash = tx.hash;
        } else {
          // External wallet (MetaMask) — use injected provider
          const eth = (window as any).ethereum;
          if (!eth) throw new Error('No wallet found. Please install MetaMask.');
          txHash = await eth.request({
            method: 'eth_sendTransaction',
            params: [{ from: walletRef.current.address, to: addr, value: weiHex }],
          }) as string;
        }
        setMsgs(p => ({ ...p, [addr]: (p[addr] ?? []).map(m => m.id === txId ? { ...m, hash: txHash, pending: false, confirms: 1 } : m) }));
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
- The native currency of PMChain
- Used to pay gas fees for all on-chain transactions
- Sent peer-to-peer directly inside PMT-Chat conversations
- Every message sent on PMT-Chat is recorded on-chain as a transaction
- Symbol: PMT
- Wallet addresses are standard Ethereum-format (0x...)

**PMT-Chat features:**
- End-to-end encrypted messages stored on PMChain
- Send PMT tokens directly in chat (↑PMT button)
- Username/password accounts with cloud backup (encrypted, zero-knowledge)
- Cross-device sync via relay
- Voice messages, images, documents, video attachments
- Emoji reactions with ownership (only you can remove your own reaction)
- Group chats
- WalletConnect + MetaMask support
- AI assistant (you!) powered by Claude

**How to add PMChain to MetaMask:**
- Network name: PMChain
- RPC URL: https://node1-ipm.dweb3.wtf
- Chain ID: 290290
- Currency symbol: PMT
- Block explorer: https://explorer.publicmasterpiece.com

Answer questions about PMT, PMChain, the app, or anything else the user asks.`, messages: [...history, { role: 'user', content: userMsg }] }),
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
  }, [isDemo, handleMediaUploaded]);

  const selectContact = useCallback((c: Contact) => {
    if (!c || !c.address) return;
    setActiveAndRef(c);
    const addr = normalizeAddress(c.address);
    setMsgs(p => p[addr] ? p : { ...p, [addr]: [] });
    setContacts(p => p.map(x => x.id === c.id ? { ...x, unread: 0 } : x));
    setMobileSidebarOpen(false);
  }, [setActiveAndRef]);

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
          const netNames: Record<string,string> = {'0x1':'Ethereum','0x89':'Polygon','0xa':'Optimism','0xa4b1':'Arbitrum','0xaa36a7':'Sepolia','0x46df2':'PMChain'};
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
        const enrichedCtx = contacts.map((ct: any) => {
          try {
            const p = JSON.parse(localStorage.getItem(`pmt_profile_${ct.address?.toLowerCase()}`) ?? 'null');
            if (!p) return ct;
            const av = ct.avatarUrl || p.avatarUrl || null;
            return { ...ct, avatarUrl: (av?.startsWith?.('http') ? av : null), bio: ct.bio || p.bio || '' };
          } catch { return ct; }
        });
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
  const handleDemo = useCallback(() => { setIsDemo(true); const w = { address: 'demo', balance: '2.847', network: 'PMChain', username: 'Demo' }; setWallet(w); walletRef.current = w; setScreen('chat'); }, []);
  const handleLogout = useCallback(() => { storage.clearSession(); setWallet(null); walletRef.current = null; setIsDemo(false); setContacts([]); setMsgs({}); setActiveAndRef(null); setScreen('landing'); }, [setActiveAndRef]);

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
          {(active && active.address) ? <ChatErrorBoundary onReset={() => setActiveAndRef(null)}><ChatPanel contact={active} messages={msgs[normalizeAddress(active.address)] ?? []} onSend={sendMsg} onSendETH={sendETH} isDemo={isDemo} myAddress={wallet?.address?.toLowerCase() ?? ''} onReact={(msgId: string, emoji: string) => handleReact(normalizeAddress(active.address), msgId, emoji)} onMediaUploaded={handleMediaUploaded} onOpenSidebar={() => setMobileSidebarOpen(true)} onBack={() => { setActiveAndRef(null); setMobileSidebarOpen(true); }} onViewContact={(c) => setEditContact(c)} /> </ChatErrorBoundary> : <Empty onNew={() => setShowNew(true)} onOpenSidebar={() => setMobileSidebarOpen(true)} />}
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
                    const enrichedC=contacts.map((ct:any)=>{try{const p=JSON.parse(localStorage.getItem(`pmt_profile_${ct.address?.toLowerCase()}`)||'null');return p?{...ct,avatarUrl:ct.avatarUrl||p.avatarUrl||null,bio:ct.bio||p.bio||''}:ct;}catch{return ct;}});
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
                    const enrichedC=contacts.map((ct:any)=>{try{const p=JSON.parse(localStorage.getItem(`pmt_profile_${ct.address?.toLowerCase()}`)||'null');return p?{...ct,avatarUrl:ct.avatarUrl||p.avatarUrl||null,bio:ct.bio||p.bio||''}:ct;}catch{return ct;}});
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
      {showGroup && <GroupChatModal contacts={contacts.filter(c => !c.isAI && !c.isGroup)} onClose={() => setShowGroup(false)} onCreate={(g) => { setContacts(p => [g, ...p]); selectContact(g); setShowGroup(false); }} />}
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
