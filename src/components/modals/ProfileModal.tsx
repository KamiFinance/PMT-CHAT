// @ts-nocheck
import Avatar from '../ui/Avatar';
import React, { useState, useEffect, useRef, useCallback } from 'react';

import ProfilePic from '../ui/ProfilePic';
export default function ProfileModal({profile,onClose,onSave}){
  // Lock chat scroll while modal is open
  React.useEffect(() => {
    const chatArea = document.querySelector('.chat-messages-area');
    const prev = chatArea ? chatArea.style.overflowY : '';
    if (chatArea) chatArea.style.overflowY = 'hidden';
    return () => { if (chatArea) chatArea.style.overflowY = prev || ''; };
  }, []);

  const [name,setName]=useState(profile.name||'');
  const [bio,setBio]=useState(profile.bio||'');
  const [avatar,setAvatar]=useState(profile.avatarUrl||null);
  const [dragging,setDragging]=useState(false);
  const fileRef=useRef(null);

  const handleFile=file=>{
    if(!file||!file.type.startsWith('image/'))return;
    const r=new FileReader();
    r.onload=e=>setAvatar(e.target.result);
    r.readAsDataURL(file);
  };

  const onDrop=e=>{
    e.preventDefault();setDragging(false);
    handleFile(e.dataTransfer.files[0]);
  };

  const save=()=>{
    onSave({name:name.trim()||profile.name,bio:bio.trim(),avatarUrl:avatar,address:profile.address});
    onClose();
  };

  return(
    <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,.7)',display:'flex',alignItems:'center',
      justifyContent:'center',zIndex:200,overflowY:'auto',padding:'12px 0'}} onClick={onClose} onWheel={e=>e.stopPropagation()}>
      <div className="modal-inner" style={{background:'var(--panel)',border:'1px solid var(--border)',borderRadius:18,padding:28,
        width:400,display:'flex',flexDirection:'column',gap:18,margin:'auto'}} onClick={e=>e.stopPropagation()}>

        {/* Header */}
        <div style={{display:'flex',alignItems:'center',justifyContent:'space-between'}}>
          <div style={{fontSize:18,fontWeight:600}}>Edit Profile</div>
          <button onClick={onClose} style={{background:'none',border:'none',color:'var(--muted)',fontSize:20,cursor:'pointer'}}>×</button>
        </div>

        {/* Avatar upload */}
        <div style={{display:'flex',flexDirection:'column',alignItems:'center',gap:12}}>
          <div
            onDragOver={e=>{e.preventDefault();setDragging(true)}}
            onDragLeave={()=>setDragging(false)}
            onDrop={onDrop}
            onClick={()=>fileRef.current.click()}
            style={{width:100,height:100,borderRadius:'50%',cursor:'pointer',position:'relative',
              border:`2px dashed ${dragging?'var(--accent)':'var(--border)'}`,
              background:avatar?'transparent':'var(--surface)',
              display:'flex',alignItems:'center',justifyContent:'center',
              overflow:'hidden',transition:'border-color .2s'}}>
            {avatar
              ? <img src={avatar} style={{width:'100%',height:'100%',objectFit:'cover'}} alt="avatar"/>
              : <div style={{textAlign:'center',color:'var(--muted)'}}>
                  <div style={{fontSize:28}}>📷</div>
                  <div style={{fontSize:10,marginTop:4,fontFamily:'var(--mono)'}}>UPLOAD</div>
                </div>
            }
            {/* Hover overlay */}
            <div style={{position:'absolute',inset:0,background:'rgba(0,0,0,.45)',display:'flex',
              alignItems:'center',justifyContent:'center',opacity:0,transition:'opacity .2s',borderRadius:'50%'}}
              onMouseEnter={e=>e.currentTarget.style.opacity=1}
              onMouseLeave={e=>e.currentTarget.style.opacity=0}>
              <span style={{color:'#fff',fontSize:11,fontFamily:'var(--mono)'}}>CHANGE</span>
            </div>
          </div>
          <input ref={fileRef} type="file" accept="image/*" style={{display:'none'}}
            onChange={e=>handleFile(e.target.files[0])}/>
          <div style={{fontSize:11,color:'var(--muted)'}}>Click or drag & drop an image</div>
          {avatar&&(
            <button onClick={()=>setAvatar(null)}
              style={{fontSize:11,color:'var(--danger)',background:'none',border:'none',cursor:'pointer'}}>
              Remove photo
            </button>
          )}
        </div>

        {/* Name */}
        <div>
          <div style={{fontFamily:'var(--mono)',fontSize:9,color:'var(--muted)',letterSpacing:'1px',marginBottom:5}}>DISPLAY NAME</div>
          <input value={name} onChange={e=>setName(e.target.value)} placeholder="Your name or ENS..."
            style={{width:'100%',background:'var(--surface)',border:'1px solid var(--border)',borderRadius:9,
              padding:'10px 13px',color:'var(--text)',fontFamily:'var(--sans)',fontSize:13.5,outline:'none'}}/>
        </div>


        {/* Bio */}
        <div>
          <div style={{fontFamily:'var(--mono)',fontSize:9,color:'var(--muted)',letterSpacing:'1px',marginBottom:5}}>
            BIO <span style={{color:'var(--muted)',fontWeight:400}}>({160-bio.length} left)</span>
          </div>
          <textarea value={bio} onChange={e=>setBio(e.target.value.slice(0,160))}
            placeholder="Tell people about yourself..."
            rows={3}
            style={{width:'100%',background:'var(--surface)',border:'1px solid var(--border)',borderRadius:9,
              padding:'10px 13px',color:'var(--text)',fontFamily:'var(--sans)',fontSize:13.5,outline:'none',
              resize:'none',lineHeight:1.5}}/>
        </div>

        {/* Wallet address (read-only) - profile is tied to this address */}
        <div style={{background:'var(--surface)',border:'1px solid var(--border)',borderRadius:9,padding:'10px 13px'}}>
          <div style={{fontFamily:'var(--mono)',fontSize:9,color:'var(--muted)',letterSpacing:'1px',marginBottom:4}}>
            WALLET ADDRESS (this profile belongs to this address)
          </div>
          <div style={{fontFamily:'var(--mono)',fontSize:11,color:'var(--accent)',wordBreak:'break-all'}}>
            {profile.address||'Not connected'}
          </div>
          {profile.address&&(
            <div style={{fontSize:11,color:'var(--muted)',marginTop:6,lineHeight:1.4}}>
              Your profile is stored locally and linked to this wallet. Different wallets have separate profiles.
            </div>
          )}
        </div>

        {/* Buttons */}
        <div style={{display:'flex',gap:10,marginTop:4}}>
          <button onClick={onClose}
            style={{flex:1,padding:11,background:'transparent',border:'1px solid var(--border)',
              borderRadius:9,color:'var(--text2)',fontSize:13.5,cursor:'pointer'}}>Cancel</button>
          <button onClick={save}
            style={{flex:2,padding:11,background:'var(--accent)',border:'none',
              borderRadius:9,color:'#0a0c14',fontWeight:600,fontSize:13.5,cursor:'pointer'}}>Save Profile</button>
        </div>
      </div>
    </div>
  );
}
