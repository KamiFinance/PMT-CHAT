// @ts-nocheck
import React, { useState } from 'react';
import ProfilePic from '../ui/ProfilePic';
import SendModal from '../modals/SendModal';
import { SwitchNetworkCompact } from './SwitchNetworkButton';

export default function MobileTopbar({contact,onOpenSidebar,onBack,wallet,isDemo,profile,onViewContact,onSendETH,needsPasswordToSend}){
  const [showSend,setShowSend]=useState(false);
  if(contact){
    return(
      <>
      <div className="mobile-topbar" style={{display:'none',alignItems:'center',gap:10,
        padding:'10px 14px',background:'var(--panel)',borderBottom:'1px solid var(--border)',
        flexShrink:0,minHeight:54,zIndex:10}}>
        <button onClick={onBack}
          style={{background:'none',border:'none',color:'var(--accent)',fontSize:26,
            cursor:'pointer',padding:'2px 10px 2px 0',lineHeight:1,flexShrink:0,fontWeight:300}}>
          ‹
        </button>
        <div onClick={onViewContact&&!contact.isGroup?()=>onViewContact(contact):undefined}
          style={{display:'flex',alignItems:'center',gap:10,flex:1,minWidth:0,
            cursor:onViewContact&&!contact.isGroup?'pointer':'default',
            WebkitTapHighlightColor:'transparent'}}>
          <ProfilePic initials={contact.isGroup?'#':(contact.avatar||contact.name?.slice(0,2).toUpperCase()||'?')} avatarUrl={contact.avatarUrl||null}
            color={contact.isGroup?'var(--accent2)':(contact.color||'var(--accent2)')}
            bg={contact.isGroup?'#1e1b30':(contact.bg||'#1e1b30')} online={contact.online||false} size={34} fs={12}/>
          <div style={{minWidth:0}}>
            <div style={{fontSize:14,fontWeight:600,whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>{contact.name}</div>
            <div style={{fontFamily:'var(--mono)',fontSize:9,color:'var(--accent)',opacity:.8}}>
              {contact.isGroup?`${contact.members?.length||0} members`:contact.online?'● online':'PMTchain'}
            </div>
          </div>
        </div>
        {/* Network indicator + ↑PMT button */}
        <SwitchNetworkCompact/>
        {!contact.isGroup&&!contact.isAI&&onSendETH&&(
          <button onClick={()=>setShowSend(true)}
            style={{background:'var(--surface)',border:'1px solid var(--border)',
              borderRadius:8,color:'var(--accent2)',fontSize:11,fontWeight:600,
              cursor:'pointer',padding:'5px 9px',flexShrink:0,
              WebkitTapHighlightColor:'transparent'}}>
            ↑ PMT
          </button>
        )}
      </div>
      {showSend&&onSendETH&&(
        <SendModal contact={contact} onClose={()=>setShowSend(false)}
          onSend={(amt,pwd)=>onSendETH(contact,amt,pwd)} isDemo={isDemo}
          needsPassword={!!needsPasswordToSend}/>
      )}
      </>
    );
  }
  return(
    <div className="mobile-topbar" style={{display:'none',alignItems:'center',gap:10,
      padding:'10px 14px',background:'var(--panel)',borderBottom:'1px solid var(--border)',
      flexShrink:0,minHeight:54,zIndex:10}}>
      <button onClick={onOpenSidebar}
        style={{background:'var(--surface)',border:'1px solid var(--border)',borderRadius:8,
          color:'var(--text)',fontSize:18,cursor:'pointer',padding:'6px 10px',
          lineHeight:1,flexShrink:0,display:'flex',alignItems:'center',justifyContent:'center'}}>
        ☰
      </button>
      <img src={'/pmt-logo.png'} style={{width:30,height:30,borderRadius:8,objectFit:'cover'}} alt="PM"/>
      <div style={{flex:1}}>
        <div style={{fontSize:14,fontWeight:600}}>PMT-Chat</div>
        <div style={{fontFamily:'var(--mono)',fontSize:9,color:isDemo?'var(--muted)':'var(--accent)'}}>
          {wallet?.address?wallet.address.slice(0,8)+'...'+wallet.address.slice(-4):isDemo?'demo mode':'not connected'}
        </div>
      </div>
      {profile?.avatarUrl
        ? <ProfilePic avatarUrl={profile.avatarUrl} initials='ME' color='var(--accent)' bg='#0a1f2a' size={32} fs={11}/>
        : null}
    </div>
  );
}
