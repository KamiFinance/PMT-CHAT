// @ts-nocheck
import { getWalletProvider, getWalletName } from '../../lib/wallet';
import React, { useState, useEffect, useRef } from 'react';
import QRCode from 'qrcode';
import { getWCProvider, resetWCProvider } from '../../lib/walletconnect';

const isMobile = () => /Android|iPhone|iPad|iPod|Opera Mini|IEMobile|WPDesktop/i.test(navigator.userAgent);

// Wallet icons SVG
const WALLET_ICON = {
  metamask: `<svg viewBox="0 0 40 40"><rect width="40" height="40" rx="12" fill="#F6851B"/><text y="28" x="20" text-anchor="middle" font-size="22">🦊</text></svg>`,
  trust:    `<svg viewBox="0 0 40 40"><rect width="40" height="40" rx="12" fill="#3375BB"/><text y="28" x="20" text-anchor="middle" font-size="22">🛡️</text></svg>`,
  coinbase: `<svg viewBox="0 0 40 40"><rect width="40" height="40" rx="12" fill="#0052FF"/><text y="28" x="20" text-anchor="middle" font-size="20" fill="white" font-weight="bold">C</text></svg>`,
  rainbow:  `<svg viewBox="0 0 40 40"><defs><linearGradient id="rb" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#FF6B6B"/><stop offset=".5" stop-color="#FFBA08"/><stop offset="1" stop-color="#118AB2"/></linearGradient></defs><rect width="40" height="40" rx="12" fill="url(#rb)"/><text y="28" x="20" text-anchor="middle" font-size="22">🌈</text></svg>`,
  phantom:  `<svg viewBox="0 0 40 40"><rect width="40" height="40" rx="12" fill="#AB9FF2"/><text y="28" x="20" text-anchor="middle" font-size="22">👻</text></svg>`,
  imtoken:  `<svg viewBox="0 0 40 40"><rect width="40" height="40" rx="12" fill="#11C4D1"/><text y="26" x="20" text-anchor="middle" font-size="13" fill="white" font-weight="bold">iToken</text></svg>`,
  safepal:  `<svg viewBox="0 0 40 40"><rect width="40" height="40" rx="12" fill="#0F60FF"/><path d="M20 8L30 13L30 22C30 27.5 25.5 32 20 33.5C14.5 32 10 27.5 10 22L10 13Z" fill="none" stroke="white" stroke-width="2.5" stroke-linejoin="round"/><path d="M16 20L19 23L24 17" stroke="white" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" fill="none"/></svg>`,
  tangem:   `<svg viewBox="0 0 40 40"><rect width="40" height="40" rx="12" fill="#1C1C1E"/><rect x="9" y="13" width="22" height="14" rx="3" fill="none" stroke="white" stroke-width="2"/><rect x="12" y="16" width="7" height="4" rx="1" fill="white"/><circle cx="26" cy="21" r="2" fill="#00D4AA"/><circle cx="21" cy="21" r="2" fill="white" opacity="0.5"/></svg>`,
};

// 8 wallets with native WC app schemes (open approval screen, not website)
const WALLETS = [
  { id:'metamask', name:'MetaMask', scheme: u => `metamask://wc?uri=${encodeURIComponent(u)}` },
  { id:'trust',    name:'Trust',    scheme: u => `trust://wc?uri=${encodeURIComponent(u)}` },
  { id:'coinbase', name:'Coinbase', scheme: u => `cbwallet://wc?uri=${encodeURIComponent(u)}` },
  { id:'rainbow',  name:'Rainbow',  scheme: u => `rainbow://wc?uri=${encodeURIComponent(u)}` },
  { id:'phantom',  name:'Phantom',  scheme: u => `phantom://wc?uri=${encodeURIComponent(u)}` },
  { id:'imtoken',  name:'imToken',  scheme: u => `imtokenv2://wc?uri=${encodeURIComponent(u)}` },
  { id:'safepal',  name:'SafePal',  scheme: u => `safepalwallet://wc?uri=${encodeURIComponent(u)}` },
  { id:'tangem',   name:'Tangem',   scheme: u => `tangem://wc?uri=${encodeURIComponent(u)}` },
];

