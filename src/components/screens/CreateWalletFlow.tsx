// @ts-nocheck
import { now } from "../../lib/utils";
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { PMTCrypto } from '../../lib/crypto';
import { PMTAuth } from '../../lib/auth';
import { saveCloudBackup, checkUsernameAvailable } from '../../lib/cloudBackup';


export default function CreateWalletFlow({onWallet,onBack}){
  const [step,setStep]=useState('generate'); // generate | backup | verify | password
  const [wallet,setWallet]=useState(null);
  const [revealed,setRevealed]=useState(false);
  const [verifyWords,setVerifyWords]=useState({});
  const [checkIdxs,setCheckIdxs]=useState([]);
  const [username,setUsername]=useState('');
  const [password,setPassword]=useState('');
  const [cloudStatus,setCloudStatus]=useState(''); // '', 'saving', 'saved', 'error'
  const [usernameAvail,setUsernameAvail]=useState<boolean|null>(null);
  const [confirmPwd,setConfirmPwd]=useState('');
  const [pwdErr,setPwdErr]=useState(null);
  const [copied,setCopied]=useState(false);

  useEffect(()=>{
    // Generate wallet using PMTCrypto
    PMTCrypto.createWallet().then(w=>{
      setWallet({
        address:w.address,
        privateKey:w.privateKey,
        mnemonic:w.mnemonic,
        words:w.words,
      });
    });
    // Pick 3 random word indices to verify
    const idxs=[];
    while(idxs.length<3){
      const n=Math.floor(Math.random()*12);
      if(!idxs.includes(n))idxs.push(n);
    }
    setCheckIdxs(idxs.sort((a,b)=>a-b));
  },[]);

  const copyPhrase=()=>{
    if(!wallet)return;
    navigator.clipboard.writeText(wallet.mnemonic).then(()=>{
      setCopied(true);setTimeout(()=>setCopied(false),2000);
    });
  };

  const verifyOk=wallet&&checkIdxs.every(i=>
    (verifyWords[i]||'').trim().toLowerCase()===wallet.words[i].toLowerCase()
  );

  const [finishing,setFinishing]=useState(false);
  const finish=async()=>{
    if(!username.trim())return setPwdErr('Please choose a username');
    if(username.trim().length<3)return setPwdErr('Username must be at least 3 characters');
    if(password.length<8)return setPwdErr('Password must be at least 8 characters');
    if(password!==confirmPwd)return setPwdErr('Passwords do not match');
    // Check username not taken in cloud
    try{
      const avail=await checkUsernameAvailable(username.trim());
      if(!avail)return setPwdErr('Username already taken — choose a different one.');
    }catch{ /* offline — skip check, will fail on cloud save */ }
    setPwdErr(null);
    setFinishing(true);
    try{
      const walletData={address:wallet.address,privateKey:wallet.privateKey,mnemonic:wallet.mnemonic};
      // Encrypt wallet with password
      const encrypted=await PMTAuth.encryptWallet(walletData,password);
      // Hash password for login verification
      const {hash,salt}=await PMTAuth.hashPassword(password);
      const account={
        username:username.trim(),
        address:wallet.address,
        passwordHash:hash,
        passwordSalt:salt,
        encryptedWallet:encrypted,
        createdAt:Date.now(),
      };
      // Cloud backup — upload encrypted data to IPFS + register in Redis
      setCloudStatus('saving');
      try{
        await saveCloudBackup(username.trim(), password, {
          wallet: { address: wallet.address, privateKey: wallet.privateKey, username: username.trim() },
          contacts: [],
          messages: {},
          profile: { name: username.trim() },
        });
        setCloudStatus('saved');
      }catch(e){
        console.warn('Cloud backup failed (offline?):', e);
        setCloudStatus('error');
      }

      // Store under both username and address key so backup salt lookup works either way
      localStorage.setItem('pmt_account_'+username.trim().toLowerCase(), JSON.stringify(account));
      localStorage.setItem('pmt_account_'+wallet.address.toLowerCase(), JSON.stringify(account));
      // Also store current session (unencrypted for active session only)
      localStorage.setItem('pmt_session',JSON.stringify({username:username.trim(),address:wallet.address}));
      // Small delay to show "saved" status before navigating
      await new Promise(r=>setTimeout(r, cloudStatus==='saved'?800:0));
      sessionStorage.setItem('pmt_pk_'+wallet.address.toLowerCase(), wallet.privateKey);
      // Mark as internal wallet permanently — never needs verify screen
      localStorage.setItem(`pmt_wallet_internal_${wallet.address.toLowerCase()}`, '1');
      onWallet({address:wallet.address,privateKey:wallet.privateKey,balance:'0.0000',network:'PMTchain',chainId:'0x46df2',isCreated:true,username:username.trim(),sessionPassword:password});
    }catch(e){
      setPwdErr('Failed to secure wallet: '+e.message);
      setFinishing(false);
    }
  };

  if(!wallet)return(
    <div style={{height:'100%',display:'flex',alignItems:'center',justifyContent:'center'}}>
      <div style={{color:'var(--muted)',fontFamily:'var(--mono)',fontSize:12}}>Generating wallet...</div>
    </div>
  );

  const steps=[{k:'generate',label:'Generate'},{k:'backup',label:'Backup'},{k:'verify',label:'Verify'},{k:'secure',label:'Secure'}];
  const stepIdx={generate:0,backup:1,verify:2,password:3}[step];

  return(
    <div style={{height:'100%',display:'flex',alignItems:'flex-start',justifyContent:'center',
      background:'var(--bg)',padding:'16px',overflowY:'auto'}}>
      <div style={{width:'100%',maxWidth:480,background:'var(--panel)',border:'1px solid var(--border)',
        borderRadius:16,padding:'24px 20px',display:'flex',flexDirection:'column',gap:20,
        animation:'slideUp .3s ease',marginTop:'auto',marginBottom:'auto'}}>

        {/* Progress bar */}
        <div>
          <div style={{display:'flex',justifyContent:'space-between',marginBottom:8}}>
            {steps.map((s,i)=>(
              <div key={s.k} style={{display:'flex',flexDirection:'column',alignItems:'center',gap:4,flex:1}}>
                <div style={{width:28,height:28,borderRadius:'50%',
                  background:i<=stepIdx?'var(--accent)':'var(--surface)',
                  border:`1px solid ${i<=stepIdx?'var(--accent)':'var(--border)'}`,
                  display:'flex',alignItems:'center',justifyContent:'center',
                  fontSize:11,fontWeight:600,color:i<=stepIdx?'#0a0c14':'var(--muted)',
                  transition:'all .3s'}}>{i<stepIdx?'v':i+1}</div>
                <div style={{fontSize:9,color:i<=stepIdx?'var(--accent)':'var(--muted)',
                  fontFamily:'var(--mono)',letterSpacing:'.5px'}}>{s.label.toUpperCase()}</div>
              </div>
            ))}
          </div>
          <div style={{height:2,background:'var(--surface)',borderRadius:2}}>
            <div style={{height:'100%',borderRadius:2,background:'var(--accent)',
              width:`${(stepIdx/3)*100}%`,transition:'width .4s ease'}}/>
          </div>
        </div>

        {/* Step: Generate */}
        {step==='generate'&&(
          <>
            <div>
              <div style={{fontSize:17,fontWeight:600,marginBottom:6}}>Your new wallet</div>
              <div style={{fontSize:13,color:'var(--text2)',lineHeight:1.6}}>
                A unique 12-word seed phrase has been generated. This phrase is the only key to your wallet  -  store it safely offline.
              </div>
            </div>
            <div style={{background:'var(--surface)',border:'1px solid var(--border)',borderRadius:12,padding:16}}>
              <div style={{fontFamily:'var(--mono)',fontSize:11,color:'var(--muted)',marginBottom:10,letterSpacing:'1px'}}>WALLET ADDRESS</div>
              <div style={{fontFamily:'var(--mono)',fontSize:11,color:'var(--accent)',wordBreak:'break-all'}}>{wallet.address}</div>
            </div>
            <div style={{background:'rgba(248,113,113,.07)',border:'1px solid rgba(248,113,113,.2)',
              borderRadius:10,padding:'12px 14px',fontSize:12.5,color:'var(--danger)',lineHeight:1.6}}>
              ! Never share your seed phrase with anyone. PMT-Chat staff will never ask for it.
            </div>
            <button onClick={()=>setStep('backup')}
              style={{padding:'13px',background:'var(--accent)',border:'none',borderRadius:10,
                color:'#0a0c14',fontWeight:600,fontSize:14,cursor:'pointer'}}>
              Continue  -  Back Up My Phrase
            </button>
            <button onClick={onBack}
              style={{padding:'10px',background:'transparent',border:'1px solid var(--border)',borderRadius:10,
                color:'var(--muted)',fontSize:13,cursor:'pointer'}}>Back</button>
          </>
        )}

        {/* Step: Backup seed phrase */}
        {step==='backup'&&(
          <>
            <div>
              <div style={{fontSize:17,fontWeight:600,marginBottom:6}}>Save your seed phrase</div>
              <div style={{fontSize:13,color:'var(--text2)',lineHeight:1.6}}>
                Write these 12 words on paper in order. Keep it somewhere safe  -  you'll need it to recover your wallet.
              </div>
            </div>
            {/* Seed phrase grid */}
            <div style={{position:'relative',borderRadius:12,overflow:'hidden'}}>
              <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:6,
                filter:revealed?'none':'blur(10px)',userSelect:revealed?'text':'none',
                transition:'filter .3s'}}>
                {wallet.words.map((w,i)=>(
                  <div key={i} style={{background:'var(--surface)',border:'1px solid var(--border)',
                    borderRadius:8,padding:'8px 10px',display:'flex',alignItems:'center',gap:8}}>
                    <span style={{fontFamily:'var(--mono)',fontSize:10,color:'var(--muted)',minWidth:16}}>{i+1}</span>
                    <span style={{fontFamily:'var(--mono)',fontSize:12,fontWeight:600,color:'var(--text)'}}>{w}</span>
                  </div>
                ))}
              </div>
              {!revealed&&(
                <div style={{position:'absolute',inset:0,display:'flex',flexDirection:'column',
                  alignItems:'center',justifyContent:'center',gap:10,
                  background:'rgba(10,12,20,.6)',backdropFilter:'blur(2px)',cursor:'pointer'}}
                  onClick={()=>setRevealed(true)}>
                  <div style={{fontSize:28}}>*</div>
                  <div style={{fontSize:13,fontWeight:500,color:'var(--text)'}}>Tap to reveal seed phrase</div>
                  <div style={{fontSize:11,color:'var(--muted)'}}>Make sure no one is watching</div>
                </div>
              )}
            </div>
            {revealed&&(
              <button onClick={copyPhrase}
                style={{padding:'10px',background:'var(--surface)',border:'1px solid var(--border)',
                  borderRadius:9,color:copied?'var(--accent3)':'var(--text2)',fontSize:13,cursor:'pointer',
                  display:'flex',alignItems:'center',justifyContent:'center',gap:8}}>
                {copied?'Copied!':'Copy to clipboard'}
              </button>
            )}
            <button onClick={()=>setStep('verify')} disabled={!revealed}
              style={{padding:'13px',background:revealed?'var(--accent)':'var(--surface)',
                border:revealed?'none':'1px solid var(--border)',borderRadius:10,
                color:revealed?'#0a0c14':'var(--muted)',fontWeight:600,fontSize:14,
                cursor:revealed?'pointer':'default'}}>
              I have saved my seed phrase
            </button>
          </>
        )}

        {/* Step: Verify */}
        {step==='verify'&&(
          <>
            <div>
              <div style={{fontSize:17,fontWeight:600,marginBottom:6}}>Verify your backup</div>
              <div style={{fontSize:13,color:'var(--text2)',lineHeight:1.6}}>
                Enter the missing words from your seed phrase to confirm you've backed it up correctly.
              </div>
            </div>
            <div style={{display:'flex',flexDirection:'column',gap:10}}>
              {checkIdxs.map(i=>(
                <div key={i} style={{display:'flex',alignItems:'center',gap:12,
                  background:'var(--surface)',border:'1px solid var(--border)',borderRadius:10,padding:'10px 14px'}}>
                  <div style={{fontFamily:'var(--mono)',fontSize:11,color:'var(--muted)',
                    minWidth:24,textAlign:'right'}}>#{i+1}</div>
                  <input
                    placeholder={`Word ${i+1}`}
                    value={verifyWords[i]||''}
                    onChange={e=>setVerifyWords(v=>({...v,[i]:e.target.value}))}
                    style={{flex:1,background:'transparent',border:'none',outline:'none',
                      fontFamily:'var(--mono)',fontSize:13,color:'var(--text)'}}
                  />
                  <div style={{fontSize:14}}>
                    {verifyWords[i]
                      ? verifyWords[i].trim().toLowerCase()===wallet.words[i].toLowerCase()
                        ? 'OK' : 'X'
                      : ''}
                  </div>
                </div>
              ))}
            </div>
            <button onClick={()=>setStep('password')} disabled={!verifyOk}
              style={{padding:'13px',background:verifyOk?'var(--accent)':'var(--surface)',
                border:verifyOk?'none':'1px solid var(--border)',borderRadius:10,
                color:verifyOk?'#0a0c14':'var(--muted)',fontWeight:600,fontSize:14,
                cursor:verifyOk?'pointer':'default'}}>
              {verifyOk?'Verification passed':'Enter the correct words to continue'}
            </button>
          </>
        )}

        {/* Step: Set username + password */}
        {step==='password'&&(
          <>
            <div>
              <div style={{fontSize:17,fontWeight:600,marginBottom:6}}>Create your account</div>
              <div style={{fontSize:13,color:'var(--text2)',lineHeight:1.6}}>
                Choose a username and password. Next time you open PMT-Chat, just log in — no need to import your wallet again.
              </div>
            </div>
            <div>
              <div style={{fontFamily:'var(--mono)',fontSize:9,color:'var(--muted)',letterSpacing:'1px',marginBottom:5}}>USERNAME</div>
              <input placeholder="Choose a username" value={username}
                onChange={e=>{setUsername(e.target.value);setPwdErr(null);}}
                style={{width:'100%',background:'var(--surface)',border:'1px solid var(--border)',
                  borderRadius:9,padding:'10px 13px',color:'var(--text)',fontFamily:'var(--sans)',
                  fontSize:14,outline:'none'}}/>
            </div>
            {[['Password','password',password,setPassword],['Confirm Password','confirmPwd',confirmPwd,setConfirmPwd]].map(([label,name,val,set])=>(
              <div key={name}>
                <div style={{fontFamily:'var(--mono)',fontSize:9,color:'var(--muted)',letterSpacing:'1px',marginBottom:5}}>
                  {label.toUpperCase()}
                </div>
                <input type="password" placeholder="********" value={val}
                  onChange={e=>{set(e.target.value);setPwdErr(null);}}
                  style={{width:'100%',background:'var(--surface)',border:'1px solid var(--border)',
                    borderRadius:9,padding:'10px 13px',color:'var(--text)',fontFamily:'var(--sans)',
                    fontSize:14,outline:'none'}}/>
              </div>
            ))}
            {/* Password strength */}
            {password.length>0&&(
              <div>
                <div style={{display:'flex',gap:3,marginBottom:4}}>
                  {[0,1,2,3].map(i=>{
                    const strength=password.length>=8?(password.length>=12?4:3):(password.length>=6?2:1);
                    const colors=['var(--danger)','var(--danger)','#f59e0b','var(--accent3)','var(--accent3)'];
                    return <div key={i} style={{flex:1,height:3,borderRadius:2,
                      background:i<strength?colors[strength]:'var(--surface)'}}/>;
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
            <button onClick={finish} disabled={!password||!confirmPwd||!username.trim()||finishing}
              style={{padding:'13px',background:'var(--accent)',border:'none',borderRadius:10,
                color:'#0a0c14',fontWeight:600,fontSize:14,cursor:finishing?'default':'pointer',
                display:'flex',alignItems:'center',justifyContent:'center',gap:8}}>
              {finishing
                ?<><span style={{width:14,height:14,border:'2px solid rgba(0,0,0,.3)',borderTopColor:'#0a0c14',
                    borderRadius:'50%',display:'inline-block',animation:'spin .7s linear infinite'}}/>Securing wallet...</>
                :'Create Wallet'}
            </button>
          </>
        )}
      </div>
    </div>
  );
}
