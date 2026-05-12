// @ts-nocheck
import React from 'react';
import { getWCProvider } from '../../lib/walletconnect';

const PMT_CHAIN = {
  chainId: '0x46df2', chainName: 'PMTchain',
  nativeCurrency: { name: 'PM', symbol: 'PMT', decimals: 18 },
  rpcUrls: ['https://node1-ipm.dweb3.wtf'],
  blockExplorerUrls: ['https://pmtscan.com'],
};

const isMobile = () => /iPhone|iPad|Android/i.test(navigator.userAgent);

/** Get active provider: injected wallet or WalletConnect */
async function getActiveProvider() {
  const found: any[] = [];
  const h = (e: any) => found.push(e.detail);
  window.addEventListener('eip6963:announceProvider', h);
  window.dispatchEvent(new Event('eip6963:requestProvider'));
  await new Promise(r => setTimeout(r, 350));
  window.removeEventListener('eip6963:announceProvider', h);
  const mm = found.find((p: any) => p.info?.rdns === 'io.metamask');
  const injected = mm?.provider ?? found[0]?.provider ?? (window as any).ethereum ?? null;
  if (injected) return { provider: injected, type: 'injected' as const };
  try {
    const wc = await getWCProvider();
    if (wc?.accounts?.length) return { provider: wc, type: 'wc' as const };
  } catch {}
  return null;
}

// ── Mobile "Open Wallet" popup ──────────────────────────────────────────────
function OpenWalletPopup({ title, body, onDone }: { title: string; body: string; onDone: () => void }) {
  return (
    <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,.8)',display:'flex',
      alignItems:'center',justifyContent:'center',zIndex:9999,padding:20}}>
      <div style={{background:'var(--panel)',border:'1px solid var(--border)',borderRadius:20,
        padding:'28px 24px',width:'100%',maxWidth:340,display:'flex',flexDirection:'column',
        gap:16,alignItems:'center',textAlign:'center'}}>
        <div style={{fontSize:40}}>📱</div>
        <div style={{fontSize:16,fontWeight:700,color:'var(--text)'}}>{title}</div>
        <div style={{fontSize:13,color:'var(--text2)',lineHeight:1.6}}>{body}</div>
        <div style={{background:'var(--surface)',border:'1px solid var(--border)',borderRadius:12,
          padding:'12px 16px',width:'100%',textAlign:'left'}}>
          <div style={{fontSize:11,color:'var(--muted)',marginBottom:4}}>PMTchain details</div>
          {[['Network','PMTchain'],['Chain ID','290290'],['RPC','node1-ipm.dweb3.wtf'],['Symbol','PMT']].map(([k,v])=>(
            <div key={k} style={{display:'flex',justifyContent:'space-between',marginBottom:2}}>
              <span style={{fontSize:11,color:'var(--muted)'}}>{k}</span>
              <span style={{fontSize:11,color:'var(--text)',fontFamily:'var(--mono)'}}>{v}</span>
            </div>
          ))}
        </div>
        <button onClick={onDone}
          style={{width:'100%',padding:'12px',background:'var(--accent)',border:'none',
            borderRadius:10,color:'#0a0c14',fontWeight:700,fontSize:14,cursor:'pointer'}}>
          ✓ Done — I confirmed in my wallet
        </button>
        <button onClick={onDone}
          style={{background:'none',border:'none',color:'var(--muted)',fontSize:12,cursor:'pointer'}}>
          Cancel
        </button>
      </div>
    </div>
  );
}