// Desktop WalletConnect QR modal
function WCModal({ uri, onClose }) {
  const canvasRef = useRef(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!uri || !canvasRef.current) return;
    QRCode.toCanvas(canvasRef.current, uri, {
      width: 220, margin: 2,
      color: { dark: '#000000', light: '#ffffff' },
    }).catch(console.error);
  }, [uri]);

  const copy = () => {
    navigator.clipboard.writeText(uri).then(() => { setCopied(true); setTimeout(() => setCopied(false), 2000); });
  };

  return (
    <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,.8)',display:'flex',alignItems:'center',
      justifyContent:'center',zIndex:300,padding:16}} onClick={onClose}>
      <div style={{background:'var(--panel)',border:'1px solid var(--border)',borderRadius:18,padding:'24px 20px',
        width:'100%',maxWidth:380,display:'flex',flexDirection:'column',gap:14}}
        onClick={e=>e.stopPropagation()}>
        <div style={{display:'flex',alignItems:'center',justifyContent:'space-between'}}>
          <div style={{display:'flex',alignItems:'center',gap:10}}>
            <div style={{width:10,height:10,borderRadius:'50%',background:'#3B99FC'}}/>
            <span style={{fontSize:15,fontWeight:600}}>WalletConnect</span>
          </div>
          <button onClick={onClose} style={{background:'none',border:'none',color:'var(--muted)',fontSize:22,cursor:'pointer',lineHeight:1}}>×</button>
        </div>
        <div style={{display:'flex',flexDirection:'column',alignItems:'center',gap:10}}>
          <div style={{background:'#fff',borderRadius:14,padding:12,display:'inline-block',boxShadow:'0 4px 20px rgba(0,0,0,.25)'}}>
            <canvas ref={canvasRef} style={{display:'block'}}/>
          </div>
          <p style={{fontSize:12,color:'var(--text2)',textAlign:'center',lineHeight:1.5,margin:0}}>
            Scan with MetaMask, Trust, Coinbase or any WalletConnect wallet
          </p>
        </div>
        <button onClick={copy}
          style={{padding:'9px',background:'var(--surface)',border:'1px solid var(--border)',
            borderRadius:9,color:copied?'var(--accent3)':'var(--muted)',fontSize:12,cursor:'pointer',fontFamily:'var(--mono)'}}>
          {copied ? '✓ Copied to clipboard' : '⧉ Copy WC URI'}
        </button>
      </div>
    </div>
  );
}

