// @ts-nocheck
import React, { useState, useEffect, useRef, useCallback } from 'react';

import Avatar from '../ui/Avatar';
import { shortAddress } from '../../lib/utils';
import ProfilePic from '../ui/ProfilePic';



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
          background: onPMT ? 'rgba(74,222,128,.08)' : 'rgba(248,113,113,.08)',
          border: `1px solid ${onPMT ? 'rgba(74,222,128,.3)' : 'rgba(248,113,113,.4)'}`,
          borderRadius: 9,
          color: onPMT ? 'var(--accent3)' : '#f87171',
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


export default function Sidebar({contacts,activeId,onSelect,onNew,onNewGroup,onProfile,onSettings,onWallet,onLogout,wallet,isDemo,profile,onEditContact,onSearch,mobileOpen,onMobileClose}){
  const [q,setQ]=useState('');
  const filtered=contacts.filter(c=>c.name.toLowerCase().includes(q.toLowerCase())||c.address.includes(q));
  return(
    <div className={`sidebar-panel${mobileOpen?' mobile-open':''}`}
      style={{background:'var(--panel)',borderRight:'1px solid var(--border)',display:'flex',flexDirection:'column',overflow:'hidden'}}>
      {/* Brand */}
      <div style={{padding:'16px 14px 12px',borderBottom:'1px solid var(--border)',display:'flex',alignItems:'center',gap:10,flexShrink:0}}>
        <div style={{cursor:'pointer'}} onClick={onProfile}>
          {profile?.avatarUrl
            ? <ProfilePic avatarUrl={profile.avatarUrl} initials={profile?.name?profile.name.slice(0,2).toUpperCase():'ME'}
                color='var(--accent)' bg='#0a1f2a' size={34} fs={11}/>
            : <img src={'/pmt-logo.png'} style={{width:34,height:34,borderRadius:'50%',objectFit:'cover',flexShrink:0}} alt="PM"/>
          }
        </div>
        <div style={{flex:1,minWidth:0}}>
          <div style={{fontSize:15,fontWeight:600,whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>
            {profile?.name||wallet?.username||(wallet?.address?'Unnamed Wallet':'PMT-Chat')}
          </div>
          <div style={{fontFamily:'var(--mono)',fontSize:9,letterSpacing:'1px',marginTop:1,
            color:isDemo?'var(--muted)':'var(--accent)',whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>
            {wallet?.address
              ?wallet.address.slice(0,8)+'...'+wallet.address.slice(-6)
              :isDemo?'demo mode':'not connected'}
          </div>
        </div>
        <button onClick={onSearch} title="Search messages"
          style={{width:28,height:28,background:'var(--surface)',border:'1px solid var(--border)',borderRadius:7,
            color:'var(--muted)',fontSize:14,cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0}}>
          ⌕
        </button>
        <button className="mobile-topbar" onClick={onMobileClose}
          style={{display:'none',width:30,height:30,background:'var(--surface)',border:'1px solid var(--border)',
            borderRadius:7,color:'var(--muted)',fontSize:18,cursor:'pointer',alignItems:'center',
            justifyContent:'center',flexShrink:0,lineHeight:1}}>
          ×
        </button>
      </div>
      {/* Wallet — click to open wallet modal */}
      <div onClick={onWallet} style={{margin:'10px',padding:'10px 12px',background:'var(--surface)',border:'1px solid var(--border)',
        borderRadius:10,flexShrink:0,cursor:'pointer',transition:'border-color .15s'}}
        onMouseEnter={e=>e.currentTarget.style.borderColor='var(--accent)'}
        onMouseLeave={e=>e.currentTarget.style.borderColor='var(--border)'}>
        <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:3}}>
          <div style={{fontFamily:'var(--mono)',fontSize:9,color:'var(--muted)',letterSpacing:'1.5px'}}>YOUR WALLET</div>
          <div style={{fontFamily:'var(--mono)',fontSize:9,color:'var(--accent)',opacity:.7}}>👁 View</div>
        </div>
        <div style={{fontFamily:'var(--mono)',fontSize:11,color:'var(--accent)'}}>{wallet?wallet.address.slice(0,6)+'...'+wallet.address.slice(-4):isDemo?'Demo Wallet':'Not connected'}</div>
        <div style={{display:'flex',alignItems:'center',gap:8,marginTop:5}}>
          <span style={{fontSize:12,color:'var(--accent3)',fontWeight:500}}>◈ {wallet?wallet.balance:isDemo?'2.847':'0.000'} PM</span>
          <span style={{fontFamily:'var(--mono)',fontSize:9,background:'rgba(167,139,250,.15)',border:'1px solid rgba(167,139,250,.3)',
            borderRadius:4,padding:'2px 6px',color:'var(--accent2)'}}>{wallet?wallet.network:isDemo?'demo':' - '}</span>
        </div>
      </div>
      {/* Switch Network button — visible when MetaMask is present */}
      {!isDemo && typeof window !== 'undefined' && (window as any).ethereum && (
        <SwitchNetworkButton/>
      )}
      {/* Search */}
      <div style={{margin:'4px 10px 0',display:'flex',alignItems:'center',gap:6,background:'var(--surface)',
        border:'1px solid var(--border)',borderRadius:8,padding:'0 10px',flexShrink:0}}>
        <span style={{fontSize:14,color:'var(--muted)'}}>⌕</span>
        <input placeholder="Search contacts..." value={q} onChange={e=>setQ(e.target.value)}
          style={{flex:1,background:'transparent',border:'none',outline:'none',color:'var(--text)',fontSize:12.5,padding:'8px 0'}}/>
      </div>
      {/* Label */}
      <div style={{padding:'10px 14px 3px',fontFamily:'var(--mono)',fontSize:9,color:'var(--muted)',letterSpacing:'1.5px',flexShrink:0}}>
        CONTACTS ({contacts.length})
      </div>
      {/* List */}
      <div style={{flex:1,overflowY:'auto'}}>
        {filtered.map(c=>(
          <div key={c.id}
            className="contact-row"
            style={{display:'flex',alignItems:'center',gap:10,padding:'11px 14px',cursor:'pointer',
              borderLeft:`2px solid ${activeId===c.id?'var(--accent)':'transparent'}`,
              background:activeId===c.id?'var(--surface)':'transparent',transition:'background .12s',
              position:'relative'}}
            onClick={()=>{onSelect(c);onMobileClose&&onMobileClose();}}>
            <ProfilePic initials={c.isGroup?'#':c.avatar} avatarUrl={c.avatarUrl} color={c.isGroup?'var(--accent2)':c.color} bg={c.isGroup?'#1e1b30':c.bg} online={c.online}/>
            <div style={{flex:1,minWidth:0}}>
              <div style={{display:'flex',alignItems:'center',gap:4}}>
                {c.isGroup&&<span style={{fontFamily:'var(--mono)',fontSize:8,background:'rgba(167,139,250,.2)',
                  border:'1px solid rgba(167,139,250,.3)',borderRadius:4,padding:'0 4px',color:'var(--accent2)'}}>GROUP</span>}
                <div style={{fontSize:13,fontWeight:500,whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>{c.name}</div>
              </div>
              <div style={{fontSize:11,color:'var(--muted)',whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis',marginTop:2}}>{c.preview||shortAddress(c.address)}</div>
            </div>
            {c.unread>0&&(
              <div style={{minWidth:18,height:18,borderRadius:9,background:'var(--accent)',
                display:'flex',alignItems:'center',justifyContent:'center',
                fontSize:10,fontWeight:700,color:'#0a0c14',padding:'0 4px',flexShrink:0}}>
                {c.unread>99?'99+':c.unread}
              </div>
            )}
            {!c.isGroup&&(
              <button onClick={e=>{e.stopPropagation();onEditContact(c);}}
                className="edit-btn"
                style={{opacity:0,position:'absolute',right:10,top:'50%',transform:'translateY(-50%)',
                  background:'var(--surface)',border:'1px solid var(--border)',borderRadius:6,
                  color:'var(--muted)',fontSize:11,cursor:'pointer',padding:'3px 7px',transition:'opacity .15s'}}
                onMouseEnter={e=>e.currentTarget.style.opacity=1}
                onMouseLeave={e=>e.currentTarget.style.opacity=0}>
                ✎
              </button>
            )}
          </div>
        ))}
      </div>
      {/* Footer */}
      <div className="sidebar-footer" style={{padding:'10px',borderTop:'1px solid var(--border)',display:'flex',gap:6,flexShrink:0}}>
        {[['+','New Chat',onNew],['⊞','New Group',onNewGroup],['👤','Profile',onProfile],['⚙️','Settings',onSettings]].map(([icon,title,fn])=>(
          <button key={icon} onClick={fn} title={title}
            style={{flex:1,padding:10,background:'var(--surface)',border:'1px solid var(--border)',borderRadius:8,
              color:'var(--muted)',fontSize:16,cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center'}}>
            {icon}
          </button>
        ))}
        <button onClick={onLogout} title="Log Out"
          style={{padding:8,background:'var(--surface)',border:'1px solid rgba(248,113,113,.3)',borderRadius:8,
            color:'var(--danger)',fontSize:12,cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center',
            fontFamily:'var(--mono)',letterSpacing:.5,gap:4,paddingLeft:10,paddingRight:10}}
          onMouseEnter={e=>{e.currentTarget.style.background='rgba(248,113,113,.1)';}}
          onMouseLeave={e=>{e.currentTarget.style.background='var(--surface)';}}>
          &#x2715;
        </button>
      </div>
    </div>
  );
}
