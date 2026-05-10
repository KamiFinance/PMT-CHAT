// @ts-nocheck
import { getWalletProvider } from '../../lib/wallet';
import React, { useState, useRef } from 'react';
import { getWCProvider, resetWCProvider } from '../../lib/walletconnect';
import QRCode from 'qrcode';

const isMobile = () => /Android|iPhone|iPad|iPod|Opera Mini|IEMobile|WPDesktop/i.test(navigator.userAgent);

// Same wallet list as Landing.tsx
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
const WALLET_ICON = {
  metamask: `<svg viewBox="0 0 40 40"><rect width="40" height="40" rx="12" fill="#F6851B"/><text y="28" x="20" text-anchor="middle" font-size="22">🦊</text></svg>`,
  trust:    `<svg viewBox="0 0 40 40"><rect width="40" height="40" rx="12" fill="#3375BB"/><text y="28" x="20" text-anchor="middle" font-size="22">🛡️</text></svg>`,
  coinbase: `<svg viewBox="0 0 40 40"><rect width="40" height="40" rx="12" fill="#0052FF"/><text y="28" x="20" text-anchor="middle" font-size="20" fill="white" font-weight="bold">C</text></svg>`,
  rainbow:  `<svg viewBox="0 0 40 40"><defs><linearGradient id="rb2" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#FF6B6B"/><stop offset=".5" stop-color="#FFBA08"/><stop offset="1" stop-color="#118AB2"/></linearGradient></defs><rect width="40" height="40" rx="12" fill="url(#rb2)"/><text y="28" x="20" text-anchor="middle" font-size="22">🌈</text></svg>`,
  phantom:  `<svg viewBox="0 0 40 40"><rect width="40" height="40" rx="12" fill="#AB9FF2"/><text y="28" x="20" text-anchor="middle" font-size="22">👻</text></svg>`,
  imtoken:  `<svg viewBox="0 0 40 40"><rect width="40" height="40" rx="12" fill="#11C4D1"/><text y="26" x="20" text-anchor="middle" font-size="13" fill="white" font-weight="bold">iToken</text></svg>`,
  safepal:  `<svg viewBox="0 0 40 40"><rect width="40" height="40" rx="12" fill="#0F60FF"/><path d="M20 8L30 13L30 22C30 27.5 25.5 32 20 33.5C14.5 32 10 27.5 10 22L10 13Z" fill="none" stroke="white" stroke-width="2.5" stroke-linejoin="round"/><path d="M16 20L19 23L24 17" stroke="white" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" fill="none"/></svg>`,
  tangem:   `<svg viewBox="0 0 40 40"><rect width="40" height="40" rx="12" fill="#1C1C1E"/><rect x="9" y="13" width="22" height="14" rx="3" fill="none" stroke="white" stroke-width="2"/><rect x="12" y="16" width="7" height="4" rx="1" fill="white"/><circle cx="26" cy="21" r="2" fill="#00D4AA"/><circle cx="21" cy="21" r="2" fill="white" opacity="0.5"/></svg>`,
};

function WCQRCanvas({ uri }) {
  const ref = useRef(null);
  React.useEffect(() => {
    if (!uri || !ref.current) return;
    QRCode.toCanvas(ref.current, uri, { width: 200, margin: 2, color: { dark: '#000', light: '#fff' } }).catch(() => {});
  }, [uri]);
  return <div style={{ background: '#fff', borderRadius: 12, padding: 10, display: 'inline-block' }}><canvas ref={ref} style={{ display: 'block' }} /></div>;
}

