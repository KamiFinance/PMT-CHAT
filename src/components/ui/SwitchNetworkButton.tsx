// @ts-nocheck
import React from 'react';
import { getWalletProvider } from '../../lib/wallet';

function SwitchNetworkButton() {
  const [chain, setChain] = React.useState<string>('');
  const [hasMM, setHasMM] = React.useState(false);
  const [switching, setSwitching] = React.useState(false);
  const [open, setOpen] = React.useState(false);
  const [copied, setCopied] = React.useState('');
  const providerRef = React.useRef<any>(null);

  const PMT_CHAIN = {
    chainId: '0x46df2', chainName: 'PMTchain',
    nativeCurrency: { name: 'PM', symbol: 'PMT', decimals: 18 },
    rpcUrls: ['https://node1-ipm.dweb3.wtf'],
    blockExplorerUrls: ['https://pmtscan.com'],
  };

  // Discover any EIP-6963 wallet (MetaMask, Coinbase, Rainbow, Trust, etc.)
  // Falls back to window.ethereum for older wallets
  const getProvider = () => new Promise<any>((resolve) => {
    const found: any[] = [];
    const h = (e: any) => found.push(e.detail);
    window.addEventListener('eip6963:announceProvider', h);
    window.dispatchEvent(new Event('eip6963:requestProvider'));
    setTimeout(() => {
      window.removeEventListener('eip6963:announceProvider', h);
      // Prefer MetaMask if available, then any other EIP-6963 wallet, then window.ethereum
      const mm = found.find((p: any) => p.info?.rdns === 'io.metamask');
      const any6963 = found[0]; // first announced provider
      resolve(mm?.provider ?? any6963?.provider ?? (window as any).ethereum ?? null);
    }, 400);
  });

  React.useEffect(() => {
    getProvider().then(eth => {
      if (!eth) return;
      setHasMM(true);
      providerRef.current = eth;
      eth.request({ method: 'eth_chainId' }).then(setChain).catch(() => {});
      // Listen for chain changes on this provider
      const onChange = (id: string) => setChain(id);
      eth.on?.('chainChanged', onChange);
      // Also listen via window.ethereum in case it's a different provider
      const winEth = (window as any).ethereum;
      if (winEth && winEth !== eth) {
        winEth.on?.('chainChanged', onChange);
      }
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onPMT = chain === '0x46df2';

  const switchNetwork = async () => {
    if (onPMT || switching) return;
    setSwitching(true);
    try {
      let eth = providerRef.current;
      if (!eth) eth = await getProvider();
      if (!eth) { setOpen(true); setSwitching(false); return; }
      // Try switch first, add if chain not found (4902)
      try {
        await eth.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: '0x46df2' }] });
      } catch (sw: any) {
        if (sw.code === 4902 || sw.code === -32603) {
          await eth.request({ method: 'wallet_addEthereumChain', params: [PMT_CHAIN] });
        } else if (sw.code !== 4001) {
          throw sw;
        }
      }
      const newChain = await eth.request({ method: 'eth_chainId' });
      setChain(newChain);
    } catch {
      setOpen(true); // show manual fallback
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

  if (!hasMM) return (
    <div style={{ margin: '0 10px 6px', flexShrink: 0 }}>
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
  );

  return (
    <div style={{ margin: '0 10px 6px', flexShrink: 0 }}>
      <button onClick={switchNetwork} disabled={onPMT || switching}
        style={{ width: '100%', padding: '9px 12px',
          background: onPMT ? 'rgba(48,209,88,.1)' : 'rgba(255,69,58,.1)',
          border: `1px solid ${onPMT ? 'rgba(74,222,128,.3)' : 'rgba(248,113,113,.4)'}`,
          borderRadius: 9,
          color: onPMT ? '#30d158' : '#ff453a',
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
          <div style={{ fontSize: 11, color: 'var(--text2)', marginBottom: 2 }}>MetaMask → Add Network → Add manually:</div>
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
  );
}

/**
 * Compact version for mobile topbar — just the button, no manual panel
 */
export function SwitchNetworkCompact() {
  const [chain, setChain] = React.useState('');
  const [hasMM, setHasMM] = React.useState(false);
  const [switching, setSwitching] = React.useState(false);
  const providerRef = React.useRef(null);

  const PMT_CHAIN = {
    chainId: '0x46df2', chainName: 'PMTchain',
    nativeCurrency: { name: 'PM', symbol: 'PMT', decimals: 18 },
    rpcUrls: ['https://node1-ipm.dweb3.wtf'],
    blockExplorerUrls: ['https://pmtscan.com'],
  };

  React.useEffect(() => {
    getWalletProvider().then(eth => {
      if (!eth) return;
      setHasMM(true);
      providerRef.current = eth;
      eth.request({ method: 'eth_chainId' }).then(setChain).catch(() => {});
      const onChange = (id) => setChain(id);
      eth.on?.('chainChanged', onChange);
      const winEth = window.ethereum;
      if (winEth && winEth !== eth) winEth.on?.('chainChanged', onChange);
    });
  }, []);

  if (!hasMM) return null; // no wallet — don't show anything

  const onPMT = chain === '0x46df2';

  const switchNetwork = async () => {
    if (onPMT || switching) return;
    setSwitching(true);
    try {
      let eth = providerRef.current || await getWalletProvider();
      if (!eth) return;
      try {
        await eth.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: '0x46df2' }] });
      } catch (sw) {
        if (sw.code === 4902 || sw.code === -32603) {
          await eth.request({ method: 'wallet_addEthereumChain', params: [PMT_CHAIN] });
        } else if (sw.code !== 4001) throw sw;
      }
      const newChain = await eth.request({ method: 'eth_chainId' });
      setChain(newChain);
    } catch {} finally {
      setSwitching(false);
    }
  };

  return (
    <button onClick={switchNetwork} disabled={onPMT || switching}
      title={onPMT ? 'On PMTchain' : 'Wrong network — tap to switch'}
      style={{
        padding: '4px 9px',
        background: onPMT ? 'rgba(74,222,128,.1)' : 'rgba(248,113,113,.1)',
        border: `1px solid ${onPMT ? 'rgba(74,222,128,.35)' : 'rgba(248,113,113,.45)'}`,
        borderRadius: 7,
        color: onPMT ? '#30d158' : '#ff453a',
        fontSize: 10, fontWeight: 700,
        cursor: onPMT ? 'default' : 'pointer',
        flexShrink: 0,
        display: 'flex', alignItems: 'center', gap: 4,
        WebkitTapHighlightColor: 'transparent',
        whiteSpace: 'nowrap',
      }}>
      {switching
        ? <span style={{ width: 8, height: 8, border: '1.5px solid rgba(248,113,113,.3)',
            borderTopColor: '#f87171', borderRadius: '50%',
            animation: 'spin .7s linear infinite', display: 'inline-block' }}/>
        : <span style={{ width: 6, height: 6, borderRadius: '50%',
            background: onPMT ? 'var(--accent3)' : '#f87171',
            display: 'inline-block' }}/>
      }
      {onPMT ? 'PMTchain' : switching ? 'Switching…' : 'Wrong Network'}
    </button>
  );
}

export default SwitchNetworkButton;
