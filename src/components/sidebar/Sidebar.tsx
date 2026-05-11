// @ts-nocheck
import { onInstallAvailable, triggerInstallPrompt, isRunningAsPWA,
         requestPushPermission, getPushPermissionState } from '../../lib/pwa';
import React, { useState, useEffect, useRef, useCallback } from 'react';
import Avatar from '../ui/Avatar';
import { shortAddress } from '../../lib/utils';
import ProfilePic from '../ui/ProfilePic';
import SwitchNetworkButton from '../ui/SwitchNetworkButton';




export default function Sidebar({contacts,activeId,onSelect,onNew,onNewGroup,onProfile,onSettings,onWallet,onLogout,wallet,isDemo,profile,onEditContact,onSearch,mobileOpen,onMobileClose}){
  const [q,setQ]=useState('');
  const [canInstall,setCanInstall]=useState(false);
  const [pushState,setPushState]=useState<string>('default');
  const [showIosHint,setShowIosHint]=useState(false);

  const isIos=()=>/iphone|ipad|ipod/i.test(navigator.userAgent);
  const isInStandaloneMode=()=>(window.navigator as any).standalone===true||window.matchMedia('(display-mode: standalone)').matches;

  useEffect(()=>{
    const off=onInstallAvailable(()=>setCanInstall(true));
    const state=getPushPermissionState();
    setPushState(state);
    // Show iOS hint if on iOS Safari and not already installed
    if(isIos()&&!isInStandaloneMode()) setShowIosHint(true);
    // If permission already granted but subscription may not be saved (e.g. after re-install),
    // silently re-subscribe so push works without user needing to tap the banner again
    if(state==='granted'&&wallet?.address){
      requestPushPermission(wallet.address).catch(()=>{});
    }
    return off;
  },[wallet?.address]);
  const filtered=contacts.filter(c=>c.name.toLowerCase().includes(q.toLowerCase())||c.address.includes(q));
  return(
    <div className={`sidebar-panel${mobileOpen?' mobile-open':''}`}
      style={{background:'var(--panel)',borderRight:'1px solid var(--border)',display:'flex',flexDirection:'column',overflow:'hidden'}}>
      {/* iOS PWA safe area spacer */}
      <div style={{height:'env(safe-area-inset-top,0px)',background:'var(--panel)',flexShrink:0,width:'100%'}}/>
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
          style={{width:28,height:28,background:'var(--surface)',border:'none',borderRadius:8,
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
      <div onClick={onWallet} style={{margin:'10px',padding:'12px 14px',background:'var(--surface)',border:'none',
        borderRadius:10,flexShrink:0,cursor:'pointer',transition:'border-color .15s'}}
        onMouseEnter={e=>e.currentTarget.style.borderColor='var(--accent)'}
        onMouseLeave={e=>e.currentTarget.style.borderColor='var(--border)'}>
        <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:3}}>
          <div style={{fontFamily:'var(--sans)',fontSize:12,color:'var(--text2)',fontWeight:600,letterSpacing:'0.2px'}}>Wallet</div>
          <div style={{fontFamily:'var(--mono)',fontSize:9,color:'var(--accent)',opacity:.7}}>👁 View</div>
        </div>
        <div style={{fontFamily:'var(--sans)',fontSize:11,color:'var(--accent)'}}>{wallet?wallet.address.slice(0,6)+'...'+wallet.address.slice(-4):isDemo?'Demo Wallet':'Not connected'}</div>
        <div style={{display:'flex',alignItems:'center',gap:8,marginTop:5}}>
          <span style={{fontSize:12,color:'var(--accent3)',fontWeight:500}}>◈ {wallet?wallet.balance:isDemo?'2.847':'0.000'} PM</span>
          <span style={{fontFamily:'var(--sans)',fontSize:10,fontWeight:600,background:'rgba(10,132,255,.15)',border:'none',
            borderRadius:6,padding:'3px 8px',color:'var(--accent)'}}>{wallet?wallet.network:isDemo?'demo':' - '}</span>
        </div>
      </div>
      {/* Switch Network button */}
      {!isDemo && <SwitchNetworkButton/>}
      {/* ── Install banner — Android Chrome (auto prompt) ── */}
      {canInstall&&!isRunningAsPWA()&&(
        <div onClick={async()=>{await triggerInstallPrompt();setCanInstall(false);}}
          style={{margin:'0 10px 8px',padding:'10px 14px',background:'var(--accent)',
            borderRadius:12,cursor:'pointer',display:'flex',alignItems:'center',gap:10}}>
          <span style={{fontSize:20}}>📲</span>
          <div>
            <div style={{fontFamily:'var(--sans)',fontWeight:700,fontSize:13,color:'#0a0c14'}}>Install PMT-Chat</div>
            <div style={{fontFamily:'var(--sans)',fontSize:11,color:'rgba(0,0,0,0.6)'}}>Tap to add to Home Screen</div>
          </div>
        </div>
      )}
      {/* ── iOS install hint (Safari doesn't support beforeinstallprompt) ── */}
      {showIosHint&&!canInstall&&(
        <div style={{margin:'0 10px 8px',padding:'10px 14px',background:'var(--surface)',
          border:'0.5px solid var(--border)',borderRadius:12,position:'relative'}}>
          <button onClick={()=>setShowIosHint(false)}
            style={{position:'absolute',top:6,right:10,background:'none',border:'none',
              color:'var(--muted)',fontSize:16,cursor:'pointer',lineHeight:1}}>×</button>
          <div style={{display:'flex',alignItems:'center',gap:10}}>
            <span style={{fontSize:20}}>📲</span>
            <div>
              <div style={{fontFamily:'var(--sans)',fontWeight:700,fontSize:13,color:'var(--text)'}}>Install on iPhone</div>
              <div style={{fontFamily:'var(--sans)',fontSize:11,color:'var(--muted)',lineHeight:1.4}}>
                Tap <strong style={{color:'var(--accent)'}}>Share ↑</strong> then <strong style={{color:'var(--accent)'}}>Add to Home Screen</strong>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Push notifications ── */}
      {wallet?.address&&pushState!=='granted'&&pushState!=='unsupported'&&(
        <div onClick={async()=>{
          const ok=await requestPushPermission(wallet.address);
          setPushState(ok?'granted':'denied');
        }} style={{margin:'0 10px 8px',padding:'10px 14px',background:'var(--surface)',
          borderRadius:12,cursor:'pointer',display:'flex',alignItems:'center',gap:10,
          border:'0.5px solid var(--border)'}}>
          <span style={{fontSize:20}}>🔔</span>
          <div>
            <div style={{fontFamily:'var(--sans)',fontWeight:600,fontSize:13,color:'var(--text)'}}>Enable Notifications</div>
            <div style={{fontFamily:'var(--sans)',fontSize:11,color:'var(--muted)'}}>Get notified of new messages</div>
          </div>
        </div>
      )}

      {/* Search */}
      <div style={{margin:'4px 10px 0',display:'flex',alignItems:'center',gap:6,background:'rgba(118,118,128,0.18)',
        border:'none',borderRadius:10,padding:'0 10px',flexShrink:0}}>
        <span style={{fontSize:14,color:'var(--muted)'}}>⌕</span>
        <input placeholder="Search contacts..." value={q} onChange={e=>setQ(e.target.value)}
          style={{flex:1,background:'transparent',border:'none',outline:'none',color:'var(--text)',fontSize:14,padding:'8px 0'}}/>
      </div>
      {/* Label */}
      <div style={{padding:'10px 14px 3px',fontFamily:'var(--sans)',fontSize:11,color:'var(--muted)',fontWeight:500,flexShrink:0}}>
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