export default function Landing({onDemo,onMetaMask,onCreateWallet,onImportWallet,onLogin}) {
  const [connecting,    setConnecting]    = useState(false);
  const [err,           setErr]           = useState(null);
  const [wallets,       setWallets]       = useState([]);      // EIP-6963 desktop wallets
  const [showPicker,    setShowPicker]    = useState(false);   // desktop EIP-6963 picker
  const [showMobile,    setShowMobile]    = useState(false);   // mobile wallet grid (yellow)
  const [waitingApproval, setWaitingApproval] = useState(false);
  const [wcUri,         setWcUri]         = useState(null);    // desktop WC QR modal (blue)
  const [wcConnecting,  setWcConnecting]  = useState(false);
  const [mobile,        setMobile]        = useState(false);
  const [mobileWcUri,   setMobileWcUri]   = useState<string|null>(null);
  const mobileQrRef                       = useRef<HTMLCanvasElement>(null);
  const [inWalletBrowser, setInWalletBrowser] = useState(false);
  const [walletBrowserName, setWalletBrowserName] = useState('');

  useEffect(() => {
    const mob = isMobile();
    setMobile(mob);
    // Pre-warm WC provider on mount so blue button is instant
    if (mob) getWCProvider().catch(() => {});
    // Detect any available wallet via EIP-6963
    getWalletProvider().then(eth => {
      if (!eth) return;
      if (mob) setInWalletBrowser(true);
      getWalletName().then(name => setWalletBrowserName(name || 'Wallet'));
    });
    if (!mob) {
      const found = [];
      const onAnnounce = e => {
        const { info, provider } = e.detail;
        if (!found.find(w => w.uuid === info.uuid)) { found.push({...info, provider}); setWallets([...found]); }
      };
      window.addEventListener('eip6963:announceProvider', onAnnounce);
      window.dispatchEvent(new Event('eip6963:requestProvider'));
      const t = setTimeout(() => window.dispatchEvent(new Event('eip6963:requestProvider')), 500);
      return () => { window.removeEventListener('eip6963:announceProvider', onAnnounce); clearTimeout(t); };
    }
  }, []);

  // Shared connect-with-provider (injected wallet)
  const connectWith = async (provider, walletName) => {
    setShowPicker(false);
    setErr(null);
    setConnecting(true);
    try {
      // wallet_requestPermissions ALWAYS opens the wallet for the user to actively confirm
      // (eth_accounts is silent; eth_requestAccounts skips if already connected)
      let accounts = [];
      try {
        const perms = await provider.request({method:'wallet_requestPermissions', params:[{eth_accounts:{}}]});
        const perm  = perms?.find(p => p.parentCapability === 'eth_accounts');
        accounts    = perm?.caveats?.find(c => c.type === 'restrictReturnedAccounts')?.value || [];
        if (!accounts.length) accounts = await provider.request({method:'eth_accounts'});
      } catch(permErr) {
        if (permErr.code === 4001) { setErr('Connection rejected.'); setConnecting(false); return; }
        // Fallback for wallets that don't support wallet_requestPermissions
        accounts = await provider.request({method:'eth_requestAccounts'});
      }
      if (!accounts?.length) throw new Error('No accounts returned');
      const chainId  = await provider.request({method:'eth_chainId'});
      const balHex   = await provider.request({method:'eth_getBalance',params:[accounts[0],'latest']}).catch(()=>'0x0');
      const balEth   = (parseInt(balHex, 16) / 1e18).toFixed(4);
      const netNames = {'0x1':'Ethereum','0x89':'Polygon','0xa':'Optimism','0xa4b1':'Arbitrum','0xaa36a7':'Sepolia','0x46df2':'PMTchain'};
      onMetaMask({address:accounts[0], balance:balEth, network:netNames[chainId]||('Chain '+parseInt(chainId,16)), chainId, isMetaMask:true, walletName});
    } catch(e) {
      if (e.code === 4001) setErr('Connection rejected.');
      else if (e.code === -32002) setErr('Wallet has a pending request — open your wallet and approve it.');
      else setErr('Connection failed: ' + (e.message||String(e)));
    } finally { setConnecting(false); }
  };

  // ── YELLOW BUTTON: tap wallet → WC starts → wallet opens to approval ──────
  // Called when user taps a wallet icon — URI already ready from startMobileWC
  const connectViaWallet = (schemeTemplate) => {
    if (!mobileWcUri) return;
    setShowMobile(false);
    setWaitingApproval(true);
    // Keep JS alive with a no-op interval so WebSocket stays connected
    // when iOS puts Safari in background after opening MetaMask
    const keepAlive = setInterval(() => {}, 500);
    setTimeout(() => clearInterval(keepAlive), 60000);
    window.location.href = schemeTemplate(mobileWcUri);
  };

  // Start WC session proactively when wallet grid opens
  const startMobileWC = async () => {
    setMobileWcUri(null);
    setErr(null);
    try {
      // Use pre-warmed provider — only reset if already has connected accounts
      const existing = await getWCProvider().catch(()=>null);
      if (existing?.accounts?.length) resetWCProvider();
      const provider = await getWCProvider();

      const finish = async () => {
        const accounts = provider.accounts || [];
        if (!accounts.length) return;
        setWaitingApproval(false);
        setShowMobile(false);
        setMobileWcUri(null);
        const address = accounts[0], chainId = provider.chainId;
        const chainHex = chainId ? '0x'+chainId.toString(16) : '0x1';
        const netNames = {'0x1':'Ethereum','0x89':'Polygon','0xa':'Optimism','0xa4b1':'Arbitrum','0xaa36a7':'Sepolia','0x46df2':'PMTchain'};
        let balEth = '0.0000';
        try { const h = await provider.request({method:'eth_getBalance',params:[address,'latest']}); balEth=(parseInt(h,16)/1e18).toFixed(4); } catch {}
        onMetaMask({address, balance:balEth, network:netNames[chainHex]||('Chain '+chainId), chainId:chainHex, isMetaMask:true, walletName:'WalletConnect'});
      };

      // Auto-connect when user returns from wallet app
      const onVisible = () => {
        if (document.hidden) return;
        document.removeEventListener('visibilitychange', onVisible);
        setTimeout(finish, 800);
      };
      document.addEventListener('visibilitychange', onVisible);

      provider.once('display_uri', (uri) => {
        setMobileWcUri(uri);
        // Render QR
        setTimeout(() => {
          if (mobileQrRef.current) {
            QRCode.toCanvas(mobileQrRef.current, uri, {
              width: 220, margin: 1, color: { dark: '#000000', light: '#ffffff' }
            }).catch(() => {});
          }
        }, 50);
      });

      provider.connect()
        .then(finish)
        .catch(e => {
          document.removeEventListener('visibilitychange', onVisible);
          setWaitingApproval(false);
          resetWCProvider();
          const msg = e.message||String(e);
          if (!msg.includes('reset') && !msg.includes('closed')) setErr('WalletConnect: '+msg);
        });
    } catch(e) {
      setErr('WalletConnect: '+(e.message||String(e)));
    }
  };



  // ── BLUE BUTTON: WC with QR (desktop) or "Open My Wallet" (mobile) ────────
  const handleWalletConnect = async () => {
    setErr(null);
    setWcConnecting(true);
    try {
      // Use pre-warmed provider if available — only reset if explicitly needed
      const provider = await getWCProvider();
      provider.once('display_uri', (uri) => {
        setWcUri(uri);
        setWcConnecting(false);
      });
      provider.connect().then(async () => {
        setWcUri(null);
        const accounts = provider.accounts || [];
        if (!accounts.length) { setErr('No accounts found.'); resetWCProvider(); return; }
        const address  = accounts[0];
        const chainId  = provider.chainId;
        const chainHex = chainId ? '0x' + chainId.toString(16) : '0x1';
        const netNames = {'0x1':'Ethereum','0x89':'Polygon','0xa':'Optimism','0xa4b1':'Arbitrum','0xaa36a7':'Sepolia','0x46df2':'PMTchain'};
        let balEth = '0.0000';
        try { const h = await provider.request({method:'eth_getBalance',params:[address,'latest']}); balEth=(parseInt(h,16)/1e18).toFixed(4); } catch {}
        onMetaMask({address, balance:balEth, network:netNames[chainHex]||('Chain '+chainId), chainId:chainHex, isMetaMask:true, walletName:'WalletConnect'});
      }).catch(e => {
        setWcUri(null);
        setWcConnecting(false);
        resetWCProvider();
        const msg = e.message||String(e);
        if (msg.includes('User rejected')||msg.includes('rejected')) setErr('Connection rejected.');
        else if (!msg.includes('reset')&&!msg.includes('closed')) setErr('WalletConnect: '+msg);
      });
    } catch(e) {
      setWcConnecting(false);
      resetWCProvider();
      setErr('WalletConnect: '+(e.message||String(e)));
    }
  };

  // ── YELLOW BUTTON click handler ────────────────────────────────────────────
  const handleConnectWallet = () => {
    setErr(null);
    if (mobile) {
      if (inWalletBrowser) {
        // Inside a wallet's in-app browser — connect directly via provider
        getWalletProvider().then(eth => {
          if (eth) connectWith(eth, walletBrowserName || 'Wallet');
          else setShowMobile(true); // fallback: show wallet grid
        });
      } else {
        // Regular mobile browser — show wallet grid and start WC session
        setShowMobile(true);
        startMobileWC();
      }
      return;
    }
    // Desktop: use EIP-6963 discovered wallets
    const evmWallets = wallets.filter(w => !w.name?.toLowerCase().includes('tron'));
    if (evmWallets.length === 1) { connectWith(evmWallets[0].provider, evmWallets[0].name); return; }
    if (evmWallets.length > 1) { setShowPicker(true); return; }
    // No EIP-6963 wallets — try window.ethereum fallback
    getWalletProvider().then(eth => {
      if (eth) connectWith(eth, 'Wallet');
      else setErr('No wallet detected. Install MetaMask or use WalletConnect below.');
    });
  };

  const evmWallets = wallets.filter(w => !w.name?.toLowerCase().includes('tron'));
  const showButtons = !showPicker && !showMobile && !waitingApproval;

  return (
    <div style={{height:'100%',display:'flex',alignItems:'flex-start',justifyContent:'center',
      background:'var(--bg)',padding:'16px',overflowY:'auto'}}>
      <div style={{width:'100%',maxWidth:420,background:'var(--panel)',border:'1px solid var(--border)',
        borderRadius:16,padding:'24px 20px',display:'flex',flexDirection:'column',gap:16,
        marginTop:'auto',marginBottom:'auto'}}>

        {/* Brand */}
        <div style={{display:'flex',alignItems:'center',gap:14}}>
          <img src="/pmt-logo.png" style={{width:52,height:52,borderRadius:14,objectFit:'cover',flexShrink:0}} alt="PM"/>
          <div>
            <div style={{fontSize:22,fontWeight:600}}>PMT-Chat</div>
            <div style={{fontFamily:'var(--mono)',fontSize:10,color:'var(--accent)',letterSpacing:'1.5px',marginTop:2}}>DECENTRALIZED MESSENGER</div>
          </div>
        </div>

        <p style={{fontSize:13.5,color:'var(--text2)',lineHeight:1.6}}>
          End-to-end encrypted messages stored on the blockchain. No servers. No surveillance.
        </p>

        {/* Feature grid */}
        <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:10}}>
          {[['+','E2E Encrypted','AES-256 + wallet keys'],['#','On-Chain','PMTchain'],
            ['*','Self-Custody','Wallet = identity'],['+','Send PMT','Crypto in-chat']].map(([i,t,s])=>(
            <div key={t} style={{display:'flex',alignItems:'flex-start',gap:8,padding:'10px 12px',
              background:'var(--surface)',border:'1px solid var(--border)',borderRadius:10}}>
              <span style={{fontSize:16,flexShrink:0}}>{i}</span>
              <div><div style={{fontSize:12,fontWeight:500}}>{t}</div>
              <div style={{fontSize:11,color:'var(--muted)',marginTop:2}}>{s}</div></div>
            </div>
          ))}
        </div>

        {/* Error */}
        {err && (
          <div style={{background:'rgba(248,113,113,.1)',border:'1px solid rgba(248,113,113,.3)',
            borderRadius:10,padding:'10px 14px',fontSize:12.5,color:'var(--danger)',lineHeight:1.5}}>
            {err}
          </div>
        )}

        {/* ── Desktop EIP-6963 picker ── */}
        {showPicker && !mobile && (
          <div style={{background:'var(--surface)',border:'1px solid var(--border)',borderRadius:12,padding:'14px',display:'flex',flexDirection:'column',gap:8}}>
            <div style={{fontSize:12,color:'var(--muted)',fontFamily:'var(--mono)',letterSpacing:'1px',marginBottom:4}}>SELECT WALLET</div>
            {evmWallets.map(w=>(
              <button key={w.uuid} onClick={()=>connectWith(w.provider,w.name)}
                style={{display:'flex',alignItems:'center',gap:12,padding:'10px 12px',
                  background:'var(--surface2)',border:'1px solid var(--border)',borderRadius:9,
                  color:'var(--text)',cursor:'pointer',fontSize:13,fontWeight:500}}>
                {w.icon&&<img src={w.icon} style={{width:24,height:24,borderRadius:6}} alt={w.name}/>}
                {w.name}
              </button>
            ))}
            <button onClick={()=>setShowPicker(false)}
              style={{padding:'8px',background:'transparent',border:'none',color:'var(--muted)',cursor:'pointer',fontSize:12}}>Cancel</button>
          </div>
        )}

        {/* ── Mobile wallet grid (yellow button) ── */}
        {showMobile && mobile && (
          <div style={{background:'var(--surface)',border:'1px solid var(--border)',borderRadius:12,padding:'16px 14px',display:'flex',flexDirection:'column',gap:12}}>
            <div style={{display:'flex',alignItems:'center',justifyContent:'space-between'}}>
              <div style={{fontSize:14,fontWeight:600,color:'var(--text)'}}>Connect your wallet</div>
              <button onClick={()=>{setShowMobile(false);setMobileWcUri(null);resetWCProvider();}}
                style={{background:'none',border:'none',color:'var(--muted)',fontSize:20,cursor:'pointer',lineHeight:1}}>×</button>
            </div>

            {/* QR code — primary connection method */}
            {mobileWcUri ? (
              <div style={{display:'flex',flexDirection:'column',alignItems:'center',gap:8}}>
                <div style={{background:'#fff',borderRadius:12,padding:10,display:'inline-block',boxShadow:'0 2px 12px rgba(0,0,0,.3)'}}>
                  <canvas ref={mobileQrRef} style={{display:'block'}}/>
                </div>
                <p style={{fontSize:12,color:'var(--text2)',margin:0,textAlign:'center',lineHeight:1.5}}>
                  Open your wallet app → WalletConnect → Scan QR
                </p>
                <button onClick={()=>navigator.clipboard?.writeText(mobileWcUri).catch(()=>{})}
                  style={{fontSize:11,color:'var(--accent)',background:'none',border:'1px solid var(--border)',
                    borderRadius:6,padding:'4px 10px',cursor:'pointer',fontFamily:'var(--mono)'}}>
                  Copy URI
                </button>
              </div>
            ) : (
              <div style={{display:'flex',flexDirection:'column',alignItems:'center',gap:8,padding:'16px 0'}}>
                <div style={{width:200,height:200,background:'var(--surface2)',borderRadius:12,
                  display:'flex',alignItems:'center',justifyContent:'center',flexDirection:'column',gap:10}}>
                  <div style={{width:28,height:28,borderRadius:'50%',border:'3px solid var(--accent)',
                    borderTopColor:'transparent',animation:'spin .8s linear infinite'}}/>
                  <div style={{fontSize:12,color:'var(--muted)'}}>Generating QR...</div>
                </div>
              </div>
            )}

            {/* Wallet shortcut buttons */}
            <div>
              <p style={{fontSize:11,color:'var(--muted)',margin:'0 0 8px',textAlign:'center'}}>
                Or open directly:
              </p>
              <div style={{display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:6}}>
                {WALLETS.map(w=>(
                  <button key={w.id} onClick={()=>connectViaWallet(w.scheme)}
                    disabled={!mobileWcUri}
                    style={{display:'flex',flexDirection:'column',alignItems:'center',gap:4,
                      padding:'8px 4px',background:'var(--surface2)',border:'1px solid var(--border)',
                      borderRadius:10,cursor:mobileWcUri?'pointer':'default',outline:'none',
                      opacity:mobileWcUri?1:0.4,WebkitTapHighlightColor:'transparent'}}>
                    <div style={{width:32,height:32,borderRadius:8,overflow:'hidden'}}
                      dangerouslySetInnerHTML={{__html:WALLET_ICON[w.id]}}/>
                    <span style={{fontSize:9,color:'var(--text2)',fontWeight:500,textAlign:'center'}}>{w.name}</span>
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ── Waiting for approval (after tapping wallet) ── */}
        {waitingApproval && (
          <div style={{background:'var(--surface)',border:'1px solid var(--border)',borderRadius:12,
            padding:'20px 14px',display:'flex',flexDirection:'column',alignItems:'center',gap:14}}>
            <div style={{width:44,height:44,borderRadius:'50%',border:'3px solid var(--accent)',
              borderTopColor:'transparent',animation:'spin .8s linear infinite'}}/>
            <div style={{textAlign:'center'}}>
              <p style={{fontSize:14,fontWeight:600,margin:'0 0 6px',color:'var(--text)'}}>Waiting for approval...</p>
              <p style={{fontSize:12,color:'var(--text2)',margin:0,lineHeight:1.5}}>
                Approve the connection in your wallet, then come back here.
              </p>
            </div>
            <button onClick={()=>{setWaitingApproval(false);setMobileWcUri(null);resetWCProvider();}}
              style={{padding:'8px 18px',background:'transparent',border:'1px solid var(--border)',
                borderRadius:8,color:'var(--muted)',fontSize:12,cursor:'pointer'}}>
              ← Cancel
            </button>
          </div>
        )}

        {/* ── Main buttons ── */}
        {showButtons && (
          <div style={{display:'flex',flexDirection:'column',gap:10}}>
            {/* Yellow: Connect Wallet */}
            <button onClick={handleConnectWallet} disabled={connecting||wcConnecting}
              style={{padding:'13px 20px',background:connecting?'rgba(246,133,27,0.5)':'var(--accent)',
                border:'none',borderRadius:10,color:'#000',fontWeight:600,fontSize:14,
                cursor:(connecting||wcConnecting)?'default':'pointer',
                display:'flex',alignItems:'center',justifyContent:'center',gap:10,transition:'all .2s'}}>
              {connecting
                ?<><span style={{width:14,height:14,border:'2px solid rgba(0,0,0,.3)',borderTopColor:'#000',
                    borderRadius:'50%',display:'inline-block',animation:'spin .7s linear infinite'}}/>Connecting...</>
                :<><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="6" width="20" height="14" rx="2"/><path d="M16 12h2a2 2 0 0 1 0 4h-2v-4z"/><path d="M2 10h20"/></svg>
                {inWalletBrowser?`Connect ${walletBrowserName}`:evmWallets.length>1?`Connect Wallet (${evmWallets.length} found)`:'Connect Wallet'}</>}
            </button>

            {/* Blue: WalletConnect */}
            <button onClick={handleWalletConnect} disabled={connecting||wcConnecting}
              style={{padding:'12px 20px',
                background:wcConnecting?'rgba(59,153,252,.08)':'rgba(59,153,252,.1)',
                border:'1px solid rgba(59,153,252,.35)',borderRadius:10,
                color:'#3B99FC',fontWeight:600,fontSize:13.5,
                cursor:(connecting||wcConnecting)?'default':'pointer',
                display:'flex',alignItems:'center',justifyContent:'center',gap:10,transition:'all .2s'}}>
              {wcConnecting
                ?<><span style={{width:13,height:13,border:'2px solid rgba(59,153,252,.3)',borderTopColor:'#3B99FC',
                    borderRadius:'50%',display:'inline-block',animation:'spin .7s linear infinite'}}/>Connecting...</>
                :<><svg width="17" height="17" viewBox="0 0 40 25" fill="currentColor"><path d="M8.2 7c6.5-6.4 17.1-6.4 23.6 0l.8.8c.3.3.3.9 0 1.2l-2.7 2.7c-.2.2-.4.2-.6 0l-1.1-1.1c-4.5-4.5-11.9-4.5-16.4 0L10.4 12c-.2.2-.4.2-.6 0L7.1 9.3c-.3-.3-.3-.9 0-1.2L8.2 7zM36.3 10.9l2.4 2.4c.3.3.3.9 0 1.2L28.1 25.1c-.3.3-.9.3-1.2 0l-7.2-7.2c-.1-.1-.2-.1-.3 0l-7.2 7.2c-.3.3-.9.3-1.2 0L.4 14.5c-.3-.3-.3-.9 0-1.2l2.4-2.4c.3-.3.9-.3 1.2 0l7.2 7.2c.1.1.2.1.3 0l7.2-7.2c.3-.3.9-.3 1.2 0l7.2 7.2c.1.1.2.1.3 0l7.2-7.2c.3-.4.9-.4 1.3 0z"/></svg>
                WalletConnect</>}
            </button>
          </div>
        )}

        <div style={{display:'flex',alignItems:'center',gap:10}}>
          <div style={{flex:1,height:'1px',background:'var(--border)'}}/>
          <span style={{fontSize:11,color:'var(--muted)'}}>self-custody</span>
          <div style={{flex:1,height:'1px',background:'var(--border)'}}/>
        </div>

        <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:10}}>
          <button onClick={onCreateWallet}
            style={{padding:'12px 10px',background:'var(--surface)',border:'1px solid var(--border)',
              borderRadius:10,color:'var(--text)',fontSize:13,cursor:'pointer',
              display:'flex',flexDirection:'column',alignItems:'center',gap:6}}>
            <span style={{fontSize:22,color:'var(--accent)'}}>+</span>
            <span style={{fontWeight:500}}>Create Wallet</span>
            <span style={{fontSize:10,color:'var(--muted)'}}>New self-custody wallet</span>
          </button>
          <button onClick={onImportWallet}
            style={{padding:'12px 10px',background:'var(--surface)',border:'1px solid var(--border)',
              borderRadius:10,color:'var(--text)',fontSize:13,cursor:'pointer',
              display:'flex',flexDirection:'column',alignItems:'center',gap:6}}>
            <span style={{fontSize:22}}>v</span>
            <span style={{fontWeight:500}}>Import Wallet</span>
            <span style={{fontSize:10,color:'var(--muted)'}}>Seed phrase or key</span>
          </button>
        </div>

        <div style={{display:'flex',alignItems:'center',gap:10}}>
          <div style={{flex:1,height:'1px',background:'var(--border)'}}/>
          <span style={{fontSize:11,color:'var(--muted)'}}>or</span>
          <div style={{flex:1,height:'1px',background:'var(--border)'}}/>
        </div>

        <button onClick={onLogin}
          style={{padding:'11px 20px',background:'var(--surface2)',border:'1px solid var(--accent)',
            borderRadius:10,color:'var(--accent)',fontSize:13.5,fontWeight:500,cursor:'pointer',
            display:'flex',alignItems:'center',justifyContent:'center',gap:8}}>
          Log In with Username
        </button>
        <button onClick={onDemo}
          style={{padding:'11px 20px',background:'transparent',border:'1px solid var(--border)',
            borderRadius:10,color:'var(--text2)',fontSize:13.5,cursor:'pointer',
            display:'flex',alignItems:'center',justifyContent:'center',gap:8}}>
          Try Demo Mode (no wallet required)
        </button>
        <p style={{fontSize:11,color:'var(--muted)',textAlign:'center',lineHeight:1.5}}>Built on PMT Chain | React 18</p>
      </div>

      {/* Desktop WalletConnect QR modal — only for blue button */}
      {wcUri && <WCModal uri={wcUri} onClose={()=>{setWcUri(null);resetWCProvider();}}/>}
    </div>
  );
}
