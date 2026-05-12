// @ts-nocheck
import React from 'react';
import { getWalletProvider } from '../../lib/wallet';
import { getWCProvider } from '../../lib/walletconnect';

const PMT_CHAIN = {
  chainId: '0x46df2', chainName: 'PMTchain',
  nativeCurrency: { name: 'PM', symbol: 'PMT', decimals: 18 },
  rpcUrls: ['https://node1-ipm.dweb3.wtf'],
  blockExplorerUrls: ['https://pmtscan.com'],
};

/** Get active provider: injected wallet first, then WalletConnect */
async function getActiveProvider() {
  // Try injected (desktop MetaMask / mobile wallet browser)
  const found: any[] = [];
  const h = (e: any) => found.push(e.detail);
  window.addEventListener('eip6963:announceProvider', h);
  window.dispatchEvent(new Event('eip6963:requestProvider'));
  await new Promise(r => setTimeout(r, 350));
  window.removeEventListener('eip6963:announceProvider', h);
  const mm = found.find((p: any) => p.info?.rdns === 'io.metamask');
  const injected = mm?.provider ?? found[0]?.provider ?? (window as any).ethereum ?? null;
  if (injected) return { provider: injected, type: 'injected' };

  // Try WalletConnect (mobile Safari with connected wallet)
  try {
    const wc = await getWCProvider();
    if (wc?.accounts?.length) return { provider: wc, type: 'wc' };
  } catch {}
  return null;
}

const isMobileDevice = () => /iPhone|iPad|Android/i.test(navigator.userAgent);

async function doSwitch(provider: any, onNeedApproval?: () => void) {
  try {
    await provider.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: '0x46df2' }] });
  } catch (sw: any) {
    if (sw.code === 4902 || sw.code === -32603 || sw.message?.includes('wallet_addEthereumChain')) {
      // On mobile with WC: notify user to open their wallet app
      if (isMobileDevice() && onNeedApproval) onNeedApproval();
      await provider.request({ method: 'wallet_addEthereumChain', params: [PMT_CHAIN] });
    } else if (sw.code !== 4001) throw sw;
  }
}

