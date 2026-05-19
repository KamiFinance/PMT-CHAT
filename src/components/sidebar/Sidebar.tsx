// @ts-nocheck
import { onInstallAvailable, triggerInstallPrompt, isRunningAsPWA,
         requestPushPermission, getPushPermissionState } from '../../lib/pwa';
import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { shortAddress } from '../../lib/utils';
import ProfilePic from '../ui/ProfilePic';
import GroupChatModal from '../modals/GroupChatModal';
import SwitchNetworkButton from '../ui/SwitchNetworkButton';

// ── SVG Icons ─────────────────────────────────────────────────────────────
const IcoContacts = () => (
  <svg viewBox="0 0 24 24" width="19" height="19" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="9" cy="7" r="4"/><path d="M3 21v-2a4 4 0 0 1 4-4h4a4 4 0 0 1 4 4v2"/>
    <path d="M16 3.13a4 4 0 0 1 0 7.75"/><path d="M21 21v-2a4 4 0 0 0-3-3.87"/>
  </svg>
);
const IcoWallet = () => (
  <svg viewBox="0 0 24 24" width="19" height="19" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <rect x="2" y="7" width="20" height="14" rx="2"/><circle cx="17" cy="14" r="1" fill="currentColor" stroke="none"/>
    <path d="M22 7V5a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2v2"/>
  </svg>
);
const IcoProfile = () => (
  <svg viewBox="0 0 24 24" width="19" height="19" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="8" r="4"/><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7"/>
  </svg>
);
const IcoGroup = () => (
  <svg viewBox="0 0 24 24" width="19" height="19" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="10"/><path d="M12 8v8m-4-4h8"/>
  </svg>
);
const IcoSettings = () => (
  <svg viewBox="0 0 24 24" width="19" height="19" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="3"/>
    <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
  </svg>
);
const IcoLogout = () => (
  <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>
    <polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/>
  </svg>
);
const IcoAppearance = () => (
  <svg viewBox="0 0 24 24" width="19" height="19" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="4"/>
    <line x1="12" y1="2" x2="12" y2="4"/>
    <line x1="12" y1="20" x2="12" y2="22"/>
    <line x1="4.93" y1="4.93" x2="6.34" y2="6.34"/>
    <line x1="17.66" y1="17.66" x2="19.07" y2="19.07"/>
    <line x1="2" y1="12" x2="4" y2="12"/>
    <line x1="20" y1="12" x2="22" y2="12"/>
    <line x1="4.93" y1="19.07" x2="6.34" y2="17.66"/>
    <line x1="17.66" y1="6.34" x2="19.07" y2="4.93"/>
  </svg>
);

// Mobile bottom tab bar (shared across all sections)
function MobileBottomTabs({activeSection, setActiveSection, onSettings}) {
  const tabs = [
    {id:'contacts', label:'Chats', Icon:IcoContacts},
    {id:'wallet',   label:'Wallet', Icon:IcoWallet},
    {id:'profile',  label:'Profile', Icon:IcoProfile},
    {id:'settings', label:'Settings', Icon:IcoSettings},
  ];
  return (
    <div style={{display:'flex',alignItems:'center',justifyContent:'space-around',
      borderTop:'1px solid rgba(255,255,255,0.08)',
      background:'rgba(28,28,30,0.82)',
      backdropFilter:'blur(20px)',
      WebkitBackdropFilter:'blur(20px)',
      paddingBottom:'calc(8px + var(--safe-bottom,0px))',paddingTop:8,flexShrink:0}}>
      {tabs.map(({id,label,Icon}) => (
        <button key={id}
          onClick={()=> setActiveSection(id)}
          style={{flex:1,background:'none',border:'none',cursor:'pointer',
            display:'flex',flexDirection:'column',alignItems:'center',gap:3,padding:'4px 0',
            color: activeSection===id ? 'var(--accent)' : 'rgba(255,255,255,0.45)',
            transition:'color .15s'}}>
          <Icon/>
          <span style={{fontSize:10,fontFamily:'var(--sans)',fontWeight:600,letterSpacing:'0.02em'}}>{label}</span>
        </button>
      ))}
    </div>
  );
}

