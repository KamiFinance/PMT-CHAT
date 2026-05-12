// @ts-nocheck
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { PMTAuth } from '../../lib/auth';
import { loadCloudBackup } from '../../lib/cloudBackup';
import { getWCProvider, resetWCProvider } from '../../lib/walletconnect';
const isMobile = () => /Android|iPhone|iPad|iPod|Opera Mini|IEMobile|WPDesktop/i.test(navigator.userAgent);
const WALLETS_LC = [
  { id:'metamask', name:'MetaMask', scheme: u => `metamask://wc?uri=${encodeURIComponent(u)}` },
  { id:'trust',    name:'Trust',    scheme: u => `trust://wc?uri=${encodeURIComponent(u)}` },
  { id:'coinbase', name:'Coinbase', scheme: u => `cbwallet://wc?uri=${encodeURIComponent(u)}` },
  { id:'rainbow',  name:'Rainbow',  scheme: u => `rainbow://wc?uri=${encodeURIComponent(u)}` },
  { id:'phantom',  name:'Phantom',  scheme: u => `phantom://wc?uri=${encodeURIComponent(u)}` },
  { id:'imtoken',  name:'imToken',  scheme: u => `imtokenv2://wc?uri=${encodeURIComponent(u)}` },
  { id:'safepal',  name:'SafePal',  scheme: u => `safepalwallet://wc?uri=${encodeURIComponent(u)}` },
  { id:'tangem',   name:'Tangem',   scheme: u => `tangem://wc?uri=${encodeURIComponent(u)}` },
];
const WICON_LC = {
  metamask:`<svg viewBox="0 0 40 40"><rect width="40" height="40" rx="12" fill="#F6851B"/><text y="28" x="20" text-anchor="middle" font-size="22">🦊</text></svg>`,
  trust:`<svg viewBox="0 0 40 40"><rect width="40" height="40" rx="12" fill="#3375BB"/><text y="28" x="20" text-anchor="middle" font-size="22">🛡️</text></svg>`,
  coinbase:`<svg viewBox="0 0 40 40"><rect width="40" height="40" rx="12" fill="#0052FF"/><text y="28" x="20" text-anchor="middle" font-size="20" fill="white" font-weight="bold">C</text></svg>`,
  rainbow:`<svg viewBox="0 0 40 40"><defs><linearGradient id="rblc" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#FF6B6B"/><stop offset=".5" stop-color="#FFBA08"/><stop offset="1" stop-color="#118AB2"/></linearGradient></defs><rect width="40" height="40" rx="12" fill="url(#rblc)"/><text y="28" x="20" text-anchor="middle" font-size="22">🌈</text></svg>`,
  phantom:`<svg viewBox="0 0 40 40"><rect width="40" height="40" rx="12" fill="#AB9FF2"/><text y="28" x="20" text-anchor="middle" font-size="22">👻</text></svg>`,
  imtoken:`<svg viewBox="0 0 40 40"><rect width="40" height="40" rx="12" fill="#11C4D1"/><text y="26" x="20" text-anchor="middle" font-size="13" fill="white" font-weight="bold">iToken</text></svg>`,
  safepal:`<svg viewBox="0 0 40 40"><rect width="40" height="40" rx="12" fill="#0F60FF"/><path d="M20 8L30 13L30 22C30 27.5 25.5 32 20 33.5C14.5 32 10 27.5 10 22L10 13Z" fill="none" stroke="white" stroke-width="2.5"/></svg>`,
  tangem:`<svg viewBox="0 0 40 40"><rect width="40" height="40" rx="12" fill="#1C1C1E"/><rect x="9" y="13" width="22" height="14" rx="3" fill="none" stroke="white" stroke-width="2"/><rect x="12" y="16" width="7" height="4" rx="1" fill="white"/><circle cx="26" cy="21" r="2" fill="#00D4AA"/></svg>`,
};
import QRCode from 'qrcode';


// Inline QR canvas for WalletConnect URI
function WCQRCanvas({uri}){
  const ref=React.useRef(null);
  React.useEffect(()=>{
    if(!uri||!ref.current)return;
    QRCode.toCanvas(ref.current,uri,{width:200,margin:2,color:{dark:'#000',light:'#fff'}}).catch(()=>{});
  },[uri]);
  return <div style={{background:'#fff',borderRadius:12,padding:10,display:'inline-block'}}><canvas ref={ref} style={{display:'block'}}/></div>;
}

