// @ts-nocheck
import { now } from "../../lib/utils";
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { PMTCrypto } from '../../lib/crypto';
import { PMTAuth } from '../../lib/auth';
import { checkUsernameAvailable, loadCloudBackup, saveCloudBackup } from '../../lib/cloudBackup';


export default function ImportWalletFlow({onWallet,onBack}){
  const [step,setStep]=useState('choose'); // choose | enter | account
  const [mode,setMode]=useState('seed');
  const [input,setInput]=useState('');
  const [username,setUsername]=useState('');
  const [password,setPassword]=useState('');
  const [confirmPwd,setConfirmPwd]=useState('');
  const [err,setErr]=useState(null);
  const [pwdErr,setPwdErr]=useState(null);
  const [loading,setLoading]=useState(false);
  const [finishing,setFinishing]=useState(false);
  const [importedWallet,setImportedWallet]=useState(null);
  const [existingAccount,setExistingAccount]=useState(null); // {username, hasBackup} if wallet already registered

  // Step 1: validate the seed/key and advance to account creation
  const verifyImport=async()=>{
    setErr(null);setLoading(true);
    try{
      const C=PMTCrypto;
      let w;
      if(mode==='seed'){
        const phrase=input.trim().toLowerCase();
        const words=phrase.split(/\s+/);
        if(words.length!==12&&words.length!==24)throw new Error('Seed phrase must be 12 or 24 words');
        w=C.importFromMnemonic(phrase);
      }else{
        w=C.importFromPrivateKey(input.trim());
      }
      setImportedWallet(w);
      // Check if this wallet already has a registered account
      try {
        const res = await fetch(`/api/auth?address=${encodeURIComponent(w.address)}`);
        if (res.ok) {
          const data = await res.json();
          setExistingAccount(data); // {username, hasBackup}
        } else {
          setExistingAccount(null);
        }
      } catch { setExistingAccount(null); }
      setStep('account');
    }catch(e){
      setErr(e.message||'Import failed');
    }finally{setLoading(false);}
  };

  // Step 2: restore existing account OR create new account
  const finish=async()=>{
    if(password.length<8)return setPwdErr('Password must be at least 8 characters');
    if(!existingAccount && password!==confirmPwd)return setPwdErr('Passwords do not match');
    if(!existingAccount && !username.trim())return setPwdErr('Please choose a username');
    if(!existingAccount && username.trim().length<3)return setPwdErr('Username must be at least 3 characters');
    setPwdErr(null);setFinishing(true);
    try{
      const useUsername = existingAccount ? existingAccount.username : username.trim();
      // Check username availability for new accounts
      if(!existingAccount){
        const avail = await checkUsernameAvailable(useUsername);
        if(!avail)return setPwdErr('Username already taken — choose a different one.');
      }
      const walletData={
        address:importedWallet.address,
        privateKey:importedWallet.privateKey,
        mnemonic:importedWallet.mnemonic||null,
      };
      const encrypted=await PMTAuth.encryptWallet(walletData,password);
      const {hash,salt}=await PMTAuth.hashPassword(password);
      const account={
        username:useUsername,
        address:importedWallet.address,
        passwordHash:hash,
        passwordSalt:salt,
        encryptedWallet:encrypted,
        createdAt:Date.now(),
      };
      const key='pmt_account_'+useUsername.toLowerCase();
      localStorage.setItem(key,JSON.stringify(account));
      localStorage.setItem('pmt_session',JSON.stringify({username:useUsername,address:importedWallet.address}));
      sessionStorage.setItem('pmt_pk_'+importedWallet.address.toLowerCase(), importedWallet.privateKey);
      // For new accounts: immediately save to cloud so username/address is registered
      if(!existingAccount){
        try{
          await saveCloudBackup(useUsername, password, {
            wallet:{address:importedWallet.address,privateKey:importedWallet.privateKey,username:useUsername},
            contacts:[],messages:{},profile:{name:useUsername},
          });
        }catch{ /* auto-backup will retry */ }
      }
      // Restore cloud backup if existing account has one
      let restoredContacts=[], restoredMessages={}, restoredProfile={};
      if(existingAccount?.hasBackup){
        try{
          const authRes=await fetch(`/api/auth?username=${encodeURIComponent(useUsername)}`);
          const authData=await authRes.json();
          if(authData.encryptedBackup){
            const backup=await loadCloudBackup(authData.encryptedBackup, password);
            restoredContacts=backup.contacts||[];
            restoredMessages=backup.messages||{};
            restoredProfile=backup.profile||{};
          }
        }catch(e){ /* backup restore failed, continue without */ }
      }
      // Mark as internal wallet permanently — never needs verify screen
      localStorage.setItem(`pmt_wallet_internal_${wallet.address.toLowerCase()}`, '1');
      onWallet({address:importedWallet.address,privateKey:importedWallet.privateKey,balance:'0.0000',network:'PMTchain',
        chainId:'0x46df2',username:useUsername,sessionPassword:password,
        ...(restoredContacts.length?{restoredContacts}:{}),
        ...(Object.keys(restoredMessages).length?{restoredMessages}:{}),
        ...(Object.keys(restoredProfile).length?{restoredProfile}:{}),
      });
    }catch(e){
      setPwdErr('Failed: '+e.message);
      setFinishing(false);
    }
  };

  return(
    <div style={{height:'100%',display:'flex',alignItems:'flex-start',justifyContent:'center',
      background:'var(--bg)',padding:'16px',overflowY:'auto'}}>
      <div style={{width:'100%',maxWidth:460,background:'var(--panel)',border:'1px solid var(--border)',
        borderRadius:16,padding:'24px 20px',display:'flex',flexDirection:'column',gap:18,
        marginTop:'auto',marginBottom:'auto'}}>

        {/* Header */}
        <div style={{display:'flex',alignItems:'center',gap:12}}>
          <button onClick={step==='account'?()=>setStep('enter'):onBack}
            style={{background:'var(--surface)',border:'1px solid var(--border)',borderRadius:8,
              width:32,height:32,color:'var(--muted)',cursor:'pointer',fontSize:13,
              display:'flex',alignItems:'center',justifyContent:'center'}}>Back</button>
          <div>
            <div style={{fontSize:17,fontWeight:600}}>
              {step==='account'?'Create your account':'Import Existing Wallet'}
            </div>
            <div style={{fontSize:11,color:'var(--muted)',marginTop:2,fontFamily:'var(--mono)'}}>
              {step==='choose'?'STEP 1 OF 2 - IMPORT':step==='enter'?'STEP 1 OF 2 - ENTER KEYS':'STEP 2 OF 2 - SECURE'}
            </div>
          </div>
        </div>

        {/* Progress */}
        <div style={{display:'flex',gap:6}}>
          {['Import','Secure'].map((label,i)=>{
            const active=(i===0&&(step==='choose'||step==='enter'))||(i===1&&step==='account');
            const done=(i===0&&step==='account');
            return(
              <div key={label} style={{flex:1,height:3,borderRadius:2,
                background:done?'var(--accent3)':active?'var(--accent)':'var(--surface)',
                transition:'background .3s'}}/>
            );
          })}
        </div>

        {/* Step: Choose method */}
        {step==='choose'&&(
          <>
            <p style={{fontSize:13,color:'var(--text2)',lineHeight:1.6}}>
              Import your wallet using a seed phrase or private key, then set a username and password for quick login.
            </p>
            {[
              ['Seed Phrase (12 or 24 words)','Most common recovery method','seed'],
              ['Private Key','Import with a single private key','key'],
            ].map(([title,sub,m])=>(
              <button key={m} onClick={()=>{setMode(m);setStep('enter');}}
                style={{display:'flex',alignItems:'center',gap:14,padding:'14px 16px',
                  background:'var(--surface)',border:'1px solid var(--border)',borderRadius:12,
                  cursor:'pointer',textAlign:'left'}}
                onMouseEnter={e=>e.currentTarget.style.borderColor='var(--accent)'}
                onMouseLeave={e=>e.currentTarget.style.borderColor='var(--border)'}>
                <div style={{width:40,height:40,borderRadius:10,background:'rgba(99,210,255,.1)',
                  border:'1px solid rgba(99,210,255,.2)',display:'flex',alignItems:'center',
                  justifyContent:'center',fontSize:18,flexShrink:0}}>
                  {m==='seed'?'S':'K'}
                </div>
                <div style={{flex:1}}>
                  <div style={{fontSize:13.5,fontWeight:500,color:'var(--text)'}}>{title}</div>
                  <div style={{fontSize:11,color:'var(--muted)',marginTop:2}}>{sub}</div>
                </div>
                <span style={{color:'var(--muted)',fontSize:16}}>›</span>
              </button>
            ))}
          </>
        )}

        {/* Step: Enter seed/key */}
        {step==='enter'&&(
          <>
            <button onClick={()=>setStep('choose')}
              style={{background:'none',border:'none',color:'var(--muted)',fontSize:12,
                cursor:'pointer',textAlign:'left',fontFamily:'var(--mono)',padding:0}}>
              Back to options
            </button>
            <div style={{fontSize:13,color:'var(--text2)',lineHeight:1.6}}>
              {mode==='seed'
                ?'Enter your 12 or 24 word seed phrase, separated by spaces.'
                :'Enter your private key (starts with 0x, 66 characters).'}
            </div>
            <textarea rows={mode==='seed'?4:2}
              placeholder={mode==='seed'?'word1 word2 word3 ... word12':'0x...'}
              value={input} onChange={e=>{setInput(e.target.value);setErr(null);}}
              style={{width:'100%',background:'var(--surface)',border:'1px solid var(--border)',
                borderRadius:10,padding:'12px 14px',color:'var(--text)',
                fontFamily:'var(--mono)',fontSize:12.5,outline:'none',resize:'none',lineHeight:1.7}}/>
            {err&&(
              <div style={{background:'rgba(248,113,113,.1)',border:'1px solid rgba(248,113,113,.3)',
                borderRadius:8,padding:'8px 12px',fontSize:12,color:'var(--danger)'}}>{err}</div>
            )}
            <div style={{background:'rgba(248,113,113,.07)',border:'1px solid rgba(248,113,113,.2)',
              borderRadius:9,padding:'10px 14px',fontSize:12,color:'var(--danger)',lineHeight:1.5}}>
              Never enter your seed phrase on a site you do not trust.
            </div>
            <button onClick={verifyImport} disabled={!input.trim()||loading}
              style={{padding:'13px',background:'var(--accent)',border:'none',borderRadius:10,
                color:'#0a0c14',fontWeight:600,fontSize:14,cursor:'pointer',
                display:'flex',alignItems:'center',justifyContent:'center',gap:8,
                opacity:!input.trim()||loading?0.7:1}}>
              {loading
                ?<><span style={{width:14,height:14,border:'2px solid rgba(0,0,0,.3)',borderTopColor:'#0a0c14',
                    borderRadius:'50%',display:'inline-block',animation:'spin .7s linear infinite'}}/>Verifying...</>
                :'Continue'}
            </button>
          </>
        )}

        {/* Step: Create account */}
        {step==='account'&&(
          <>
            <div style={{background:'rgba(52,211,153,.08)',border:'1px solid rgba(52,211,153,.2)',
              borderRadius:10,padding:'10px 14px',fontSize:12,color:'var(--accent3)',lineHeight:1.5}}>
              {existingAccount
                ? `✓ Account found! This wallet belongs to "${existingAccount.username}". Enter your password to restore your account${existingAccount.hasBackup?' and all your data':''}.`
                : 'Wallet imported successfully! Now create a username and password so you can log in quickly next time.'}
            </div>
            <div style={{background:'var(--surface)',border:'1px solid var(--border)',borderRadius:9,padding:'10px 13px'}}>
              <div style={{fontFamily:'var(--mono)',fontSize:9,color:'var(--muted)',letterSpacing:'1px',marginBottom:3}}>WALLET ADDRESS</div>
              <div style={{fontFamily:'var(--mono)',fontSize:11,color:'var(--accent)',wordBreak:'break-all'}}>{importedWallet?.address}</div>
            </div>
            <div>
              <div style={{fontFamily:'var(--mono)',fontSize:9,color:'var(--muted)',letterSpacing:'1px',marginBottom:5}}>USERNAME</div>
              {!existingAccount && <input placeholder="Choose a username" value={username}
                onChange={e=>{setUsername(e.target.value);setPwdErr(null);}}
                style={{width:'100%',background:'var(--surface)',border:'1px solid var(--border)',
                  borderRadius:9,padding:'10px 13px',color:'var(--text)',fontFamily:'var(--sans)',fontSize:14,outline:'none'}}/>}
              {existingAccount && (
                <div style={{background:'var(--surface)',border:'1px solid var(--accent2)',borderRadius:9,
                  padding:'10px 13px',fontSize:14,color:'var(--accent2)',fontFamily:'var(--mono)'}}>
                  👤 {existingAccount.username}
                  {existingAccount.hasBackup && <span style={{fontSize:11,color:'var(--accent3)',marginLeft:8}}>☁ backup available</span>}
                </div>
              )}
            </div>
            {[['Password','password',password,setPassword],['Confirm Password','confirmPwd',confirmPwd,setConfirmPwd]].filter(([label])=>!existingAccount||label==='Password').map(([label,name,val,set])=>(
              <div key={name}>
                <div style={{fontFamily:'var(--mono)',fontSize:9,color:'var(--muted)',letterSpacing:'1px',marginBottom:5}}>{label.toUpperCase()}{existingAccount&&label==='Password'?<span style={{fontWeight:400,textTransform:'none',marginLeft:6}}>— your existing account password</span>:''}</div>
                <input type="password" placeholder="password" value={val}
                  onChange={e=>{set(e.target.value);setPwdErr(null);}}
                  style={{width:'100%',background:'var(--surface)',border:'1px solid var(--border)',
                    borderRadius:9,padding:'10px 13px',color:'var(--text)',fontFamily:'var(--sans)',fontSize:14,outline:'none'}}/>
              </div>
            ))}
            {password.length>0&&(
              <div>
                <div style={{display:'flex',gap:3,marginBottom:4}}>
                  {[0,1,2,3].map(i=>{
                    const s=password.length>=12?4:password.length>=8?3:password.length>=6?2:1;
                    const colors=['var(--danger)','var(--danger)','#f59e0b','var(--accent3)','var(--accent3)'];
                    return <div key={i} style={{flex:1,height:3,borderRadius:2,background:i<s?colors[s]:'var(--surface)'}}/>;
                  })}
                </div>
                <div style={{fontSize:11,color:'var(--muted)'}}>
                  {password.length>=12?'Strong':password.length>=8?'Good':'Too short (min 8 chars)'}
                </div>
              </div>
            )}
            {pwdErr&&(
              <div style={{background:'rgba(248,113,113,.1)',border:'1px solid rgba(248,113,113,.3)',
                borderRadius:8,padding:'8px 12px',fontSize:12,color:'var(--danger)'}}>{pwdErr}</div>
            )}
            <button onClick={finish} disabled={!username.trim()||!password||!confirmPwd||finishing}
              style={{padding:'13px',background:'var(--accent)',border:'none',borderRadius:10,
                color:'#0a0c14',fontWeight:600,fontSize:14,cursor:finishing?'default':'pointer',
                display:'flex',alignItems:'center',justifyContent:'center',gap:8,
                opacity:!username.trim()||!password||!confirmPwd||finishing?0.7:1}}>
              {finishing
                ?<><span style={{width:14,height:14,border:'2px solid rgba(0,0,0,.3)',borderTopColor:'#0a0c14',
                    borderRadius:'50%',display:'inline-block',animation:'spin .7s linear infinite'}}/>Securing wallet...</>
                :'Import & Create Account'}
            </button>
          </>
        )}
      </div>
    </div>
  );
}