export default function Sidebar({contacts,activeId,onSelect,onNew,onNewGroup,onProfile,onSettings,onWallet,onLogout,wallet,isDemo,profile,onEditContact,onSearch,mobileOpen,onMobileClose,onLeaveGroup,onToggleMute,mutedGroupIds,darkMode,onToggleTheme,chatWallpaper,onSetWallpaper,onChangePassword,onNewGroupCreated,onManageGroup}){
  const [q,setQ]=useState('');
  const [canInstall,setCanInstall]=useState(false);
  const [pushState,setPushState]=useState('default');
  const [showIosHint,setShowIosHint]=useState(false);
  const [activeSection,setActiveSection]=useState('contacts');
  const [groupCtxMenu,setGroupCtxMenu]=useState(null);
  const groupLongPressRef=useRef(null);

  const [isMobile, setIsMobile] = useState(() => {
    if (typeof window === 'undefined') return false;
    return window.matchMedia('(max-width: 640px)').matches;
  });
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 640px)');
    const check = (e: any) => setIsMobile(e.matches);
    mq.addEventListener('change', check);
    // Sync on mount in case media query state changed before listener attached
    setIsMobile(mq.matches);
    return () => mq.removeEventListener('change', check);
  }, []);

  const isIos=()=>/iphone|ipad|ipod/i.test(navigator.userAgent);
  const isInStandaloneMode=()=>(window.navigator).standalone===true||window.matchMedia('(display-mode: standalone)').matches;

  useEffect(()=>{
    const off=onInstallAvailable(()=>setCanInstall(true));
    const state=getPushPermissionState();
    setPushState(state);
    if(isIos()&&!isInStandaloneMode()) setShowIosHint(true);
    if(state==='granted'&&wallet?.address) requestPushPermission(wallet.address).catch(()=>{});
    return off;
  },[wallet?.address]);

  // Settings inline state
  const [settingsSaved, setSettingsSaved] = useState(false);
  const [showPwSection, setShowPwSection] = useState(false);
  const [curPw, setCurPw] = useState('');
  const [newPw, setNewPw] = useState('');
  const [confirmPw, setConfirmPw] = useState('');
  const [pwError, setPwError] = useState('');
  const [pwSuccess, setPwSuccess] = useState(false);
  const [pwLoading, setPwLoading] = useState(false);

  const saveSettings = () => {
    setSettingsSaved(true);
    setTimeout(() => setSettingsSaved(false), 2000);
  };

  const handleChangePassword = async () => {
    setPwError('');
    if (!curPw) { setPwError('Enter your current password.'); return; }
    if (!newPw) { setPwError('Enter a new password.'); return; }
    if (newPw.length < 8) { setPwError('New password must be at least 8 characters.'); return; }
    if (newPw !== confirmPw) { setPwError('New passwords do not match.'); return; }
    if (newPw === curPw) { setPwError('New password must be different.'); return; }
    setPwLoading(true);
    try {
      await onChangePassword(curPw, newPw);
      setPwSuccess(true);
      setCurPw(''); setNewPw(''); setConfirmPw('');
      setTimeout(() => { setPwSuccess(false); setShowPwSection(false); }, 2500);
    } catch(e) {
      setPwError((e as any)?.message || 'Password change failed.');
    } finally { setPwLoading(false); }
  };

  const isInternalWallet = wallet?.address && !wallet?.isMetaMask && wallet?.privateKey !== 'metamask';

  const filtered=contacts
    .filter(c=>c.name.toLowerCase().includes(q.toLowerCase())||c.address.includes(q))
    .sort((a,b)=>{ if(a.isAI&&!b.isAI) return -1; if(!a.isAI&&b.isAI) return 1; return 0; });

  // Desktop icon rail nav button
  const NavBtn = ({id,label,Icon,onClick}) => {
    const isActive = activeSection===id;
    return (
      <button onClick={onClick||(() => setActiveSection(id))} title={label}
        style={{width:'100%',padding:'11px 0',background:'none',border:'none',cursor:'pointer',
          display:'flex',flexDirection:'column',alignItems:'center',gap:3,
          color:isActive?'var(--accent)':'rgba(255,255,255,0.38)',
          position:'relative',transition:'color .15s'}}>
        {isActive&&<div style={{position:'absolute',left:0,top:'50%',transform:'translateY(-50%)',
          width:3,height:24,background:'var(--accent)',borderRadius:'0 2px 2px 0'}}/>}
        <Icon/>
        <span style={{fontSize:8,fontFamily:'var(--sans)',fontWeight:700,letterSpacing:'0.05em',
          textTransform:'uppercase',lineHeight:1,opacity:isActive?1:0.7}}>{label}</span>
      </button>
    );
  };

  return(
    <div className={`sidebar-panel${mobileOpen?' mobile-open':''}`}
      style={{background:'var(--panel)',borderRight:'1px solid var(--border)',display:'flex',
        flexDirection: isMobile ? 'column' : 'row',overflow:'hidden'}}>

      {/* ── Desktop Icon Rail ─────────────────────────────────── */}
      {!isMobile && (
        <div style={{width:56,flexShrink:0,background:'rgba(0,0,0,0.2)',borderRight:'1px solid var(--border)',
          display:'flex',flexDirection:'column',alignItems:'center',paddingTop:8}}>
          <div style={{marginBottom:10,cursor:'pointer',padding:4,borderRadius:'50%',
            outline:activeSection==='profile'?'2px solid var(--accent)':'2px solid transparent',transition:'outline .15s'}}
            onClick={()=>setActiveSection('profile')}>
            {profile?.avatarUrl
              ? <ProfilePic avatarUrl={profile.avatarUrl}
                  initials={profile?.name?profile.name.slice(0,2).toUpperCase():'ME'}
                  color='var(--accent)' bg='#0a1f2a' size={32} fs={10}/>
              : <img src={'/pmt-logo.png'} style={{width:32,height:32,borderRadius:'50%',objectFit:'cover'}} alt="PM"/>
            }
          </div>
          <div style={{width:'65%',height:1,background:'var(--border)',marginBottom:4}}/>
          <NavBtn id="contacts" label="Chats"     Icon={IcoContacts}/>
          <NavBtn id="wallet"   label="Wallet"    Icon={IcoWallet}/>
          <NavBtn id="profile"  label="Profile"   Icon={IcoProfile}/>
          <NavBtn id="newgroup" label="New Group" Icon={IcoGroup} onClick={()=>setActiveSection('newgroup')}/>
          <NavBtn id="settings" label="Settings"  Icon={IcoSettings} onClick={()=>setActiveSection('settings')}/>
          <div style={{flex:1}}/>
          <div style={{width:'65%',height:1,background:'var(--border)',marginBottom:4}}/>
          <button onClick={onLogout} title="Log Out"
            style={{width:'100%',padding:'10px 0',background:'none',border:'none',cursor:'pointer',
              display:'flex',flexDirection:'column',alignItems:'center',gap:3,
              color:'var(--danger)',marginBottom:6,transition:'opacity .15s'}}
            onMouseEnter={e=>e.currentTarget.style.opacity='0.65'}
            onMouseLeave={e=>e.currentTarget.style.opacity='1'}>
            <IcoLogout/>
            <span style={{fontSize:8,fontFamily:'var(--sans)',fontWeight:700,letterSpacing:'0.05em',textTransform:'uppercase'}}>Exit</span>
          </button>
        </div>
      )}

      {/* ── Content Panel ─────────────────────────────────────── */}
      <div style={{flex:1,display:'flex',flexDirection:'column',overflow:'hidden',minWidth:0}}>

        {/* ══ CONTACTS ══ */}
        {activeSection==='contacts'&&<>
          {/* Header — desktop only */}
          {!isMobile && (
            <div style={{padding:'12px 12px 8px',borderBottom:'1px solid var(--border)',flexShrink:0}}>
              <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:6}}>
                <span style={{fontFamily:'var(--sans)',fontSize:11,fontWeight:700,letterSpacing:'0.12em',
                  textTransform:'uppercase',color:'var(--muted)'}}>Chats</span>
                <button onClick={onSearch} style={{width:26,height:26,background:'var(--surface)',border:'none',borderRadius:7,
                  color:'var(--muted)',fontSize:14,cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center'}}>⌕</button>
              </div>
              <div style={{display:'flex',alignItems:'center',gap:6,background:'rgba(118,118,128,0.18)',
                borderRadius:9,padding:'0 9px'}}>
                <span style={{fontSize:12,color:'var(--muted)'}}>⌕</span>
                <input placeholder="Search contacts..." value={q} onChange={e=>setQ(e.target.value)}
                  style={{flex:1,background:'transparent',border:'none',outline:'none',color:'var(--text)',fontSize:13,padding:'7px 0'}}/>
              </div>
            </div>
          )}

          {/* Mobile search bar (no header) */}
          {isMobile && (
            <div style={{padding:'calc(10px + var(--safe-top,0px)) 12px 6px',flexShrink:0}}>
              <div style={{display:'flex',alignItems:'center',gap:10,marginBottom:8}}>
                <span style={{color:'var(--text)',display:'flex',transform:'scale(1.2)'}}><IcoContacts/></span>
                <span style={{fontSize:17,fontWeight:700,color:'var(--text)'}}>Chats</span>
              </div>
              <div style={{display:'flex',alignItems:'center',gap:6,background:'rgba(118,118,128,0.18)',
                borderRadius:9,padding:'0 9px'}}>
                <span style={{fontSize:12,color:'var(--muted)'}}>⌕</span>
                <input placeholder="Search contacts..." value={q} onChange={e=>setQ(e.target.value)}
                  style={{flex:1,background:'transparent',border:'none',outline:'none',color:'var(--text)',fontSize:13,padding:'7px 0'}}/>
              </div>
            </div>
          )}

          {/* Action buttons row — mobile: shown in chats header; desktop: shown below search */}
          {isMobile ? (
            <div style={{display:'flex',gap:8,padding:'6px 12px 4px',flexShrink:0}}>
              <button onClick={onNew}
                style={{flex:1,padding:'8px 4px',background:'rgba(250,255,99,.1)',border:'1px solid rgba(250,255,99,.25)',
                  borderRadius:10,cursor:'pointer',display:'flex',flexDirection:'column',
                  alignItems:'center',gap:3,color:'var(--accent)',transition:'background .15s'}}
                onMouseEnter={e=>e.currentTarget.style.background='rgba(250,255,99,.18)'}
                onMouseLeave={e=>e.currentTarget.style.background='rgba(250,255,99,.1)'}>
                <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
                  <line x1="12" y1="9" x2="12" y2="13"/><line x1="10" y1="11" x2="14" y2="11"/>
                </svg>
                <span style={{fontSize:9,fontFamily:'var(--sans)',fontWeight:700,letterSpacing:'0.04em'}}>New Chat</span>
              </button>
              <button onClick={onNewGroup}
                style={{flex:1,padding:'8px 4px',background:'rgba(167,139,250,.1)',border:'1px solid rgba(167,139,250,.25)',
                  borderRadius:10,cursor:'pointer',display:'flex',flexDirection:'column',
                  alignItems:'center',gap:3,color:'var(--accent2)',transition:'background .15s'}}
                onMouseEnter={e=>e.currentTarget.style.background='rgba(167,139,250,.18)'}
                onMouseLeave={e=>e.currentTarget.style.background='rgba(167,139,250,.1)'}>
                <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="9" cy="7" r="4"/><path d="M3 21v-2a4 4 0 0 1 4-4h4a4 4 0 0 1 4 4v2"/>
                  <line x1="19" y1="8" x2="19" y2="14"/><line x1="16" y1="11" x2="22" y2="11"/>
                </svg>
                <span style={{fontSize:9,fontFamily:'var(--sans)',fontWeight:700,letterSpacing:'0.04em'}}>New Group</span>
              </button>
              <button onClick={onSearch}
                style={{flex:1,padding:'8px 4px',background:'rgba(255,255,255,.06)',border:'1px solid var(--border)',
                  borderRadius:10,cursor:'pointer',display:'flex',flexDirection:'column',
                  alignItems:'center',gap:3,color:'var(--muted)',transition:'background .15s'}}
                onMouseEnter={e=>e.currentTarget.style.background='rgba(255,255,255,.1)'}
                onMouseLeave={e=>e.currentTarget.style.background='rgba(255,255,255,.06)'}>
                <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
                </svg>
                <span style={{fontSize:9,fontFamily:'var(--sans)',fontWeight:700,letterSpacing:'0.04em'}}>Search</span>
              </button>
            </div>
          ) : (
            <button onClick={onNew} style={{margin:'8px 8px 2px',padding:'8px',background:'var(--accent)',border:'none',
              borderRadius:9,cursor:'pointer',fontFamily:'var(--sans)',fontSize:12,fontWeight:700,
              color:'#0a0c14',display:'flex',alignItems:'center',justifyContent:'center',gap:5,flexShrink:0}}>
              <span style={{fontSize:15}}>+</span> New Chat
            </button>
          )}

          {/* Contact count — desktop only */}
          {!isMobile && (
            <div style={{padding:'6px 12px 2px',fontFamily:'var(--sans)',fontSize:9,color:'var(--muted)',
              fontWeight:700,letterSpacing:'0.12em',textTransform:'uppercase',flexShrink:0}}>
              {contacts.length} contacts
            </div>
          )}

          {/* Contact list */}
          <div className="sidebar-contacts-list" style={{flex:1,overflowY:'auto'}}>
            {groupCtxMenu && createPortal(
              <div onClick={()=>setGroupCtxMenu(null)} style={{position:'fixed',inset:0,zIndex:9999}}>
                <div onClick={e=>e.stopPropagation()}
                  style={{position:'fixed',left:Math.min(groupCtxMenu.x,window.innerWidth-180),
                    top:Math.min(groupCtxMenu.y,window.innerHeight-110),
                    background:'var(--panel)',border:'1px solid var(--border)',
                    borderRadius:10,padding:'6px 0',minWidth:180,
                    boxShadow:'0 8px 32px rgba(0,0,0,.45)',zIndex:10000}}>
                  <button onClick={()=>{onToggleMute&&onToggleMute(groupCtxMenu.contact);setGroupCtxMenu(null);}}
                    style={{display:'flex',alignItems:'center',gap:10,width:'100%',
                      padding:'10px 16px',background:'none',border:'none',
                      color:'var(--text)',fontSize:13,cursor:'pointer',textAlign:'left'}}>
                    {mutedGroupIds?.has(groupCtxMenu.contact.groupId||groupCtxMenu.contact.id)?'🔔 Unmute group':'🔕 Mute group'}
                  </button>
                  <div style={{height:1,background:'var(--border)',margin:'4px 0'}}/>
                  <button onClick={()=>{
                      if(window.confirm(`Leave "${groupCtxMenu.contact.name}"?`)) onLeaveGroup&&onLeaveGroup(groupCtxMenu.contact);
                      setGroupCtxMenu(null);
                    }}
                    style={{display:'flex',alignItems:'center',gap:10,width:'100%',
                      padding:'10px 16px',background:'none',border:'none',
                      color:'#ff6b6b',fontSize:13,cursor:'pointer',textAlign:'left'}}>
                    🚪 Leave group
                  </button>
                </div>
              </div>, document.body
            )}
            {filtered.map(c=>{
              const isMuted = c.isGroup&&mutedGroupIds?.has(c.groupId||c.id);
              const openCtxMenu = c.isGroup?(x,y)=>setGroupCtxMenu({contact:c,x,y}):null;
              return (
                <div key={c.id} className="contact-row"
                  style={{display:'flex',alignItems:'center',gap:10,padding:'12px 14px',cursor:'pointer',
                    borderLeft:`2px solid ${activeId===c.id?'var(--accent)':'transparent'}`,
                    background:activeId===c.id?'var(--surface)':'transparent',transition:'background .12s',position:'relative'}}
                  onClick={()=>{onSelect(c);onMobileClose&&onMobileClose();}}
                  onContextMenu={openCtxMenu?(e)=>{e.preventDefault();openCtxMenu(e.clientX,e.clientY);}:undefined}
                  onTouchStart={openCtxMenu?(e)=>{const t=e.touches[0];groupLongPressRef.current=setTimeout(()=>openCtxMenu(t.clientX,t.clientY),600);}:undefined}
                  onTouchEnd={openCtxMenu?()=>clearTimeout(groupLongPressRef.current):undefined}
                  onTouchMove={openCtxMenu?()=>clearTimeout(groupLongPressRef.current):undefined}>
                  <ProfilePic initials={c.isGroup?'#':c.avatar} avatarUrl={c.avatarUrl}
                    color={c.isGroup?'var(--accent2)':c.color} bg={c.isGroup?'#1e1b30':c.bg} online={c.online}/>
                  <div style={{flex:1,minWidth:0}}>
                    <div style={{display:'flex',alignItems:'center',gap:4}}>
                      {c.isGroup&&<span style={{fontFamily:'var(--mono)',fontSize:8,background:'rgba(167,139,250,.2)',
                        border:'1px solid rgba(167,139,250,.3)',borderRadius:4,padding:'0 4px',color:'var(--accent2)'}}>GROUP</span>}
                      <div style={{fontSize:13,fontWeight:500,whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>{c.name}</div>
                      {isMuted&&<span style={{fontSize:10,color:'var(--muted)',flexShrink:0}}>🔕</span>}
                    </div>
                    <div style={{fontSize:11,color:'var(--muted)',whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis',marginTop:2}}>{c.preview||shortAddress(c.address)}</div>
                  </div>
                  {c.unread>0&&(
                    <div style={{minWidth:18,height:18,borderRadius:9,background:'var(--accent)',display:'flex',
                      alignItems:'center',justifyContent:'center',fontSize:10,fontWeight:700,color:'#0a0c14',padding:'0 4px',flexShrink:0}}>
                      {c.unread>99?'99+':c.unread}
                    </div>
                  )}
                  {!c.isGroup&&(
                    <button onClick={e=>{e.stopPropagation();onEditContact(c);}} className="edit-btn"
                      style={{opacity:0,position:'absolute',right:10,top:'50%',transform:'translateY(-50%)',
                        background:'var(--surface)',border:'1px solid var(--border)',borderRadius:6,
                        color:'var(--muted)',fontSize:11,cursor:'pointer',padding:'3px 7px',transition:'opacity .15s'}}
                      onMouseEnter={e=>e.currentTarget.style.opacity=1}
                      onMouseLeave={e=>e.currentTarget.style.opacity=0}>✎</button>
                  )}
                </div>
              );
            })}
          </div>

          {/* Install / Push banners */}
          {(canInstall||showIosHint||(wallet?.address&&pushState!=='granted'&&pushState!=='unsupported'))&&(
            <div style={{padding:'6px 8px',borderTop:'1px solid var(--border)',display:'flex',flexDirection:'column',gap:5,flexShrink:0}}>
              {canInstall&&!isRunningAsPWA()&&(
                <div onClick={async()=>{await triggerInstallPrompt();setCanInstall(false);}}
                  style={{padding:'7px 10px',background:'var(--accent)',borderRadius:9,cursor:'pointer',display:'flex',alignItems:'center',gap:7}}>
                  <span style={{fontSize:16}}>📲</span>
                  <div style={{fontFamily:'var(--sans)',fontWeight:700,fontSize:11,color:'#0a0c14'}}>Install PMT-Chat</div>
                </div>
              )}
              {showIosHint&&!canInstall&&(
                <div style={{padding:'7px 10px',background:'var(--surface)',border:'0.5px solid var(--border)',borderRadius:9,position:'relative'}}>
                  <button onClick={()=>setShowIosHint(false)} style={{position:'absolute',top:3,right:6,background:'none',border:'none',color:'var(--muted)',fontSize:13,cursor:'pointer'}}>×</button>
                  <div style={{fontFamily:'var(--sans)',fontSize:10,color:'var(--muted)'}}>
                    Tap <strong style={{color:'var(--accent)'}}>Share ↑</strong> → Add to Home Screen
                  </div>
                </div>
              )}
              {wallet?.address&&pushState!=='granted'&&pushState!=='unsupported'&&(
                <div onClick={async()=>{const ok=await requestPushPermission(wallet.address);setPushState(ok?'granted':'denied');}}
                  style={{padding:'7px 10px',background:'var(--surface)',borderRadius:9,cursor:'pointer',display:'flex',alignItems:'center',gap:7,border:'0.5px solid var(--border)'}}>
                  <span style={{fontSize:16}}>🔔</span>
                  <div style={{fontFamily:'var(--sans)',fontSize:11,color:'var(--text)'}}>Enable Notifications</div>
                </div>
              )}
            </div>
          )}

          {/* Mobile bottom tab bar */}
          {isMobile && <MobileBottomTabs activeSection={activeSection} setActiveSection={setActiveSection} onSettings={onSettings}/>}
        </>}

        {/* ══ WALLET ══ */}
        {activeSection==='wallet'&&<>
          {!isMobile&&<div style={{padding:'12px 12px 10px',borderBottom:'1px solid var(--border)',flexShrink:0}}>
            <span style={{fontFamily:'var(--sans)',fontSize:11,fontWeight:700,letterSpacing:'0.12em',textTransform:'uppercase',color:'var(--muted)'}}>Wallet</span>
          </div>}
          <div style={{flex:1,overflowY:'auto',
            padding: isMobile ? 'calc(16px + var(--safe-top,0px)) 12px 12px' : '12px 10px',
            display:'flex',flexDirection:'column',gap:10}}>
            {isMobile&&<div style={{display:'flex',alignItems:'center',gap:10,marginBottom:4}}>
              <span style={{color:'var(--text)',display:'flex',transform:'scale(1.2)'}}><IcoWallet/></span>
              <span style={{fontSize:17,fontWeight:700,color:'var(--text)'}}>Wallet</span>
            </div>}
            <div onClick={onWallet}
              style={{padding:'14px',background:'var(--surface)',borderRadius:12,cursor:'pointer',border:'1px solid var(--border)',transition:'border-color .15s'}}
              onMouseEnter={e=>e.currentTarget.style.borderColor='var(--accent)'}
              onMouseLeave={e=>e.currentTarget.style.borderColor='var(--border)'}>
              <div style={{fontFamily:'var(--sans)',fontSize:10,color:'var(--muted)',fontWeight:600,marginBottom:6,textTransform:'uppercase',letterSpacing:'0.1em'}}>Wallet Address</div>
              <div style={{fontFamily:'var(--mono)',fontSize:10,color:'var(--text)',wordBreak:'break-all',marginBottom:10,lineHeight:1.5}}>
                {wallet?.address||'Not connected'}
              </div>
              <div style={{display:'flex',alignItems:'center',justifyContent:'space-between'}}>
                <span style={{fontSize:16,color:'var(--accent3)',fontWeight:600}}>◈ {wallet?.balance||'0.000'} PMT</span>
                <span style={{fontFamily:'var(--sans)',fontSize:10,fontWeight:700,background:'rgba(10,132,255,.15)',borderRadius:6,padding:'3px 9px',color:'var(--accent)'}}>
                  {wallet?.network||'—'}
                </span>
              </div>
            </div>
            <SwitchNetworkButton/>
            <button onClick={onWallet}
              style={{padding:'10px',background:'var(--accent)',border:'none',borderRadius:9,cursor:'pointer',fontFamily:'var(--sans)',fontSize:12,fontWeight:700,color:'#0a0c14'}}>
              Open Wallet →
            </button>
          </div>
          {isMobile && <MobileBottomTabs activeSection={activeSection} setActiveSection={setActiveSection} onSettings={onSettings}/>}
        </>}

        {/* ══ PROFILE ══ */}
        {activeSection==='profile'&&<>
          {!isMobile&&<div style={{padding:'12px 12px 10px',borderBottom:'1px solid var(--border)',flexShrink:0}}>
            <span style={{fontFamily:'var(--sans)',fontSize:11,fontWeight:700,letterSpacing:'0.12em',textTransform:'uppercase',color:'var(--muted)'}}>My Profile</span>
          </div>}
          <div style={{flex:1,overflowY:'auto',
            padding: isMobile ? 'calc(16px + var(--safe-top,0px)) 14px 16px' : '20px 14px',
            display:'flex',flexDirection:'column',alignItems:'center',gap:12}}>
            {isMobile&&<div style={{display:'flex',alignItems:'center',gap:10,width:'100%',marginBottom:4}}>
              <span style={{color:'var(--text)',display:'flex',transform:'scale(1.2)'}}><IcoProfile/></span>
              <span style={{fontSize:17,fontWeight:700,color:'var(--text)'}}>Profile</span>
            </div>}
            <div style={{position:'relative',cursor:'pointer'}} onClick={onProfile}>
              {profile?.avatarUrl
                ? <ProfilePic avatarUrl={profile.avatarUrl}
                    initials={profile?.name?profile.name.slice(0,2).toUpperCase():'ME'}
                    color='var(--accent)' bg='#0a1f2a' size={70} fs={22}/>
                : <div style={{width:70,height:70,borderRadius:'50%',background:'var(--surface)',
                    border:'2px solid var(--border)',display:'flex',alignItems:'center',justifyContent:'center',fontSize:28,color:'var(--muted)'}}>👤</div>
              }
              <div style={{position:'absolute',bottom:2,right:0,width:20,height:20,background:'var(--accent)',
                borderRadius:'50%',display:'flex',alignItems:'center',justifyContent:'center',fontSize:10,color:'#0a0c14',fontWeight:700}}>✎</div>
            </div>
            <div style={{textAlign:'center'}}>
              <div style={{fontSize:17,fontWeight:700,marginBottom:3}}>
                {profile?.name||wallet?.username||'Unnamed'}
              </div>
              {profile?.bio&&<div style={{fontSize:12,color:'var(--muted)',lineHeight:1.5,maxWidth:190}}>{profile.bio}</div>}
            </div>
            <div style={{width:'100%',padding:'10px 12px',background:'var(--surface)',borderRadius:9,border:'1px solid var(--border)'}}>
              <div style={{fontFamily:'var(--sans)',fontSize:9,color:'var(--muted)',fontWeight:700,textTransform:'uppercase',letterSpacing:'0.1em',marginBottom:3}}>Wallet Address</div>
              <div style={{fontFamily:'var(--mono)',fontSize:9,color:'var(--accent)',wordBreak:'break-all',lineHeight:1.5}}>
                {wallet?.address||'Not connected'}
              </div>
            </div>
            <button onClick={onProfile} style={{width:'100%',padding:'10px',background:'var(--surface)',
              border:'1px solid var(--border)',borderRadius:9,cursor:'pointer',fontFamily:'var(--sans)',
              fontSize:12,fontWeight:600,color:'var(--text)',transition:'border-color .15s'}}
              onMouseEnter={e=>e.currentTarget.style.borderColor='var(--accent)'}
              onMouseLeave={e=>e.currentTarget.style.borderColor='var(--border)'}>
              ✎ Edit Profile
            </button>
            <div style={{width:'100%',height:1,background:'var(--border)'}}/>
            <button onClick={onLogout}
              style={{width:'100%',padding:'11px',background:'rgba(248,113,113,.08)',
                border:'1px solid rgba(248,113,113,.25)',borderRadius:9,cursor:'pointer',
                fontFamily:'var(--sans)',fontSize:13,fontWeight:700,color:'var(--danger)',
                display:'flex',alignItems:'center',justifyContent:'center',gap:8,transition:'background .15s'}}
              onMouseEnter={e=>e.currentTarget.style.background='rgba(248,113,113,.18)'}
              onMouseLeave={e=>e.currentTarget.style.background='rgba(248,113,113,.08)'}>
              <IcoLogout/> Log Out
            </button>
          </div>
          {isMobile && <MobileBottomTabs activeSection={activeSection} setActiveSection={setActiveSection} onSettings={onSettings}/>}
        </>}

        {/* ══ SETTINGS ══ (mobile only — desktop never reaches this because its NavBtn calls onSettings modal) */}
        {activeSection==='settings'&&<>
          <div style={{flex:1,overflowY:'auto',
            padding: isMobile ? 'calc(14px + var(--safe-top,0px)) 14px 12px' : '14px 12px',
            display:'flex',flexDirection:'column',gap:14,overscrollBehavior:'contain'}}>

            {/* Header label */}
            <div style={{display:'flex',alignItems:'center',gap:10}}>
              <span style={{color:'var(--text)',display:'flex',transform:'scale(1.2)'}}><IcoSettings/></span>
              <span style={{fontSize:17,fontWeight:700,color:'var(--text)'}}>Settings</span>
            </div>

            {/* APPEARANCE */}
            <div style={{background:'var(--surface2)',border:'1px solid var(--border)',borderRadius:12,padding:'14px 16px',display:'flex',flexDirection:'column',gap:10}}>
              <div style={{display:'flex',alignItems:'center',gap:8}}>
                <span style={{color:'var(--accent)',display:'flex'}}><IcoAppearance/></span>
                <span style={{fontFamily:'var(--mono)',fontSize:11,color:'var(--accent)',fontWeight:700,letterSpacing:'1px'}}>APPEARANCE</span>
              </div>
              <div style={{display:'flex',alignItems:'center',justifyContent:'space-between'}}>
                <div>
                  <div style={{fontSize:13,color:'var(--text)',fontWeight:500}}>{darkMode?'Dark Mode':'Light Mode'}</div>
                  <div style={{fontSize:11,color:'var(--muted)',marginTop:2}}>Switch between dark and light theme</div>
                </div>
                <button onClick={onToggleTheme}
                  style={{width:52,height:28,borderRadius:14,border:'none',cursor:'pointer',position:'relative',
                    background:darkMode?'var(--accent)':'var(--muted)',transition:'background .2s',flexShrink:0}}>
                  <div style={{position:'absolute',top:3,left:darkMode?26:3,width:22,height:22,borderRadius:'50%',
                    background:darkMode?'#000':'#fff',transition:'left .2s',boxShadow:'0 1px 4px rgba(0,0,0,.3)'}}/>
                </button>
              </div>
            </div>

            {/* CHAT WALLPAPER */}
            <div style={{background:'var(--surface2)',border:'1px solid var(--border)',borderRadius:12,padding:'14px 16px',display:'flex',flexDirection:'column',gap:10}}>
              <div style={{display:'flex',alignItems:'center',gap:8}}>
                <span style={{color:'var(--accent)',display:'flex'}}><IcoContacts/></span>
                <span style={{fontFamily:'var(--mono)',fontSize:11,color:'var(--accent)',fontWeight:700,letterSpacing:'1px'}}>CHAT</span>
              </div>
              <div>
                <div style={{fontSize:12,color:'var(--muted)',marginBottom:10}}>Chat Wallpaper</div>
                <div style={{display:'flex',gap:10,alignItems:'center',flexWrap:'wrap'}}>
                  <button onClick={()=>onSetWallpaper&&onSetWallpaper('none')} title="No wallpaper"
                    style={{width:56,height:56,borderRadius:10,border:`2px solid ${chatWallpaper==='none'?'var(--accent)':'var(--border)'}`,
                      background:'var(--bg)',cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center',
                      flexShrink:0,transition:'border-color .15s',outline:'none'}}>
                    <span style={{fontSize:20}}>🚫</span>
                  </button>
                  {['wallpaper1','wallpaper2','wallpaper3'].map(wp=>(
                    <button key={wp} onClick={()=>onSetWallpaper&&onSetWallpaper(wp)} title={`Wallpaper ${wp.replace('wallpaper','')}`}
                      style={{width:56,height:56,borderRadius:10,
                        border:`2px solid ${chatWallpaper===wp?'var(--accent)':'var(--border)'}`,
                        backgroundImage:`url(/${wp}.png?v=2)`,backgroundSize:'contain',
                        backgroundPosition:'center',backgroundRepeat:'no-repeat',
                        cursor:'pointer',flexShrink:0,transition:'border-color .15s',outline:'none',position:'relative'}}>
                      {chatWallpaper===wp&&<div style={{position:'absolute',inset:0,borderRadius:8,
                        background:'rgba(250,255,99,.2)',display:'flex',alignItems:'center',justifyContent:'center'}}>
                        <span style={{fontSize:16}}>✓</span></div>}
                    </button>
                  ))}
                </div>
                <div style={{fontSize:10,color:'var(--muted)',marginTop:8,fontFamily:'var(--mono)'}}>
                  {chatWallpaper==='none'?'No wallpaper selected':`Wallpaper ${chatWallpaper.replace('wallpaper','')} active`}
                </div>
              </div>
            </div>

            {/* SECURITY — password change (internal wallet only) */}
            {isInternalWallet&&!isDemo&&(
              <div style={{background:'var(--surface2)',border:'1px solid var(--border)',borderRadius:12,padding:'14px 16px',display:'flex',flexDirection:'column',gap:10}}>
                <div style={{display:'flex',alignItems:'center',gap:8}}>
                  <span style={{fontSize:18}}>🔑</span>
                  <span style={{fontFamily:'var(--mono)',fontSize:11,color:'var(--accent)',fontWeight:700,letterSpacing:'1px'}}>SECURITY</span>
                </div>
                {!showPwSection ? (
                  <div style={{display:'flex',alignItems:'center',justifyContent:'space-between'}}>
                    <div>
                      <div style={{fontSize:13,color:'var(--text)',fontWeight:500}}>Change Password</div>
                      <div style={{fontSize:11,color:'var(--muted)',marginTop:2}}>Update your account password</div>
                    </div>
                    <button onClick={()=>setShowPwSection(true)}
                      style={{padding:'7px 14px',background:'var(--surface)',border:'1px solid var(--border)',
                        borderRadius:8,color:'var(--text)',fontSize:12,cursor:'pointer',fontWeight:500}}>
                      Change
                    </button>
                  </div>
                ) : (
                  <div style={{display:'flex',flexDirection:'column',gap:10}}>
                    {[['CURRENT PASSWORD',curPw,setCurPw,'Your current password'],
                      ['NEW PASSWORD',newPw,setNewPw,'At least 8 characters'],
                      ['CONFIRM NEW PASSWORD',confirmPw,setConfirmPw,'Repeat new password']].map(([lbl,val,setter,ph])=>(
                      <div key={lbl}>
                        <div style={{fontFamily:'var(--mono)',fontSize:9,color:'var(--muted)',letterSpacing:'1px',marginBottom:5}}>{lbl}</div>
                        <input type="password" value={val} onChange={e=>setter(e.target.value)} placeholder={ph}
                          style={{width:'100%',background:'var(--bg)',border:'1px solid var(--border)',borderRadius:8,
                            padding:'9px 12px',color:'var(--text)',fontFamily:'var(--mono)',fontSize:11,outline:'none',boxSizing:'border-box'}}/>
                      </div>
                    ))}
                    {pwError&&<div style={{fontSize:12,color:'var(--danger)',background:'rgba(248,113,113,.1)',border:'1px solid rgba(248,113,113,.3)',borderRadius:8,padding:'8px 10px'}}>{pwError}</div>}
                    {pwSuccess&&<div style={{fontSize:12,color:'#34d399',background:'rgba(52,211,153,.1)',border:'1px solid rgba(52,211,153,.3)',borderRadius:8,padding:'8px 10px'}}>✓ Password changed!</div>}
                    <div style={{display:'flex',gap:8}}>
                      <button onClick={()=>{setShowPwSection(false);setCurPw('');setNewPw('');setConfirmPw('');setPwError('');}}
                        style={{flex:1,padding:'9px',background:'var(--surface)',border:'1px solid var(--border)',borderRadius:8,color:'var(--muted)',fontSize:13,cursor:'pointer'}}>
                        Cancel
                      </button>
                      <button onClick={handleChangePassword} disabled={pwLoading}
                        style={{flex:2,padding:'9px',background:'var(--accent)',border:'none',borderRadius:8,color:'#000',fontWeight:700,fontSize:13,cursor:pwLoading?'default':'pointer',opacity:pwLoading?0.7:1}}>
                        {pwLoading?'Updating...':'🔑 Update Password'}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Save button */}
            <button onClick={saveSettings}
              style={{width:'100%',padding:'12px',background:settingsSaved?'#34d399':'var(--accent)',border:'none',
                borderRadius:10,color:settingsSaved?'#fff':'#000',fontWeight:700,fontSize:14,cursor:'pointer',
                transition:'background .2s',fontFamily:'var(--sans)'}}>
              {settingsSaved ? '✓ Saved!' : 'Save Settings'}
            </button>

          </div>
          {isMobile && <MobileBottomTabs activeSection={activeSection} setActiveSection={setActiveSection} onSettings={onSettings}/>}
        </>}

        {/* ══ NEW GROUP ══ */}
        {activeSection==='newgroup'&&(
          <GroupChatModal
            inline={true}
            contacts={contacts}
            onClose={()=>setActiveSection('contacts')}
            onCreate={(contact)=>{
              setActiveSection('contacts');
              onNewGroupCreated&&onNewGroupCreated(contact);
            }}
            myAddress={wallet?.address??''}
          />
        )}

      </div>
    </div>
  );
}