function SwitchNetworkButton() {
  const [chain, setChain] = React.useState<string>('');
  const [hasProvider, setHasProvider] = React.useState(false);
  const [switching, setSwitching] = React.useState(false);
  const [open, setOpen] = React.useState(false);
  const [copied, setCopied] = React.useState('');
  const [pendingApproval, setPendingApproval] = React.useState(false);
  const providerRef = React.useRef<any>(null);

  React.useEffect(() => {
    getActiveProvider().then(result => {
      if (!result) return;
      setHasProvider(true);
      providerRef.current = result.provider;
      const eth = result.provider;
      // Get current chain
      if (result.type === 'wc') {
        const cid = eth.chainId;
        if (cid) setChain('0x' + Number(cid).toString(16));
      } else {
        eth.request({ method: 'eth_chainId' }).then(setChain).catch(() => {});
        eth.on?.('chainChanged', setChain);
        const win = (window as any).ethereum;
        if (win && win !== eth) win.on?.('chainChanged', setChain);
      }
    });
  }, []);

  const onPMT = chain === '0x46df2';

  const switchNetwork = async () => {
    if (onPMT || switching) return;
    setSwitching(true);
    try {
      let eth = providerRef.current;
      if (!eth) {
        const result = await getActiveProvider();
        if (!result) { setOpen(true); setSwitching(false); return; }
        eth = result.provider;
        providerRef.current = eth;
      }
      await doSwitch(eth, () => setPendingApproval(true));
      // Re-read chain after switch
      try {
        const wc = providerRef.current;
        const newChain = wc.chainId
          ? '0x' + Number(wc.chainId).toString(16)
          : await wc.request({ method: 'eth_chainId' });
        setChain(newChain);
      } catch {}
    } catch {
      setOpen(true);
    } finally {
      setSwitching(false);
    }
  };

  const details = [
    { label: 'Network Name', value: 'PMTchain' },
    { label: 'RPC URL', value: 'https://node1-ipm.dweb3.wtf' },
    { label: 'Chain ID', value: '290290' },
    { label: 'Currency Symbol', value: 'PMT' },
    { label: 'Block Explorer', value: 'https://pmtscan.com' },
  ];

  // Popup for mobile WalletConnect users who need to approve in their wallet app
  const WalletApprovalPopup = pendingApproval ? (
    <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,.75)',display:'flex',
      alignItems:'center',justifyContent:'center',zIndex:9999,padding:20}}>
      <div style={{background:'var(--panel)',border:'1px solid var(--border)',borderRadius:20,
        padding:'28px 24px',width:'100%',maxWidth:340,display:'flex',flexDirection:'column',
        gap:16,alignItems:'center',textAlign:'center'}}>
        <div style={{fontSize:36}}>📱</div>
        <div style={{fontSize:16,fontWeight:700,color:'var(--text)'}}>Open your wallet app</div>
        <div style={{fontSize:13,color:'var(--text2)',lineHeight:1.6}}>
          A request to add <strong>PMTchain</strong> has been sent to your wallet.<br/>
          Open your wallet app and confirm the new network.
        </div>
        <div style={{background:'var(--surface)',border:'1px solid var(--border)',borderRadius:12,
          padding:'12px 16px',width:'100%'}}>
          <div style={{fontSize:11,color:'var(--muted)',marginBottom:6}}>Network details</div>
          <div style={{fontSize:12,color:'var(--text)',fontFamily:'var(--mono)'}}>PMTchain · Chain ID 290290</div>
          <div style={{fontSize:11,color:'var(--muted)',marginTop:2}}>node1-ipm.dweb3.wtf</div>
        </div>
        <button onClick={() => setPendingApproval(false)}
          style={{width:'100%',padding:'12px',background:'var(--accent)',border:'none',
            borderRadius:10,color:'#0a0c14',fontWeight:700,fontSize:14,cursor:'pointer'}}>
          ✓ I've confirmed in my wallet
        </button>
        <button onClick={() => setPendingApproval(false)}
          style={{background:'none',border:'none',color:'var(--muted)',fontSize:12,cursor:'pointer'}}>
          Dismiss
        </button>
      </div>
    </div>
  ) : null;

  if (!hasProvider) return (<>{WalletApprovalPopup}<div style={{ margin: '0 10px 6px', flexShrink: 0 }}>
      <button onClick={() => setOpen(v => !v)}
        style={{ width: '100%', padding: '9px 12px', background: 'var(--surface)',
          border: '1px solid var(--border)', borderRadius: 9,
          color: 'var(--accent2)', fontSize: 12, fontWeight: 600, cursor: 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7 }}>
        ⛓ Add PMTchain
      </button>
      {open && (
        <div style={{ marginTop: 4, background: 'var(--surface)', border: '1px solid var(--border)',
          borderRadius: 9, padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: 6 }}>
          <div style={{ fontSize: 11, color: 'var(--text2)', marginBottom: 2 }}>Add PMTchain manually in your wallet:</div>
          {details.map(({ label, value }) => (
            <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ fontSize: 10, color: 'var(--muted)', width: 88, flexShrink: 0 }}>{label}</span>
              <span style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--text)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{value}</span>
              <button onClick={() => { navigator.clipboard.writeText(value); setCopied(label); setTimeout(() => setCopied(''), 2000); }}
                style={{ background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 4,
                  padding: '2px 6px', fontSize: 10, color: copied === label ? 'var(--accent3)' : 'var(--muted)', cursor: 'pointer', flexShrink: 0 }}>
                {copied === label ? '✓' : 'Copy'}
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  </>);

  return (<>{WalletApprovalPopup}<div style={{ margin: '0 10px 6px', flexShrink: 0 }}>
      <button onClick={switchNetwork} disabled={onPMT || switching}
        style={{ width: '100%', padding: '9px 12px',
          background: onPMT ? 'rgba(48,209,88,.1)' : 'rgba(255,69,58,.1)',
          border: `1px solid ${onPMT ? 'rgba(74,222,128,.3)' : 'rgba(248,113,113,.4)'}`,
          borderRadius: 9, color: onPMT ? '#30d158' : '#ff453a',
          fontSize: 12, fontWeight: 600,
          cursor: onPMT ? 'default' : switching ? 'wait' : 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7,
          transition: 'all .15s', opacity: switching ? 0.7 : 1 }}>
        {switching && <span style={{ width: 10, height: 10, border: '2px solid rgba(248,113,113,.3)',
          borderTopColor: '#f87171', borderRadius: '50%', display: 'inline-block',
          animation: 'spin .7s linear infinite' }}/>}
        {onPMT ? '✓ PMTchain' : switching ? '⏳ Switching...' : '⚠ Wrong Network — Switch'}
      </button>
      {!onPMT && !switching && (
        <button onClick={() => setOpen(v => !v)}
          style={{ width: '100%', marginTop: 4, padding: '6px', background: 'transparent',
            border: 'none', color: 'var(--muted)', fontSize: 11, cursor: 'pointer', textAlign: 'center' }}>
          {open ? 'Hide manual setup' : '+ Add PMTchain manually'}
        </button>
      )}
      {open && !onPMT && (
        <div style={{ marginTop: 4, background: 'var(--surface)', border: '1px solid var(--border)',
          borderRadius: 9, padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: 6 }}>
          <div style={{ fontSize: 11, color: 'var(--text2)', marginBottom: 2 }}>Add in your wallet app:</div>
          {details.map(({ label, value }) => (
            <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ fontSize: 10, color: 'var(--muted)', width: 88, flexShrink: 0 }}>{label}</span>
              <span style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--text)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{value}</span>
              <button onClick={() => { navigator.clipboard.writeText(value); setCopied(label); setTimeout(() => setCopied(''), 2000); }}
                style={{ background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 4,
                  padding: '2px 6px', fontSize: 10, color: copied === label ? 'var(--accent3)' : 'var(--muted)', cursor: 'pointer', flexShrink: 0 }}>
                {copied === label ? '✓' : 'Copy'}
              </button>
            </div>
          ))}
        </div>
      )}
    </div></> );
}