export default function LoginScreen({onLogin,onBack}){
  const [username,setUsername]=useState('');
  const [password,setPassword]=useState('');
  const [err,setErr]=useState(null);
  const [loading,setLoading]=useState(false);
  // After password verified, hold wallet data here until wallet ownership confirmed
  const [pendingLogin,setPendingLogin]=useState(null);
  const [verifyStep,setVerifyStep]=useState(false);
  const [verifyErr,setVerifyErr]=useState(null);
  const [verifying,setVerifying]=useState(false);
  const [wcUri,setWcUri]=useState(null);
  const [showWalletGrid,setShowWalletGrid]=useState(false);
  const [waitApproval,setWaitApproval]=useState(false);
  // Recovery flow — when backup exists but private key is missing
  const [recoveryMode,setRecoveryMode]=useState(false);
  const [recoveryInput,setRecoveryInput]=useState('');
  const [recoveryErr,setRecoveryErr]=useState(null);
  const [recoveryLoading,setRecoveryLoading]=useState(false);
  const [pendingRecovery,setPendingRecovery]=useState<{address:string,contacts:any[],messages:any,profile:any,username:string,password:string}|null>(null);

  // Check if there are saved accounts
  const savedAccounts=[];
  for(let i=0;i<localStorage.length;i++){
    const k=localStorage.key(i);
    if(k&&k.startsWith('pmt_account_')){
      try{const a=JSON.parse(localStorage.getItem(k));if(a.username)savedAccounts.push(a);}catch{}
    }
  }

  const login=async()=>{
    if(!username.trim())return setErr('Enter your username');
    if(!password)return setErr('Enter your password');
    setLoading(true);setErr(null);
    try{
      const uname=username.trim().toLowerCase();

      // Step 1: Try local account for quick password verification
      const key='pmt_account_'+uname;
      let stored=localStorage.getItem(key);
      if(!stored){
        try{
          const sess=JSON.parse(localStorage.getItem('pmt_session')||'{}');
          if(sess.address) stored=localStorage.getItem('pmt_account_'+sess.address.toLowerCase());
        }catch{}
      }

      let privateKey='', address='';

      if(stored){
        const account=JSON.parse(stored);
        const ok=await PMTAuth.verifyPassword(password,account.passwordHash,account.passwordSalt);
        if(ok && account.encryptedWallet){
          // Local verify passed — decrypt pk directly
          const wd=await PMTAuth.decryptWallet(account.encryptedWallet,password);
          privateKey=wd.privateKey??'';
          address=wd.address;
        } else if(!account.encryptedWallet||!ok){
          // Corrupted or no wallet — fall through to cloud restore
          if(account.address){
            localStorage.removeItem('pmt_account_'+uname);
            localStorage.removeItem('pmt_account_'+account.address.toLowerCase());
          }
          stored=null;
        }
      }

      // Step 2: Load from cloud backup (source of truth for contacts/messages/profile)
      setErr('Restoring your account…');
      let contacts: any[]=[], messages: any={}, profile: any={};
      let backupLoaded=false;
      try {
        const bk=await loadCloudBackup(uname,password);
        if(bk){
          // Use backup wallet if local decrypt didn't work
          if(!privateKey){
            if(bk.wallet?.privateKey==='metamask'){
              // Explicitly an external wallet — needs signature verification
              const restoreData={address:bk.wallet.address,privateKey:'metamask',balance:'0.0000',
                network:'PMTchain',username:uname,sessionPassword:password,
                restoredContacts:bk.contacts??[],restoredMessages:bk.messages??{},restoredProfile:bk.profile??{}};
              setPendingLogin(restoreData);setVerifyStep(true);
              setLoading(false);return;
            }
            if(!bk.wallet?.privateKey){
              // Backup exists but private key missing — offer recovery via key/seed phrase
              setPendingRecovery({
                address: bk.wallet.address,
                contacts: bk.contacts??[],
                messages: bk.messages??{},
                profile: bk.profile??{},
                username: uname,
                password,
              });
              setRecoveryMode(true);
              setLoading(false);
              return;
            }
            privateKey=bk.wallet.privateKey??'';
            address=bk.wallet.address;
          }
          contacts=bk.contacts??[];
          messages=bk.messages??{};
          profile=bk.profile??{};
          backupLoaded=true;
        } else if(!privateKey) {
          // No backup and no local account — user truly not found
          throw new Error('NO_BACKUP');
        }
      } catch(bkErr: any) {
        if(bkErr.message==='WRONG_PASSWORD') throw bkErr;
        if(bkErr.message==='NO_BACKUP' && !privateKey) throw bkErr;
        // NO_BACKUP but we have local wallet → login with local wallet, empty contacts
        // (new account or backup not yet saved)
        if(!privateKey) throw bkErr;
        // else: continue with local wallet data, empty contacts
      }

      if(!privateKey||!address) throw new Error('NO_BACKUP');

      // Save account locally for future fast-path verification
      const{hash:ph,salt:ps}=await PMTAuth.hashPassword(password);
      const ew=await PMTAuth.encryptWallet({address,privateKey},password);
      const acctData={username:uname,address,passwordHash:ph,passwordSalt:ps,encryptedWallet:ew};
      localStorage.setItem('pmt_account_'+uname,JSON.stringify(acctData));
      localStorage.setItem('pmt_account_'+address.toLowerCase(),JSON.stringify(acctData));
      localStorage.setItem('pmt_session',JSON.stringify({username:uname,address}));
      sessionStorage.setItem('pmt_pk_'+address.toLowerCase(),privateKey);
      localStorage.setItem('pmt_pk_'+address.toLowerCase(),privateKey);

      // Step 3: Login with ALL data restored from backup (or empty if no backup yet)
      onLogin({address,privateKey,balance:'0.0000',network:'PMTchain',username:uname,
        sessionPassword:password,
        restoredContacts:contacts,
        restoredMessages:messages,
        restoredProfile:profile});

    }catch(e:any){
      if(e.message==='WRONG_PASSWORD'||e.message?.includes('decrypt')||e.name==='OperationError')
        setErr('Incorrect password. Please try again.');
      else if(e.message==='NO_BACKUP')
        setErr('Account not found. Check your username or create a new wallet.');
      else setErr('Login failed: '+e.message);
    }finally{setLoading(false);}
  };

  const connectAndVerify=async(provider,walletName)=>{
    setVerifying(true);setVerifyErr(null);
    try{
      // wallet_requestPermissions ALWAYS opens MetaMask even if already connected
      try{
        await provider.request({method:'wallet_requestPermissions',params:[{eth_accounts:{}}]});
      }catch(permErr){
        if(permErr.code===4001){setVerifyErr('Connection rejected — please approve in your wallet.');setVerifying(false);return;}
      }
      const accounts=await provider.request({method:'eth_accounts'});
      if(!accounts?.length) throw new Error('No accounts returned from wallet');
      const connected=(accounts[0]||'').toLowerCase();
      const expected=(pendingLogin.address||'').toLowerCase();
      if(connected!==expected){
        setVerifyErr(`Wrong wallet.\nExpected:  ${expected.slice(0,8)}...${expected.slice(-6)}\nConnected: ${connected.slice(0,8)}...${connected.slice(-6)}\n\nSwitch to the correct account.`);
        return;
      }
      // Store 24h verify token so refresh doesn't ask again
      localStorage.setItem(`pmt_verify_${connected}`, String(Date.now()));
      onLogin(pendingLogin);
    }catch(e){
      if(e.code===4001) setVerifyErr('Connection rejected — please approve in your wallet.');
      else if(e.code===-32002) setVerifyErr('Wallet has a pending request — open your wallet and approve it.');
      else setVerifyErr('Connection failed: '+(e.message||String(e)));
    }finally{setVerifying(false);}
  };

  // Detect available wallets (EIP-6963 + legacy window.ethereum)
  const [detectedWallets,setDetectedWallets]=React.useState([]);
  React.useEffect(()=>{
    if(!verifyStep) return;
    const found=[];
    const onAnnounce=e=>{
      const{info,provider}=e.detail;
      if(!found.find(w=>w.uuid===info.uuid)){found.push({...info,provider});setDetectedWallets([...found]);}
    };
    window.addEventListener('eip6963:announceProvider',onAnnounce);
    window.dispatchEvent(new Event('eip6963:requestProvider'));
    setTimeout(()=>window.dispatchEvent(new Event('eip6963:requestProvider')),400);
    // Also add legacy window.ethereum if no EIP-6963 wallets found
    setTimeout(()=>{
      if(found.length===0&&window.ethereum){
        const name=window.ethereum.isMetaMask?'MetaMask':window.ethereum.isTrust?'Trust Wallet':'Wallet';
        setDetectedWallets([{uuid:'legacy',name,icon:null,provider:window.ethereum}]);
      }
    },600);
    return()=>window.removeEventListener('eip6963:announceProvider',onAnnounce);
  },[verifyStep]);

  // WalletConnect verify — shows QR code then checks address on connect
  const connectWCAndVerify=async(schemeTemplate=null)=>{
    setVerifying(true);setVerifyErr(null);setWcUri(null);
    try{
      resetWCProvider();
      const provider=await getWCProvider();
      // schemeTemplate: optional deep-link fn for mobile wallet grid
      provider.once('display_uri',(uri)=>{
        if(schemeTemplate){
          window.location.href=schemeTemplate(uri);
          setWaitApproval(true); setVerifying(false);
        } else if(isMobile()){
          setShowWalletGrid(false);
          window.location.href=`https://metamask.app.link/wc?uri=${encodeURIComponent(uri)}`;
          setWaitApproval(true); setVerifying(false);
        } else {
          setWcUri(uri); setVerifying(false); // desktop QR
        }
      });
      provider.connect().then(async()=>{
        setWcUri(null);
        const accounts=provider.accounts||[];
        if(!accounts.length){setVerifyErr('No accounts found.');resetWCProvider();return;}
        const connected=accounts[0].toLowerCase();
        const expected=(pendingLogin.address||'').toLowerCase();
        if(connected!==expected){
          setVerifyErr(`Wrong wallet.
Expected:  ${expected.slice(0,8)}...${expected.slice(-6)}
Connected: ${connected.slice(0,8)}...${connected.slice(-6)}

Switch to the correct account.`);
          resetWCProvider();return;
        }
        setWaitApproval(false);
        localStorage.setItem(`pmt_verify_${connected}`, String(Date.now()));
        onLogin(pendingLogin);
      }).catch(e=>{
        setWcUri(null);setVerifying(false);setWaitApproval(false);resetWCProvider();
        const msg=e.message||String(e);
        if(!msg.includes('reset')&&!msg.includes('closed')&&!msg.includes('User rejected')){
          setVerifyErr('WalletConnect: '+msg);
        }
      });
    }catch(e){
      setVerifying(false);resetWCProvider();
      setVerifyErr('WalletConnect: '+(e.message||String(e)));
    }
  };

  // Wallet verification step
  const doRecovery = async () => {
    if (!pendingRecovery || !recoveryInput.trim()) return;
    setRecoveryLoading(true); setRecoveryErr(null);
    try {
      const { ethers } = await import('ethers');
      const input = recoveryInput.trim();
      let privateKey = '', address = '';
      // Try as seed phrase (12 or 24 words)
      const words = input.split(/\s+/);
      if (words.length === 12 || words.length === 24) {
        const wallet = ethers.Wallet.fromPhrase(words.join(' '));
        privateKey = wallet.privateKey;
        address = wallet.address;
      } else {
        // Try as private key
        const wallet = new ethers.Wallet(input);
        privateKey = wallet.privateKey;
        address = wallet.address;
      }
      // Verify it matches the backup address
      if (pendingRecovery.address && address.toLowerCase() !== pendingRecovery.address.toLowerCase()) {
        setRecoveryErr(`This key belongs to ${address.slice(0,8)}...${address.slice(-6)} but your account is at ${pendingRecovery.address.slice(0,8)}...${pendingRecovery.address.slice(-6)}. Please use the correct key.`);
        setRecoveryLoading(false); return;
      }
      // Re-save backup with private key included
      const { saveCloudBackup } = await import('../lib/cloudBackup');
      const { PMTAuth } = await import('../lib/auth');
      const { hash: ph, salt: ps } = await PMTAuth.hashPassword(pendingRecovery.password);
      const ew = await PMTAuth.encryptWallet({ address, privateKey }, pendingRecovery.password);
      const acctData = { username: pendingRecovery.username, address, passwordHash: ph, passwordSalt: ps, encryptedWallet: ew };
      localStorage.setItem(`pmt_account_${pendingRecovery.username}`, JSON.stringify(acctData));
      localStorage.setItem(`pmt_account_${address.toLowerCase()}`, JSON.stringify(acctData));
      localStorage.setItem(`pmt_pk_${address.toLowerCase()}`, privateKey);
      sessionStorage.setItem(`pmt_pk_${address.toLowerCase()}`, privateKey);
      localStorage.setItem('pmt_session', JSON.stringify({ username: pendingRecovery.username, address }));
      // Save updated backup with private key
      try {
        await saveCloudBackup(pendingRecovery.username, pendingRecovery.password, {
          wallet: { address, privateKey, username: pendingRecovery.username },
          contacts: pendingRecovery.contacts,
          messages: pendingRecovery.messages,
          profile: pendingRecovery.profile,
        });
      } catch {}
      setRecoveryLoading(false);
      onLogin({ address, privateKey, balance: '0.0000', network: 'PMTchain',
        username: pendingRecovery.username, sessionPassword: pendingRecovery.password,
        restoredContacts: pendingRecovery.contacts,
        restoredMessages: pendingRecovery.messages,
        restoredProfile: pendingRecovery.profile });
    } catch (e: any) {
      setRecoveryErr('Invalid key or seed phrase. Please check and try again.');
      setRecoveryLoading(false);
    }
  };

  if (recoveryMode && pendingRecovery) return (
    <div style={{height:'100%',display:'flex',alignItems:'center',justifyContent:'center',background:'var(--bg)',padding:16}}>
      <div style={{width:'100%',maxWidth:400,background:'var(--panel)',border:'1px solid var(--border)',borderRadius:20,padding:'28px 24px',display:'flex',flexDirection:'column',gap:16}}>
        <div style={{display:'flex',alignItems:'center',gap:12}}>
          <button onClick={()=>{setRecoveryMode(false);setRecoveryInput('');setRecoveryErr(null);}}
            style={{background:'var(--surface)',border:'1px solid var(--border)',borderRadius:8,width:32,height:32,color:'var(--muted)',cursor:'pointer',fontSize:14,display:'flex',alignItems:'center',justifyContent:'center'}}>←</button>
          <div>
            <div style={{fontSize:17,fontWeight:600}}>Recover your wallet</div>
            <div style={{fontSize:11,color:'var(--muted)',fontFamily:'var(--mono)'}}>ENTER PRIVATE KEY OR SEED PHRASE</div>
          </div>
        </div>
        <div style={{background:'rgba(99,210,255,.08)',border:'1px solid rgba(99,210,255,.2)',borderRadius:10,padding:'10px 14px',fontSize:12.5,color:'var(--text2)',lineHeight:1.5}}>
          Your account <strong style={{color:'var(--accent)'}}>{pendingRecovery.username}</strong> exists but the wallet key was not saved in your backup. Enter your private key (0x...) or 12/24-word seed phrase to restore access.
        </div>
        {pendingRecovery.address && (
          <div style={{fontSize:11,color:'var(--muted)',fontFamily:'var(--mono)',wordBreak:'break-all'}}>
            Expected address: {pendingRecovery.address}
          </div>
        )}
        <textarea rows={3} placeholder={'Private key (0x...) or seed phrase (word1 word2 ... word12)'}
          value={recoveryInput} onChange={e=>{setRecoveryInput(e.target.value);setRecoveryErr(null);}}
          style={{background:'var(--surface)',border:'1px solid var(--border)',borderRadius:10,padding:'12px 14px',
            color:'var(--text)',fontFamily:'var(--mono)',fontSize:12.5,outline:'none',resize:'none',lineHeight:1.6,width:'100%'}}/>
        {recoveryErr && <div style={{fontSize:12,color:'var(--danger)',lineHeight:1.5}}>{recoveryErr}</div>}
        <div style={{background:'rgba(248,113,113,.07)',border:'1px solid rgba(248,113,113,.2)',borderRadius:9,padding:'10px 14px',fontSize:12,color:'var(--danger)',lineHeight:1.5}}>
          Never share your private key or seed phrase with anyone.
        </div>
        <button onClick={doRecovery} disabled={!recoveryInput.trim()||recoveryLoading}
          style={{padding:'13px',background:'var(--accent)',border:'none',borderRadius:10,color:'#0a0c14',
            fontWeight:700,fontSize:14,cursor:recoveryLoading?'default':'pointer',
            opacity:!recoveryInput.trim()||recoveryLoading?0.6:1,display:'flex',alignItems:'center',justifyContent:'center',gap:8}}>
          {recoveryLoading
            ? <><span style={{width:14,height:14,border:'2px solid rgba(0,0,0,.3)',borderTopColor:'#0a0c14',borderRadius:'50%',display:'inline-block',animation:'spin .7s linear infinite'}}/>Recovering...</>
            : '🔑 Recover & Login'}
        </button>
      </div>
    </div>
  );

  if(verifyStep&&pendingLogin) return(
    <div style={{height:'100%',display:'flex',alignItems:'center',justifyContent:'center',
      background:'var(--bg)',padding:'16px'}}>
      <div style={{width:'100%',maxWidth:400,background:'var(--panel)',border:'1px solid var(--border)',
        borderRadius:16,padding:'24px 20px',display:'flex',flexDirection:'column',gap:18}}>
        <div style={{fontSize:18,fontWeight:600}}>Confirm your wallet</div>
        <div style={{fontSize:13,color:'var(--text2)',lineHeight:1.6}}>
          Connect the wallet associated with this account to confirm ownership before logging in.
        </div>
        <div style={{background:'var(--surface)',border:'1px solid var(--border)',borderRadius:10,
          padding:'12px 14px',display:'flex',flexDirection:'column',gap:4}}>
          <div style={{fontSize:10,color:'var(--muted)',fontFamily:'var(--mono)',letterSpacing:'1px'}}>EXPECTED WALLET</div>
          <div style={{fontFamily:'var(--mono)',fontSize:12,color:'var(--accent)',wordBreak:'break-all'}}>
            {pendingLogin.address}
          </div>
        </div>
        {verifyErr&&(
          <div style={{background:'rgba(248,113,113,.1)',border:'1px solid rgba(248,113,113,.3)',
            borderRadius:8,padding:'10px 12px',fontSize:12,color:'var(--danger)',whiteSpace:'pre-line'}}>
            {verifyErr}
          </div>
        )}
        {/* Show detected wallet buttons */}
        {detectedWallets.length>0
          ? detectedWallets.map(w=>(
              <button key={w.uuid} onClick={()=>connectAndVerify(w.provider,w.name)} disabled={verifying}
                style={{padding:'13px',background:'var(--accent)',border:'none',borderRadius:10,
                  color:'#0a0c14',fontWeight:600,fontSize:14,cursor:'pointer',
                  display:'flex',alignItems:'center',justifyContent:'center',gap:8,
                  opacity:verifying?0.7:1}}>
                {verifying
                  ?<><span style={{width:14,height:14,border:'2px solid rgba(0,0,0,.3)',borderTopColor:'#0a0c14',
                      borderRadius:'50%',display:'inline-block',animation:'spin .7s linear infinite'}}/>Connecting...</>
                  :<>🔐 Connect with {w.name}</>}
              </button>
            ))
          : <button onClick={()=>isMobile()?setShowWalletGrid(true):connectWCAndVerify()} disabled={verifying}
              style={{padding:'13px',background:'var(--accent)',border:'none',borderRadius:10,
                color:'#0a0c14',fontWeight:600,fontSize:14,cursor:'pointer',
                display:'flex',alignItems:'center',justifyContent:'center',gap:8,
                opacity:verifying?0.7:1}}>
              {verifying
                ?<><span style={{width:14,height:14,border:'2px solid rgba(0,0,0,.3)',borderTopColor:'#0a0c14',
                    borderRadius:'50%',display:'inline-block',animation:'spin .7s linear infinite'}}/>Connecting...</>
                :isMobile()?<>🔐 Choose Wallet to Verify</>:<>🔐 Connect & Verify Wallet</>}
            </button>
        }
        {showWalletGrid&&isMobile()&&(
          <div>
            <div style={{fontSize:13,fontWeight:600,marginBottom:4}}>Choose your wallet</div>
            <p style={{fontSize:12,color:'var(--text2)',lineHeight:1.5,margin:'0 0 12px'}}>Tap your wallet — approve the connection, then come back here.</p>
            <div style={{display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:8}}>
              {WALLETS_LC.map(w=>(
                <button key={w.id} onClick={()=>connectWCAndVerify(w.scheme)}
                  style={{display:'flex',flexDirection:'column',alignItems:'center',gap:6,padding:'12px 6px',
                    background:'var(--surface2)',border:'1px solid var(--border)',borderRadius:12,
                    cursor:'pointer',outline:'none',width:'100%',WebkitTapHighlightColor:'transparent'}}>
                  <div style={{width:40,height:40,borderRadius:10,overflow:'hidden'}} dangerouslySetInnerHTML={{__html:WICON_LC[w.id]}}/>
                  <span style={{fontSize:10,color:'var(--text2)',fontWeight:500,textAlign:'center'}}>{w.name}</span>
                </button>
              ))}
            </div>
            <button onClick={()=>setShowWalletGrid(false)} style={{width:'100%',marginTop:10,padding:'9px',background:'transparent',border:'none',color:'var(--muted)',cursor:'pointer',fontSize:12}}>Cancel</button>
          </div>
        )}
        {waitApproval&&(
          <div style={{display:'flex',flexDirection:'column',alignItems:'center',gap:12,padding:'8px 0'}}>
            <div style={{width:36,height:36,borderRadius:'50%',border:'3px solid var(--accent)',borderTopColor:'transparent',animation:'spin .8s linear infinite'}}/>
            <div style={{textAlign:'center',fontSize:13,color:'var(--text2)',lineHeight:1.5}}>Approve the connection in your wallet, then come back here.</div>
            <button onClick={()=>{setWaitApproval(false);resetWCProvider();}} style={{padding:'8px 18px',background:'transparent',border:'1px solid var(--border)',borderRadius:8,color:'var(--muted)',fontSize:12,cursor:'pointer'}}>← Cancel</button>
          </div>
        )}
        <button onClick={connectWCAndVerify} disabled={verifying}
          style={{padding:'11px',background:'#2563eb',border:'1px solid #3b82f6',borderRadius:9,
            color:'#fff',fontWeight:600,fontSize:13,cursor:'pointer',
            display:'flex',alignItems:'center',justifyContent:'center',gap:8,
            opacity:verifying?0.7:1}}>
          <svg width="14" height="9" viewBox="0 0 40 25" fill="white"><path d="M8.19 4.78C14.72-1.59 25.28-1.59 31.81 4.78L32.6 5.55a.83.83 0 0 1 0 1.19l-2.85 2.77a.44.44 0 0 1-.61 0l-1.1-1.06c-4.5-4.35-11.78-4.35-16.28 0l-1.18 1.14a.44.44 0 0 1-.61 0L7.12 6.82a.83.83 0 0 1 0-1.19l1.07-.85zm29.32 5.47 2.54 2.46a.83.83 0 0 1 0 1.19L27.42 25.4a.87.87 0 0 1-1.22 0L17.7 17.2a.22.22 0 0 0-.31 0l-8.5 8.21a.87.87 0 0 1-1.22 0L.08 13.9a.83.83 0 0 1 0-1.19l2.54-2.46a.87.87 0 0 1 1.22 0l8.5 8.21a.22.22 0 0 0 .31 0l8.5-8.21a.87.87 0 0 1 1.22 0l8.5 8.21a.22.22 0 0 0 .31 0l8.5-8.21a.87.87 0 0 1 1.22 0z"/></svg>
          Verify with WalletConnect
        </button>
        <button onClick={()=>{setVerifyStep(false);setPendingLogin(null);setVerifyErr(null);setWcUri(null);}}
          style={{padding:'10px',background:'transparent',border:'1px solid var(--border)',
            borderRadius:9,color:'var(--muted)',cursor:'pointer',fontSize:13}}>
          ← Back to Login
        </button>
      </div>
      {/* WC QR modal */}
      {wcUri&&(
        <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,.8)',display:'flex',alignItems:'center',
          justifyContent:'center',zIndex:400,padding:16}} onClick={()=>setWcUri(null)}>
          <div style={{background:'var(--panel)',border:'1px solid var(--border)',borderRadius:18,
            padding:'24px 20px',width:'100%',maxWidth:340,display:'flex',flexDirection:'column',gap:14}}
            onClick={e=>e.stopPropagation()}>
            <div style={{display:'flex',alignItems:'center',justifyContent:'space-between'}}>
              <div style={{display:'flex',alignItems:'center',gap:10}}>
                <div style={{width:10,height:10,borderRadius:'50%',background:'#3B99FC'}}/>
                <span style={{fontSize:15,fontWeight:600}}>WalletConnect</span>
              </div>
              <button onClick={()=>{setWcUri(null);resetWCProvider();}}
                style={{background:'none',border:'none',color:'var(--muted)',fontSize:22,cursor:'pointer',lineHeight:1}}>×</button>
            </div>
            <div style={{display:'flex',flexDirection:'column',alignItems:'center',gap:10}}>
              <WCQRCanvas uri={wcUri}/>
              <p style={{fontSize:12,color:'var(--text2)',textAlign:'center',lineHeight:1.5,margin:0}}>
                Scan with MetaMask, Trust, Coinbase or any WalletConnect wallet
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );

  return(
    <div style={{height:'100%',display:'flex',alignItems:'flex-start',justifyContent:'center',
      background:'var(--bg)',padding:'16px',overflowY:'auto'}}>
      <div style={{width:'100%',maxWidth:400,background:'var(--panel)',border:'1px solid var(--border)',
        borderRadius:16,padding:'24px 20px',display:'flex',flexDirection:'column',gap:18,
        marginTop:'auto',marginBottom:'auto'}}>
        <div style={{display:'flex',alignItems:'center',gap:12}}>
          <button onClick={onBack}
            style={{background:'var(--surface)',border:'1px solid var(--border)',borderRadius:8,
              width:32,height:32,color:'var(--muted)',cursor:'pointer',fontSize:14,
              display:'flex',alignItems:'center',justifyContent:'center'}}>Back</button>
          <div style={{fontSize:18,fontWeight:600}}>Welcome back</div>
        </div>

        <button onClick={onBack}
          style={{padding:'11px',background:'#faff63',border:'none',borderRadius:9,
            color:'#000000',fontWeight:600,fontSize:13.5,cursor:'pointer',
            display:'flex',alignItems:'center',justifyContent:'center',gap:8}}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="6" width="20" height="14" rx="2"/><path d="M16 12h2a2 2 0 0 1 0 4h-2v-4z"/><path d="M2 10h20"/></svg>
          Connect Wallet Instead
        </button>

        {savedAccounts.length>0&&(
          <div style={{display:'flex',flexDirection:'column',gap:6}}>
            <div style={{fontFamily:'var(--mono)',fontSize:9,color:'var(--muted)',letterSpacing:'1px'}}>YOUR ACCOUNTS</div>
            {savedAccounts.map(a=>(
              <button key={a.username} onClick={()=>setUsername(a.username)}
                style={{display:'flex',alignItems:'center',gap:10,padding:'9px 12px',
                  background:username.toLowerCase()===a.username.toLowerCase()?'var(--surface2)':'var(--surface)',
                  border:'1px solid '+(username.toLowerCase()===a.username.toLowerCase()?'var(--accent)':'var(--border)'),
                  borderRadius:9,cursor:'pointer',textAlign:'left'}}>
                <div style={{width:32,height:32,borderRadius:'50%',background:'var(--accent)',
                  display:'flex',alignItems:'center',justifyContent:'center',
                  color:'#0a0c14',fontWeight:700,fontSize:12,flexShrink:0}}>
                  {a.username.slice(0,2).toUpperCase()}
                </div>
                <div>
                  <div style={{fontSize:13,fontWeight:500,color:'var(--text)'}}>{a.username}</div>
                  <div style={{fontFamily:'var(--mono)',fontSize:10,color:'var(--muted)'}}>
                    {a.address.slice(0,8)}...{a.address.slice(-6)}
                  </div>
                </div>
              </button>
            ))}
          </div>
        )}

        <div>
          <div style={{fontFamily:'var(--mono)',fontSize:9,color:'var(--muted)',letterSpacing:'1px',marginBottom:5}}>USERNAME</div>
          <input placeholder="Your username" value={username}
            onChange={e=>{setUsername(e.target.value);setErr(null);}}
            onKeyDown={e=>e.key==='Enter'&&login()}
            style={{width:'100%',background:'var(--surface)',border:'1px solid var(--border)',
              borderRadius:9,padding:'10px 13px',color:'var(--text)',fontFamily:'var(--sans)',fontSize:14,outline:'none'}}/>
        </div>
        <div>
          <div style={{fontFamily:'var(--mono)',fontSize:9,color:'var(--muted)',letterSpacing:'1px',marginBottom:5}}>PASSWORD</div>
          <input type="password" placeholder="password" value={password}
            onChange={e=>{setPassword(e.target.value);setErr(null);}}
            onKeyDown={e=>e.key==='Enter'&&login()}
            style={{width:'100%',background:'var(--surface)',border:'1px solid var(--border)',
              borderRadius:9,padding:'10px 13px',color:'var(--text)',fontFamily:'var(--sans)',fontSize:14,outline:'none'}}/>
        </div>
        {err&&(
          <div style={{background:'rgba(248,113,113,.1)',border:'1px solid rgba(248,113,113,.3)',
            borderRadius:8,padding:'8px 12px',fontSize:12,color:'var(--danger)'}}>{err}</div>
        )}
        <button onClick={login} disabled={loading||!username||!password}
          style={{padding:'13px',background:'var(--accent)',border:'none',borderRadius:10,
            color:'#0a0c14',fontWeight:600,fontSize:14,cursor:'pointer',
            display:'flex',alignItems:'center',justifyContent:'center',gap:8,
            opacity:loading||!username||!password?0.7:1}}>
          {loading
            ?<><span style={{width:14,height:14,border:'2px solid rgba(0,0,0,.3)',borderTopColor:'#0a0c14',
                borderRadius:'50%',display:'inline-block',animation:'spin .7s linear infinite'}}/>Unlocking...</>
            :'Log In'}
        </button>
        <div style={{textAlign:'center',fontSize:11,color:'var(--muted)',lineHeight:1.6}}>
          Forgot your password? Import your wallet using your seed phrase.
        </div>
      </div>
    </div>
  );
}