// ── Main SwitchNetworkButton ─────────────────────────────────────────────────
function SwitchNetworkButton() {
  const [chain, setChain] = React.useState<string>('');
  const [hasProvider, setHasProvider] = React.useState(false);
  const [providerType, setProviderType] = React.useState<'injected'|'wc'>('injected');
  const [switching, setSwitching] = React.useState(false);
  const [popup, setPopup] = React.useState<null|'add'|'switch'>(null);
  const providerRef = React.useRef<any>(null);

  const readChain = async (eth: any, type: string) => {
    try {
      if (type === 'wc' && eth.chainId) {
        setChain('0x' + Number(eth.chainId).toString(16));
      } else {
        const c = await eth.request({ method: 'eth_chainId' });
        setChain(c);
      }
    } catch {}
  };

  React.useEffect(() => {
    getActiveProvider().then(result => {
      if (!result) return;
      setHasProvider(true);
      setProviderType(result.type);
      providerRef.current = result.provider;
      readChain(result.provider, result.type);
      if (result.type === 'injected') {
        result.provider.on?.('chainChanged', (id: string) => setChain(id));
        const win = (window as any).ethereum;
        if (win && win !== result.provider) win.on?.('chainChanged', (id: string) => setChain(id));
      }
    });
  }, []);

  // Re-check chain when user returns from wallet app (mobile)
  React.useEffect(() => {
    if (!isMobile()) return;
    const check = async () => {
      if (document.hidden) return;
      const eth = providerRef.current;
      if (!eth) return;
      try {
        const c = eth.chainId ? '0x'+Number(eth.chainId).toString(16)
          : await eth.request({ method: 'eth_chainId' });
        setChain(c);
      } catch {}
    };
    document.addEventListener('visibilitychange', check);
    return () => document.removeEventListener('visibilitychange', check);
  }, []);

  const onPMT = chain === '0x46df2';

  const handleAction = async () => {
    if (onPMT || switching) return;
    const eth = providerRef.current;
    if (!eth) return;

    // On mobile with WC: show popup first, then send request
    setSwitching(true);
    try {
      try {
        // Try switching first
        if (isMobile() && providerType === 'wc') setPopup('switch');
        await eth.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: '0x46df2' }] });
        setPopup(null);
      } catch (sw: any) {
        if (sw.code === 4902 || sw.code === -32603 || sw.message?.includes('wallet_addEthereumChain')) {
          // Chain not in wallet — need to add it
          if (isMobile() && providerType === 'wc') setPopup('add');
          await eth.request({ method: 'wallet_addEthereumChain', params: [PMT_CHAIN] });
          setPopup(null);
        } else if (sw.code === 4001) {
          setPopup(null); // user rejected
        } else {
          setPopup(null);
          throw sw;
        }
      }
      // Re-read chain after action
      const newChain = eth.chainId ? '0x'+Number(eth.chainId).toString(16)
        : await eth.request({ method: 'eth_chainId' }).catch(() => chain);
      setChain(newChain);
    } catch {} finally {
      setSwitching(false);
    }
  };

  if (!hasProvider) return null;

  return (
    <>
      {/* Mobile popup */}
      {popup && (
        <OpenWalletPopup
          title={popup === 'add' ? 'Add PMTchain to your wallet' : 'Switch to PMTchain'}
          body={popup === 'add'
            ? 'A request has been sent to your wallet app. Open it and tap "Add Network" to add PMTchain.'
            : 'A request has been sent to your wallet app. Open it and confirm switching to PMTchain.'}
          onDone={() => { setPopup(null); setSwitching(false); }}
        />
      )}
      <div style={{ margin: '0 10px 6px', flexShrink: 0 }}>
        <button onClick={handleAction} disabled={onPMT || switching}
          style={{ width: '100%', padding: '9px 12px',
            background: onPMT ? 'rgba(48,209,88,.1)' : 'rgba(255,165,0,.1)',
            border: `1px solid ${onPMT ? 'rgba(74,222,128,.3)' : 'rgba(255,165,0,.4)'}`,
            borderRadius: 9,
            color: onPMT ? '#30d158' : '#f59e0b',
            fontSize: 12, fontWeight: 600,
            cursor: onPMT ? 'default' : switching ? 'wait' : 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7,
            transition: 'all .15s', opacity: switching ? 0.7 : 1 }}>
          {switching && <span style={{ width: 10, height: 10, border: '2px solid rgba(245,158,11,.3)',
            borderTopColor: '#f59e0b', borderRadius: '50%', display: 'inline-block',
            animation: 'spin .7s linear infinite' }}/>}
          {onPMT ? '✓ PMTchain' : switching ? '⏳ Check your wallet...' : '⚠ Add / Switch to PMTchain'}
        </button>
      </div>
    </>
  );
}