/** Compact version for mobile topbar */
export function SwitchNetworkCompact() {
  const [chain, setChain] = React.useState('');
  const [hasProvider, setHasProvider] = React.useState(false);
  const [switching, setSwitching] = React.useState(false);
  const providerRef = React.useRef(null);

  React.useEffect(() => {
    getActiveProvider().then(result => {
      if (!result) return;
      setHasProvider(true);
      providerRef.current = result.provider;
      const eth = result.provider;
      if (result.type === 'wc') {
        const cid = eth.chainId;
        if (cid) setChain('0x' + Number(cid).toString(16));
      } else {
        eth.request({ method: 'eth_chainId' }).then(setChain).catch(() => {});
        eth.on?.('chainChanged', setChain);
        const win = (window as any).ethereum;
        if (win && win !== eth) win.on?.('chainChanged', setChain);
      }
    });
  }, []);

  if (!hasProvider) return null;

  const onPMT = chain === '0x46df2';

  const switchNetwork = async () => {
    if (onPMT || switching) return;
    setSwitching(true);
    try {
      const eth = providerRef.current || (await getActiveProvider())?.provider;
      if (!eth) return;
      await doSwitch(eth);
      const cid = eth.chainId;
      const newChain = cid ? '0x' + Number(cid).toString(16) : await eth.request({ method: 'eth_chainId' }).catch(() => '');
      setChain(newChain);
    } catch {} finally { setSwitching(false); }
  };

  return (
    <button onClick={switchNetwork} disabled={onPMT || switching}
      title={onPMT ? 'On PMTchain' : 'Wrong network — tap to switch'}
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
      {onPMT ? 'PMTchain' : switching ? 'Switching…' : 'Wrong Network'}
    </button>
  );
}

export default SwitchNetworkButton;
