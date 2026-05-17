// @ts-nocheck
import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import Avatar from '../ui/Avatar';

export default function EditContactModal({contact,onClose,onSave,onDelete}){
  // Lock chat scroll while modal is open
  React.useEffect(() => {
    const chatArea = document.querySelector('.chat-messages-area');
    const prev = chatArea ? chatArea.style.overflowY : '';
    if (chatArea) chatArea.style.overflowY = 'hidden';
    return () => { if (chatArea) chatArea.style.overflowY = prev || ''; };
  }, []);

  const [name,setName]=useState(contact.name||'');
  const [address,setAddress]=useState(contact.address||'');
  const [confirmDel,setConfirmDel]=useState(false);
  const [tab,setTab]=useState('profile'); // 'profile' | 'edit'
  const [imgFull,setImgFull]=useState(false);
  return(
    <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,.7)',display:'flex',alignItems:'center',
      justifyContent:'center',zIndex:200}} onClick={onClose} onWheel={e=>e.stopPropagation()}>
      <div className="modal-inner" style={{background:'var(--panel)',border:'1px solid var(--border)',borderRadius:18,padding:28,
        width:380,display:'flex',flexDirection:'column',gap:16,animation:'slideUp .25s ease'}}
        onClick={e=>e.stopPropagation()}>

        {/* Header */}
        <div style={{display:'flex',alignItems:'center',justifyContent:'space-between'}}>
          <div style={{fontSize:17,fontWeight:600}}>Contact</div>
          <button onClick={onClose} style={{background:'none',border:'none',color:'var(--muted)',fontSize:20,cursor:'pointer'}}>×</button>
        </div>

        {/* Tab switcher */}
        <div style={{display:'flex',gap:6}}>
          {['profile','edit'].map(t=>(
            <button key={t} onClick={()=>setTab(t)}
              style={{flex:1,padding:'8px',borderRadius:9,border:'1px solid var(--border)',
                background:tab===t?'var(--surface2)':'transparent',
                color:tab===t?'var(--text)':'var(--muted)',fontSize:12,cursor:'pointer',
                fontFamily:'var(--mono)',letterSpacing:'1px',textTransform:'uppercase'}}>
              {t}
            </button>
          ))}
        </div>

        {tab==='profile' ? (
          /* ── Profile view ── */
          <div style={{display:'flex',flexDirection:'column',alignItems:'center',gap:14}}>
            {/* Avatar — click to view fullscreen */}
            {imgFull && contact.avatarUrl && createPortal(
              <div onClick={()=>setImgFull(false)}
                style={{position:'fixed',inset:0,background:'rgba(0,0,0,.92)',display:'flex',
                  alignItems:'center',justifyContent:'center',zIndex:9999,cursor:'zoom-out',
                  animation:'fadeIn .15s ease'}}>
                <img src={contact.avatarUrl} alt={contact.name}
                  style={{maxWidth:'90vw',maxHeight:'90vh',borderRadius:16,objectFit:'contain',
                    boxShadow:'0 24px 80px rgba(0,0,0,.8)',animation:'slideUp .2s ease'}}/>
                <div style={{position:'absolute',top:20,right:20,background:'rgba(255,255,255,.15)',
                  borderRadius:'50%',width:40,height:40,display:'flex',alignItems:'center',
                  justifyContent:'center',fontSize:20,color:'#fff',cursor:'pointer'}}>×</div>
                <div style={{position:'absolute',bottom:28,color:'rgba(255,255,255,.85)',
                  fontSize:15,fontWeight:600}}>{contact.name}</div>
              </div>, document.body
            )}
            <div
              onClick={()=>{ if(contact.avatarUrl) setImgFull(true); }}
              style={{width:88,height:88,borderRadius:'50%',background:contact.bg||'#1e2438',
                display:'flex',alignItems:'center',justifyContent:'center',
                fontSize:28,fontWeight:700,color:contact.color||'var(--accent)',
                overflow:'hidden',flexShrink:0,border:'2px solid var(--border)',
                cursor:contact.avatarUrl?'zoom-in':'default',
                boxShadow:contact.avatarUrl?'0 4px 16px rgba(0,0,0,.3)':undefined}}>
              {contact.avatarUrl
                ? <img src={contact.avatarUrl} alt={name}
                    style={{width:'100%',height:'100%',objectFit:'cover'}}
                    onError={e=>{(e.target as HTMLImageElement).style.display='none';}}/>
                : (name||contact.avatar||'?').slice(0,2).toUpperCase()}
            </div>

            {/* Badge */}
            <div style={{display:'flex',alignItems:'center',gap:5,padding:'3px 10px',
              background:'rgba(99,210,255,.08)',border:'1px solid rgba(99,210,255,.25)',
              borderRadius:20,fontFamily:'var(--mono)',fontSize:9,
              color:'var(--accent)',letterSpacing:'1px'}}>
              <div style={{width:5,height:5,borderRadius:'50%',background:'var(--accent3)'}}/>
              PMT CHAIN USER
            </div>

            {/* Name */}
            <div style={{fontSize:18,fontWeight:600,color:'var(--text)',textAlign:'center'}}>
              {contact.name||'Unknown'}
            </div>

            {/* Bio */}
            {contact.bio ? (
              <div style={{background:'var(--surface)',border:'1px solid var(--border)',borderRadius:10,
                padding:'12px 14px',width:'100%',textAlign:'center'}}>
                <div style={{fontFamily:'var(--mono)',fontSize:9,color:'var(--muted)',letterSpacing:'1px',marginBottom:6}}>BIO</div>
                <div style={{fontSize:13,color:'var(--text2)',lineHeight:1.5}}>{contact.bio}</div>
              </div>
            ) : (
              <div style={{fontSize:12,color:'var(--muted)',fontStyle:'italic'}}>No bio yet</div>
            )}

            {/* Address */}
            <div style={{background:'var(--surface)',border:'1px solid var(--border)',borderRadius:9,
              padding:'10px 13px',width:'100%'}}>
              <div style={{fontFamily:'var(--mono)',fontSize:9,color:'var(--muted)',letterSpacing:'1px',marginBottom:4}}>WALLET ADDRESS</div>
              <div style={{fontFamily:'var(--mono)',fontSize:11,color:'var(--accent)',wordBreak:'break-all'}}>
                {contact.address||'Unknown'}
              </div>
            </div>

            <div style={{fontSize:11,color:'var(--muted)',textAlign:'center',lineHeight:1.4}}>
              Profile info is received automatically when they send you a message.
            </div>
          </div>
        ) : (
          /* ── Edit view ── */
          <>
            <div style={{display:'flex',flexDirection:'column',alignItems:'center',gap:8}}>
              <div style={{width:68,height:68,borderRadius:'50%',background:contact.bg||'#1e2438',
                display:'flex',alignItems:'center',justifyContent:'center',
                fontSize:22,fontWeight:700,color:contact.color||'var(--accent)',
                overflow:'hidden',flexShrink:0}}>
                {contact.avatarUrl
                  ? <img src={contact.avatarUrl} alt={name}
                      style={{width:'100%',height:'100%',objectFit:'cover'}}
                      onError={e=>{(e.target as HTMLImageElement).style.display='none';}}/>
                  : (name||contact.avatar||'?').slice(0,2).toUpperCase()}
              </div>
            </div>

            {[['DISPLAY NAME',name,setName,'e.g. Alice or alice.eth'],
              ['WALLET ADDRESS',address,setAddress,'0x...']].map(([lbl,val,set,ph])=>(
              <div key={lbl}>
                <div style={{fontFamily:'var(--mono)',fontSize:9,color:'var(--muted)',letterSpacing:'1px',marginBottom:5}}>{lbl}</div>
                <input value={val} onChange={e=>set(e.target.value)} placeholder={ph}
                  style={{width:'100%',background:'var(--surface)',border:'1px solid var(--border)',borderRadius:9,
                    padding:'10px 13px',color:'var(--text)',fontFamily:'var(--sans)',fontSize:13.5,outline:'none'}}/>
              </div>
            ))}
            <div style={{display:'flex',gap:10,marginTop:4}}>
              <button onClick={onClose}
                style={{flex:1,padding:10,background:'transparent',border:'1px solid var(--border)',
                  borderRadius:9,color:'var(--text2)',fontSize:13.5,cursor:'pointer'}}>Cancel</button>
              <button onClick={()=>onSave({name:name.trim()||contact.name,address:address.trim()||contact.address})}
                style={{flex:2,padding:10,background:'var(--accent)',border:'none',
                  borderRadius:9,color:'#0a0c14',fontWeight:600,fontSize:13.5,cursor:'pointer'}}>Save</button>
            </div>
            {!confirmDel
              ? <button onClick={()=>setConfirmDel(true)}
                  style={{padding:9,background:'transparent',border:'1px solid rgba(248,113,113,.3)',
                    borderRadius:9,color:'var(--danger)',fontSize:12.5,cursor:'pointer'}}>
                  Delete Contact
                </button>
              : <div style={{display:'flex',gap:8}}>
                  <span style={{flex:1,fontSize:12,color:'var(--text2)',alignSelf:'center'}}>Remove {contact.name}?</span>
                  <button onClick={()=>setConfirmDel(false)}
                    style={{padding:'7px 14px',background:'var(--surface)',border:'1px solid var(--border)',
                      borderRadius:8,color:'var(--text2)',fontSize:12,cursor:'pointer'}}>No</button>
                  <button onClick={()=>{onDelete(contact.id);onClose();}}
                    style={{padding:'7px 14px',background:'var(--danger)',border:'none',
                      borderRadius:8,color:'#fff',fontSize:12,fontWeight:600,cursor:'pointer'}}>Yes, Delete</button>
                </div>
            }
          </>
        )}
      </div>
    </div>
  );
}