export default function VerifyWalletScreen({ address, onVerified, onLogout }) {
  const [err,          setErr]          = useState(null);
  const [verifying,    setVerifying]    = useState(false);
  const [wcUri,        setWcUri]        = useState(null);
  const [showWallets,  setShowWallets]  = useState(false);
  const [waitApproval, setWaitApproval] = useState(false);

  const mob = isMobile();

  // Start WC session and pass URI to handler
  const startWC = async (onUri) => {
    try {
      resetWCProvider();
      const provider = await getWCProvider();
      provider.once('display_uri', onUri);
      provider.connect().then(() => {
        setWaitApproval(false);
        const accounts = provider.accounts || [];
        if (!accounts.length) { setErr('No accounts found.'); resetWCProvider(); return; }
        const connected = accounts[0].toLowerCase();
        const expected  = address.toLowerCase();
        if (connected !== expected) {
          setErr(`Wrong wallet.\nExpected:  ${expected.slice(0,8)}...${expected.slice(-6)}\nConnected: ${connected.slice(0,8)}...${connected.slice(-6)}\n\nSwitch to the correct account.`);
          resetWCProvider(); return;
        }
        onVerified();
      }).catch(e => {
        setWaitApproval(false); setVerifying(false);
        resetWCProvider();
        const msg = e.message || String(e);
        if (!msg.includes('reset') && !msg.includes('closed') && !msg.includes('rejected')) setErr('WalletConnect: ' + msg);
      });
    } catch (e) {
      setVerifying(false); setWaitApproval(false); resetWCProvider();
      setErr('WalletConnect: ' + (e.message || String(e)));
    }
  };

  // Mobile: open specific wallet app via deep link
  const connectViaWallet = async (schemeTemplate) => {
    setShowWallets(false); setWaitApproval(true); setErr(null);
    await startWC(uri => { window.location.href = schemeTemplate(uri); });
  };

  // Desktop: show QR code
  const connectWCDesktop = async () => {
    setVerifying(true); setErr(null); setWcUri(null);
    await startWC(uri => { setWcUri(uri); setVerifying(false); });
  };

  // Injected wallet (MetaMask extension / in-app browser)
  const connectInjected = async () => {
    const eth = await getWalletProvider();
    if (!eth) {
      // No injected wallet — show wallet picker on mobile, QR on desktop
      if (mob) { setShowWallets(true); } else { connectWCDesktop(); }
      return;
    }
    setVerifying(true); setErr(null);
    try {
      try {
        await eth.request({ method: 'wallet_requestPermissions', params: [{ eth_accounts: {} }] });
      } catch (permErr) {
        if (permErr.code === 4001) { setErr('Connection rejected — please approve in your wallet.'); return; }
      }
      const accounts = await eth.request({ method: 'eth_accounts' });
      if (!accounts?.length) throw new Error('No accounts returned');
      const connected = accounts[0].toLowerCase();
      const expected  = address.toLowerCase();
      if (connected !== expected) {
        setErr(`Wrong wallet.\nExpected:  ${expected.slice(0,8)}...${expected.slice(-6)}\nConnected: ${connected.slice(0,8)}...${connected.slice(-6)}\n\nSwitch to the correct account.`);
        return;
      }
      onVerified();
    } catch (e) {
      if (e.code === 4001) setErr('Connection rejected — please approve in your wallet.');
      else if (e.code === -32002) setErr('Wallet has a pending request — open your wallet and approve it.');
      else setErr('Connection failed: ' + (e.message || String(e)));
    } finally { setVerifying(false); }
  };

  return (
    <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg)', padding: 16 }}>
      <div style={{ width: '100%', maxWidth: 400, background: 'var(--panel)', border: '1px solid var(--border)', borderRadius: 16, padding: '24px 20px', display: 'flex', flexDirection: 'column', gap: 18 }}>

        <div style={{ fontSize: 18, fontWeight: 600 }}>Confirm your wallet</div>
        <div style={{ fontSize: 13, color: 'var(--text2)', lineHeight: 1.6 }}>
          Connect your wallet to confirm ownership. You won't be asked again for 24 hours.
        </div>

        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, padding: '12px 14px' }}>
          <div style={{ fontSize: 10, color: 'var(--muted)', fontFamily: 'var(--mono)', letterSpacing: '1px', marginBottom: 4 }}>EXPECTED WALLET</div>
          <div style={{ fontFamily: 'var(--mono)', fontSize: 12, color: 'var(--accent)', wordBreak: 'break-all' }}>{address}</div>
        </div>

        {err && <div style={{ background: 'rgba(248,113,113,.1)', border: '1px solid rgba(248,113,113,.3)', borderRadius: 8, padding: '10px 12px', fontSize: 12, color: 'var(--danger)', whiteSpace: 'pre-line' }}>{err}</div>}

        {/* Waiting for wallet approval */}
        {waitApproval ? (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12, padding: '8px 0' }}>
            <div style={{ width: 36, height: 36, borderRadius: '50%', border: '3px solid var(--accent)', borderTopColor: 'transparent', animation: 'spin .8s linear infinite' }} />
            <div style={{ textAlign: 'center', fontSize: 13, color: 'var(--text2)', lineHeight: 1.5 }}>
              Approve the connection in your wallet,<br/>then come back here.
            </div>
            <button onClick={() => { setWaitApproval(false); resetWCProvider(); }}
              style={{ padding: '8px 18px', background: 'transparent', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--muted)', fontSize: 12, cursor: 'pointer' }}>
              ← Cancel
            </button>
          </div>
        ) : showWallets ? (
          /* Mobile wallet picker grid — same as Landing.tsx */
          <div>
            <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 4 }}>Choose your wallet</div>
            <p style={{ fontSize: 12, color: 'var(--text2)', lineHeight: 1.5, margin: '0 0 12px' }}>
              Tap your wallet — approve the connection, then come back here.
            </p>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 8 }}>
              {WALLETS.map(w => (
                <button key={w.id} onClick={() => connectViaWallet(w.scheme)}
                  style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, padding: '12px 6px', background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 12, cursor: 'pointer', outline: 'none', width: '100%', WebkitTapHighlightColor: 'transparent' }}>
                  <div style={{ width: 40, height: 40, borderRadius: 10, overflow: 'hidden' }} dangerouslySetInnerHTML={{ __html: WALLET_ICON[w.id] }} />
                  <span style={{ fontSize: 10, color: 'var(--text2)', fontWeight: 500, textAlign: 'center' }}>{w.name}</span>
                </button>
              ))}
            </div>
            <button onClick={() => setShowWallets(false)}
              style={{ width: '100%', marginTop: 10, padding: '9px', background: 'transparent', border: 'none', color: 'var(--muted)', cursor: 'pointer', fontSize: 12 }}>
              Cancel
            </button>
          </div>
        ) : (
          <>
            <button onClick={connectInjected} disabled={verifying}
              style={{ padding: 13, background: 'var(--accent)', border: 'none', borderRadius: 10, color: '#0a0c14', fontWeight: 600, fontSize: 14, cursor: verifying ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, opacity: verifying ? 0.7 : 1 }}>
              {verifying
                ? <><span style={{ width: 14, height: 14, border: '2px solid rgba(0,0,0,.3)', borderTopColor: '#0a0c14', borderRadius: '50%', display: 'inline-block', animation: 'spin .7s linear infinite' }} />Connecting...</>
                : '🔐 Connect & Verify Wallet'}
            </button>

            {/* Desktop: WalletConnect QR */}
            {!mob && (
              <button onClick={connectWCDesktop} disabled={verifying}
                style={{ padding: 11, background: '#2563eb', border: '1px solid #3b82f6', borderRadius: 9, color: '#fff', fontWeight: 600, fontSize: 13, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, opacity: verifying ? 0.7 : 1 }}>
                <svg width="14" height="9" viewBox="0 0 40 25" fill="white"><path d="M8.19 4.78C14.72-1.59 25.28-1.59 31.81 4.78L32.6 5.55a.83.83 0 0 1 0 1.19l-2.85 2.77a.44.44 0 0 1-.61 0l-1.1-1.06c-4.5-4.35-11.78-4.35-16.28 0l-1.18 1.14a.44.44 0 0 1-.61 0L7.12 6.82a.83.83 0 0 1 0-1.19l1.07-.85zm29.32 5.47 2.54 2.46a.83.83 0 0 1 0 1.19L27.42 25.4a.87.87 0 0 1-1.22 0L17.7 17.2a.22.22 0 0 0-.31 0l-8.5 8.21a.87.87 0 0 1-1.22 0L.08 13.9a.83.83 0 0 1 0-1.19l2.54-2.46a.87.87 0 0 1 1.22 0l8.5 8.21a.22.22 0 0 0 .31 0l8.5-8.21a.87.87 0 0 1 1.22 0l8.5 8.21a.22.22 0 0 0 .31 0l8.5-8.21a.87.87 0 0 1 1.22 0z" /></svg>
                Verify with WalletConnect
              </button>
            )}
          </>
        )}

        <button onClick={onLogout}
          style={{ padding: 10, background: 'transparent', border: '1px solid var(--border)', borderRadius: 9, color: 'var(--muted)', cursor: 'pointer', fontSize: 13 }}>
          ← Log out
        </button>
      </div>

      {/* Desktop QR modal */}
      {wcUri && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.8)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 400, padding: 16 }} onClick={() => setWcUri(null)}>
          <div style={{ background: 'var(--panel)', border: '1px solid var(--border)', borderRadius: 18, padding: '24px 20px', width: '100%', maxWidth: 340, display: 'flex', flexDirection: 'column', gap: 14 }} onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{ width: 10, height: 10, borderRadius: '50%', background: '#3B99FC' }} />
                <span style={{ fontSize: 15, fontWeight: 600 }}>WalletConnect</span>
              </div>
              <button onClick={() => { setWcUri(null); resetWCProvider(); }} style={{ background: 'none', border: 'none', color: 'var(--muted)', fontSize: 22, cursor: 'pointer', lineHeight: 1 }}>×</button>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 }}>
              <WCQRCanvas uri={wcUri} />
              <p style={{ fontSize: 12, color: 'var(--text2)', textAlign: 'center', lineHeight: 1.5, margin: 0 }}>Scan with MetaMask, Trust, Coinbase or any WalletConnect wallet</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
