// @ts-nocheck
import { now } from "../../lib/utils";
import React, { useState, useEffect, useRef, useCallback } from 'react';

import Avatar from '../ui/Avatar';
import { checkUsernameAvailable } from '../../lib/cloudBackup';
export default function SetupMetaMaskFlow({wallet,onDone,onSkip}){
  const [username,setUsername]=useState('');
  const [pwd,setPwd]=useState('');
  const [pwd2,setPwd2]=useState('');
  const [err,setErr]=useState('');
  const [saving,setSaving]=useState(false);
  const [checking,setChecking]=useState(false);
  const [usernameAvail,setUsernameAvail]=useState(null); // null | true | false

  // Live username availability check
  useEffect(()=>{
    if(!username.trim()||username.trim().length<3){setUsernameAvail(null);return;}
    setChecking(true);
    const t=setTimeout(async()=>{
      try{
        const avail=await checkUsernameAvailable(username.trim());
        setUsernameAvail(avail);
      }catch{setUsernameAvail(null);}
      finally{setChecking(false);}
    },600);
    return()=>clearTimeout(t);
  },[username]);

  const save=async()=>{
    if(!username.trim()){setErr('Enter a username');return;}
    if(username.trim().length<3){setErr('Username must be at least 3 characters');return;}
    if(pwd.length<6){setErr('Password must be at least 6 characters');return;}
    if(pwd!==pwd2){setErr('Passwords do not match');return;}
    setSaving(true);
    try{
      // Check if username is already taken — but allow if it belongs to THIS wallet
      // (returning user who cleared browser data trying to reconnect)
      const avail=await checkUsernameAvailable(username.trim());
      if(!avail){
        // Username exists — check if it's owned by this wallet address
        try{
          const res=await fetch(`/api/auth?address=${encodeURIComponent(wallet.address.toLowerCase())}`);
          if(res.ok){
            const rec=await res.json();
            if(rec.username?.toLowerCase()===username.trim().toLowerCase()){
              // Same user reconnecting — username belongs to this address, allow it
            } else {
              setErr('Username already taken — choose a different one.');setSaving(false);return;
            }
          } else {
            // Address not registered, but username taken by someone else
            setErr('Username already taken — choose a different one.');setSaving(false);return;
          }
        }catch{
          setErr('Username already taken — choose a different one.');setSaving(false);return;
        }
      }
      // Derive a key from password to encrypt account data
      const enc=new TextEncoder();
      const keyMat=await crypto.subtle.importKey('raw',enc.encode(pwd),{name:'PBKDF2'},false,['deriveBits','deriveKey']);
      const salt=crypto.getRandomValues(new Uint8Array(16));
      const key=await crypto.subtle.deriveKey(
        {name:'PBKDF2',salt,iterations:100000,hash:'SHA-256'},
        keyMat,{name:'AES-GCM',length:256},false,['encrypt','decrypt']
      );
      const iv=crypto.getRandomValues(new Uint8Array(12));
      const data=enc.encode(JSON.stringify({address:wallet.address,privateKey:wallet.privateKey||'metamask'}));
      const encrypted=await crypto.subtle.encrypt({name:'AES-GCM',iv},key,data);
      const encryptedArr=Array.from(new Uint8Array(encrypted));
      const account={
        username:username.trim(),
        address:wallet.address,
        salt:Array.from(salt),
        iv:Array.from(iv),
        encrypted:encryptedArr,
        isMetaMask:true,
        createdAt:Date.now(),
      };
      localStorage.setItem('pmt_account_'+wallet.address.toLowerCase(),JSON.stringify(account));
      localStorage.setItem('pmt_session',JSON.stringify({username:username.trim(),address:wallet.address}));
      // Register on server: username + encrypted backup (enables cross-device recovery)
      try {
        const {PMTAuth} = await import('../../lib/auth');
        const {hash, salt: ps} = await PMTAuth.hashPassword(pwd);
        await fetch('/api/auth', {method:'POST', headers:{'Content-Type':'application/json'},
          body: JSON.stringify({
            username: username.trim(),
            passwordHash: hash,
            salt: ps,
            address: wallet.address,
            // Include encrypted backup so cloud recovery works on any device
            encryptedBackup: JSON.stringify({
              salt: Array.from(salt),
              iv: Array.from(iv),
              encrypted: encryptedArr,
              isMetaMask: true,
            }),
          })});
      } catch { /* silent — local account still works */ }
      onDone(username.trim());
    }catch(e){
      setErr('Failed to save: '+e.message);
    }
    setSaving(false);
  };

  return(
    <div style={{height:'100vh',display:'flex',alignItems:'center',justifyContent:'center',
      background:'var(--bg)',padding:'16px',overflowY:'auto'}}>
      <div style={{background:'var(--panel)',border:'1px solid var(--border)',borderRadius:16,
        padding:'28px 24px',width:'100%',maxWidth:400,display:'flex',flexDirection:'column',gap:16}}>
        <div style={{textAlign:'center',marginBottom:4}}>
          <div style={{fontSize:28,marginBottom:8}}>🦊</div>
          <div style={{fontSize:17,fontWeight:700}}>Set up your PMT identity</div>
          <div style={{fontSize:13,color:'var(--text2)',marginTop:4}}>
            MetaMask connected as<br/>
            <span style={{fontFamily:'var(--mono)',fontSize:11,color:'var(--accent)'}}>
              {wallet.address?.slice(0,10)}...{wallet.address?.slice(-6)}
            </span>
          </div>
          <div style={{fontSize:12,color:'var(--muted)',marginTop:8}}>
            Create a username and password to enable encrypted messaging and account recovery.
          </div>
        </div>
        <div>
          <div style={{fontFamily:'var(--mono)',fontSize:10,color:'var(--muted)',letterSpacing:'1px',marginBottom:5}}>USERNAME</div>
          {username.trim().length>=3&&(
            <div style={{fontSize:11,marginBottom:-8,color:checking?'var(--muted)':usernameAvail===true?'var(--accent3)':'var(--danger)'}}>
              {checking?'Checking...':usernameAvail===true?'✓ Username available':'✗ Username already taken'}
            </div>
          )}
          <input value={username} onChange={e=>{setUsername(e.target.value);setUsernameAvail(null);}}
            placeholder="Choose a username" autoFocus
            style={{width:'100%',background:'var(--surface)',border:'1px solid var(--border)',borderRadius:9,
              padding:'10px 13px',color:'var(--text)',fontSize:14,outline:'none',boxSizing:'border-box'}}/>
        </div>
        <div>
          <div style={{fontFamily:'var(--mono)',fontSize:10,color:'var(--muted)',letterSpacing:'1px',marginBottom:5}}>PASSWORD</div>
          <input type="password" value={pwd} onChange={e=>setPwd(e.target.value)}
            placeholder="Create a password"
            style={{width:'100%',background:'var(--surface)',border:'1px solid var(--border)',borderRadius:9,
              padding:'10px 13px',color:'var(--text)',fontSize:14,outline:'none',boxSizing:'border-box'}}/>
        </div>
        <div>
          <div style={{fontFamily:'var(--mono)',fontSize:10,color:'var(--muted)',letterSpacing:'1px',marginBottom:5}}>CONFIRM PASSWORD</div>
          <input type="password" value={pwd2} onChange={e=>setPwd2(e.target.value)}
            placeholder="Confirm password"
            onKeyDown={e=>e.key==='Enter'&&save()}
            style={{width:'100%',background:'var(--surface)',border:'1px solid var(--border)',borderRadius:9,
              padding:'10px 13px',color:'var(--text)',fontSize:14,outline:'none',boxSizing:'border-box'}}/>
        </div>
        {err&&<div style={{background:'rgba(248,113,113,.1)',border:'1px solid rgba(248,113,113,.3)',
          borderRadius:8,padding:'10px 14px',fontSize:13,color:'#f87171'}}>{err}</div>}
        <button onClick={save} disabled={saving}
          style={{padding:'12px',background:'var(--accent)',border:'none',borderRadius:10,
            color:'#0a0c14',fontWeight:700,fontSize:14,cursor:saving?'not-allowed':'pointer',
            opacity:saving?0.7:1}}>
          {saving?'Setting up...':'Create Identity'}
        </button>
        <button onClick={onSkip}
          style={{padding:'10px',background:'transparent',border:'1px solid var(--border)',
            borderRadius:10,color:'var(--muted)',fontSize:13,cursor:'pointer'}}>
          Skip for now (messaging may be limited)
        </button>
      </div>
    </div>
  );
}
