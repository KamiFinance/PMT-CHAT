// @ts-nocheck
import React, { useState } from 'react';

export default function SendModal({contact, onClose, onSend, isDemo, needsPassword}) {
  const [amount, setAmount] = useState('');
  const [password, setPassword] = useState('');
  const [sending, setSending] = useState(false);
  const [txHash, setTxHash] = useState(null);
  const [err, setErr] = useState(null);

  const invalidAddr = !isDemo && contact?.address && !/^0x[0-9a-fA-F]{40}$/.test(contact.address);

  const go = async () => {
    if (!parseFloat(amount) || parseFloat(amount) <= 0) return setErr('Enter a valid amount');
    if (needsPassword && !password) return setErr('Enter your wallet password to confirm');
    setSending(true); setErr(null);
    try {
      const hash = await onSend(amount, needsPassword ? password : undefined);
      if (hash) { setTxHash(hash); }
      else { onClose(); }
    } catch(e) {
      if (e.code === 4001) setErr('Transaction rejected in wallet.');
      else setErr(e.message || 'Transaction failed');
      setSending(false);
    }
  };

  if (txHash) return (
    <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,.65)',display:'flex',alignItems:'center',
      justifyContent:'center',zIndex:1000}} onClick={onClose} onWheel={e=>e.stopPropagation()}>
      <div className="modal-inner" style={{background:'var(--panel)',border:'1px solid var(--border)',
        borderRadius:16,padding:'28px',width:340,display:'flex',flexDirection:'column',
        gap:14,alignItems:'center',textAlign:'center',animation:'slideUp .25s ease'}}
        onClick={e=>e.stopPropagation()}>
        <div style={{fontSize:40}}>✅</div>
        <div style={{fontSize:17,fontWeight:600}}>Transaction Sent!</div>
        <div style={{fontSize:13,color:'var(--text2)'}}>
          Sent <strong style={{color:'var(--accent)'}}>{amount} PMT</strong> to {contact.name}
        </div>
        <div style={{fontFamily:'var(--mono)',fontSize:10,color:'var(--accent)',wordBreak:'break-all',
          background:'var(--surface)',border:'1px solid var(--border)',borderRadius:8,padding:'8px 12px',width:'100%'}}>
          {txHash.slice(0,20)}...{txHash.slice(-10)}
        </div>
        <button onClick={onClose} style={{width:'100%',padding:11,background:'var(--accent)',border:'none',
          borderRadius:9,color:'#0a0c14',fontWeight:600,fontSize:13.5,cursor:'pointer'}}>Done</button>
      </div>
    </div>
  );

  return (
    <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,.65)',display:'flex',alignItems:'center',
      justifyContent:'center',zIndex:1000}} onClick={onClose} onWheel={e=>e.stopPropagation()}>
      <div className="modal-inner" style={{background:'var(--panel)',border:'1px solid var(--border)',
        borderRadius:16,padding:'28px',width:340,display:'flex',flexDirection:'column',
        gap:14,animation:'slideUp .25s ease'}} onClick={e=>e.stopPropagation()}>

        <div style={{fontSize:17,fontWeight:600}}>Send PMT</div>
        <div style={{fontSize:12,color:'var(--text2)'}}>
          To: <span style={{color:'var(--accent)'}}>{contact.name}</span>
        </div>
        <div style={{fontFamily:'var(--mono)',fontSize:10,color:'var(--muted)'}}>{contact.address}</div>

        {invalidAddr && (
          <div style={{background:'rgba(248,113,113,.1)',border:'1px solid rgba(248,113,113,.3)',
            borderRadius:8,padding:'8px 12px',fontSize:12,color:'var(--danger)'}}>
            ⚠ This contact has a short/demo address. Edit the contact and enter their full wallet address (0x...40 chars) to send real PMT.
          </div>
        )}

        {/* Amount input */}
        <div style={{display:'flex',alignItems:'center',gap:10,background:'var(--surface)',
          border:'1px solid var(--border)',borderRadius:10,padding:'0 14px'}}>
          <input type="number" step=".001" min="0" placeholder="0.00"
            value={amount} onChange={e=>{setAmount(e.target.value);setErr(null);}}
            autoFocus
            style={{flex:1,background:'transparent',border:'none',outline:'none',color:'var(--text)',
              fontFamily:'var(--mono)',fontSize:22,padding:'12px 0',fontWeight:700}}/>
          <span style={{fontFamily:'var(--mono)',fontSize:13,color:'var(--muted)'}}>PMT</span>
        </div>

        {/* Quick amounts */}
        <div style={{display:'flex',gap:6}}>
          {['0.001','0.01','0.1','0.5'].map(v=>(
            <button key={v} onClick={()=>setAmount(v)}
              style={{flex:1,padding:6,background:'var(--surface)',border:'1px solid var(--border)',
                borderRadius:6,color:'var(--text2)',fontFamily:'var(--mono)',fontSize:11,cursor:'pointer'}}>
              {v}
            </button>
          ))}
        </div>

        {/* Password field for internal wallets without pk in memory */}
        {needsPassword && (
          <div>
            <div style={{fontSize:11,color:'var(--muted)',marginBottom:6}}>
              🔑 Enter your wallet password to confirm:
            </div>
            <input type="password" placeholder="Wallet password"
              value={password} onChange={e=>{setPassword(e.target.value);setErr(null);}}
              style={{width:'100%',background:'var(--surface)',border:'1px solid var(--border)',
                borderRadius:9,padding:'10px 13px',color:'var(--text)',fontFamily:'var(--sans)',
                fontSize:13,outline:'none',boxSizing:'border-box'}}/>
          </div>
        )}

        {err && (
          <div style={{background:'rgba(248,113,113,.1)',border:'1px solid rgba(248,113,113,.3)',
            borderRadius:8,padding:'8px 12px',fontSize:12,color:'var(--danger)'}}>{err}</div>
        )}

        <div style={{display:'flex',gap:10}}>
          <button onClick={onClose} disabled={sending}
            style={{flex:1,padding:10,background:'transparent',border:'1px solid var(--border)',
              borderRadius:9,color:'var(--text2)',fontSize:13.5,cursor:'pointer'}}>Cancel</button>
          <button onClick={go} disabled={sending||!amount}
            style={{flex:2,padding:10,background:'var(--accent3)',border:'none',borderRadius:9,
              color:'#0a0c14',fontWeight:600,fontSize:13.5,cursor:sending?'default':'pointer',opacity:sending?0.7:1}}>
            {sending ? '⏳ Sending...' : `Send ${amount||'0'} PMT`}
          </button>
        </div>

        <p style={{fontSize:11,color:'var(--muted)',textAlign:'center'}}>
          {isDemo ? 'Demo mode — no real transaction' : 'Transaction will be sent on PMT Chain'}
        </p>
      </div>
    </div>
  );
}