/** Compact version for mobile topbar */
export function SwitchNetworkCompact() {
  const [chain, setChain] = React.useState('');
  const [hasProvider, setHasProvider] = React.useState(false);
  const [providerType, setProviderType] = React.useState<'injected'|'wc'>('injected');
  const [switching, setSwitching] = React.useState(false);
  const [popup, setPopup] = React.useState<null|'add'|'switch'>(null);
  const providerRef = React.useRef<any>(null);

  React.useEffect(() => {
    getActiveProvider().then(result => {
      if (!result) return;
      setHasProvider(true);
      setProviderType(result.type);
      providerRef.current = result.provider;
      const eth = result.provider;
      if (result.type === 'wc' && eth.chainId) {
        setChain('0x'+Number(eth.chainId).toString(16));
      } else {
        eth.request({ method: 'eth_chainId' }).then(setChain).catch(() => {});
        eth.on?.('chainChanged', setChain);
      }
    });
    if (isMobile()) {
      const check = async () => {
        if (document.hidden || !providerRef.current) return;
        const eth = providerRef.current;
        const c = eth.chainId ? '0x'+Number(eth.chainId).toString(16)
          : await eth.request({ method: 'eth_chainId' }).catch(() => '');
        if (c) setChain(c);
      };
      document.addEventListener('visibilitychange', check);
      return () => document.removeEventListener('visibilitychange', check);
    }
  }, []);

  if (!hasProvider) return null;
  const onPMT = chain === '0x46df2';

  const handleAction = async () => {
    if (onPMT || switching) return;
    const eth = providerRef.current;
    if (!eth) return;
    setSwitching(true);
    try {
      try {
        if (isMobile() && providerType === 'wc') setPopup('switch');
        await eth.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: '0x46df2' }] });
        setPopup(null);
      } catch (sw: any) {
        if (sw.code === 4902 || sw.code === -32603) {
          if (isMobile() && providerType === 'wc') setPopup('add');
          await eth.request({ method: 'wallet_addEthereumChain', params: [PMT_CHAIN] });
          setPopup(null);
        } else if (sw.code !== 4001) throw sw;
        else setPopup(null);
      }
      const c = eth.chainId ? '0x'+Number(eth.chainId).toString(16)
        : await eth.request({ method: 'eth_chainId' }).catch(() => chain);
      setChain(c);
    } catch {} finally { setSwitching(false); }
  };

  return (
    <>
      {popup && (
        <OpenWalletPopup
          title={popup === 'add' ? 'Add PMTchain' : 'Switch to PMTchain'}
          body={popup === 'add'
            ? 'Open your wallet app and tap "Add Network" to add PMTchain.'
            : 'Open your wallet app and confirm switching to PMTchain.'}
          onDone={() => { setPopup(null); setSwitching(false); }}
        />
      )}
      <button onClick={handleAction} disabled={onPMT || switching}
        title={onPMT ? 'On PMTchain' : 'Tap to add/switch to PMTchain'}
        style={{ padding: '4px 9px',
          background: onPMT ? 'rgba(74,222,128,.1)' : 'rgba(248,113,113,.1)',
          border: `1px solid ${onPMT ? 'rgba(74,222,128,.35)' : 'rgba(248,113,113,.45)'}`,
          borderRadius: 7, color: onPMT ? '#30d158' : '#ff453a',
          fontSize: 10, fontWeight: 700, cursor: onPMT ? 'default' : 'pointer',
          flexShrink: 0, display: 'flex', alignItems: 'center', gap: 4,
          WebkitTapHighlightColor: 'transparent', whiteSpace: 'nowrap' }}>
        {switching
          ? <span style={{ width: 8, height: 8, border: '1.5px solid rgba(248,113,113,.3)',
              borderTopColor: '#f87171', borderRadius: '50%',
              animation: 'spin .7s linear infinite', display: 'inline-block' }}/>
          : <span style={{ width: 6, height: 6, borderRadius: '50%',
              background: onPMT ? 'var(--accent3)' : '#f87171', display: 'inline-block' }}/>
        }
        {onPMT ? 'PMTchain' : switching ? 'Check wallet…' : 'Wrong Network'}
      </button>
    </>
  );
}

export default SwitchNetworkButton;
