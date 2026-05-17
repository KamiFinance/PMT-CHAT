// @ts-nocheck
import React, { useState, useEffect, useRef, useCallback } from 'react';

import QRInline from '../ui/QRInline';
export default function WalletModal({wallet,isDemo,onClose}){
  const [tokens,setTokens]=useState(()=>
    wallet?.balance ? [{symbol:'PMT',name:'PMTchain',balance:wallet.balance,icon:'◈',color:'#faff63'}] : []
  );
  const [loading,setLoading]=useState(true);
  const [error,setError]=useState(null);
  const [copied,setCopied]=useState(false);
  const [showQRTab,setShowQRTab]=useState(false);
  const addr=wallet?.address||'';

  const DEMO_TOKENS=[
    {symbol:'PMT',name:'PMTchain',balance:'2.847',value:'$0.284',icon:'◈',color:'#faff63',change:'+5.2%',pos:true},
    {symbol:'ETH',name:'Ethereum',balance:'0.142',value:'$512.40',icon:'Ξ',color:'#a78bfa',change:'+2.1%',pos:true},
    {symbol:'USDC',name:'USD Coin',balance:'245.00',value:'$245.00',icon:'$',color:'#34d399',change:'0.0%',pos:true},
    {symbol:'USDT',name:'Tether',balance:'100.00',value:'$100.00',icon:'₮',color:'#26a17b',change:'-0.1%',pos:false},
    {symbol:'WBTC',name:'Wrapped BTC',balance:'0.002',value:'$186.20',icon:'₿',color:'#f59e0b',change:'+3.8%',pos:true},
  ];

  useEffect(()=>{
    if(isDemo){setTokens(DEMO_TOKENS);setLoading(false);return;}
    if(!addr){setLoading(false);return;}
    fetchBalances(addr);
  },[addr]);

  const fetchBalances=async(address)=>{
    // Only show spinner on first load; keep existing tokens visible during refresh
    if(tokens.length===0) setLoading(true);
    setError(null);
    const list=[];
    try{
      // ETH balance via public Cloudflare Ethereum gateway
      const ethRes=await fetch('https://cloudflare-eth.com',{
        method:'POST',
        headers:{'Content-Type':'application/json'},
        body:JSON.stringify({jsonrpc:'2.0',id:1,method:'eth_getBalance',params:[address,'latest']}),
      });
      const ethData=await ethRes.json();
      if(ethData.result){
        const wei=parseInt(ethData.result,16);
        const eth=(wei/1e18).toFixed(4);
        list.push({symbol:'ETH',name:'Ethereum',balance:eth,icon:'Ξ',color:'#a78bfa'});
      }
    }catch{}

    // PMT balance — use wallet.balance which is already kept up-to-date by App.tsx
    // (App.tsx polls the RPC every 30s and updates wallet state)
    list.unshift({symbol:'PMT', name:'PMTchain', balance:wallet?.balance||'0.0000', icon:'◈', color:'#faff63'});

    try{
      // ERC-20 tokens via Moralis public API (no key needed for basic)
      const morRes=await fetch(
        `https://deep-index.moralis.io/api/v2.2/${address}/erc20?chain=eth`,
        {headers:{'X-API-Key':'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJub25jZSI6IjMwMzAzMTVkLTM4ZTEtNDcxZi1hZTVjLTMzZjJkNWRjZmFkZSIsIm9yZ0lkIjoiNDA2MzI2IiwidXNlcklkIjoiNDE3OTUzIiwidHlwZUlkIjoiZDBlOGNiZGMtMThlZS00MDFhLTkwOGItNGNjYTUwMzIzMWZkIiwidHlwZSI6IlBST0pFQ1QiLCJpYXQiOjE3MjQ3NjE3MzYsImV4cCI6NDg4MDUyMTczNn0.1VTx-4EQV3xGGMBgBOo-kPhM8s4_eKqz9YMlMBfQRkY'}}
      );
      if(morRes.ok){
        const morData=await morRes.json();
        (morData.result||[]).slice(0,8).forEach(t=>{
          const bal=(parseInt(t.balance||'0')/Math.pow(10,t.decimals||18)).toFixed(4);
          if(parseFloat(bal)>0){
            list.push({symbol:t.symbol,name:t.name,balance:bal,icon:t.symbol.slice(0,1),color:'#63d2ff'});
          }
        });
      }
    }catch{}

    setTokens(list);
    setLoading(false);
  };

  const copy=()=>{
    navigator.clipboard.writeText(addr).catch(()=>{});
    setCopied(true);setTimeout(()=>setCopied(false),2000);
  };

  const totalUSD=isDemo?'$1,043.94':null;

  return(
    <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,.75)',display:'flex',alignItems:'center',
      justifyContent:'center',zIndex:1000}} onClick={onClose}>
      <div style={{background:'var(--panel)',border:'1px solid var(--border)',borderRadius:20,
        width:360,maxHeight:'85vh',display:'flex',flexDirection:'column',
        animation:'slideUp .25s ease',overflow:'hidden'}} onClick={e=>e.stopPropagation()}>

        {/* Header */}
        <div style={{padding:'20px 20px 16px',background:'linear-gradient(135deg,#0a0a0f 0%,#1a1a2e 100%)',
          borderBottom:'1px solid var(--border)',flexShrink:0}}>
          <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:12}}>
            <div style={{display:'flex',alignItems:'center',gap:8}}>
              <div style={{width:36,height:36,borderRadius:'50%',background:'var(--accent)',
                display:'flex',alignItems:'center',justifyContent:'center',fontSize:16,fontWeight:700,color:'#000'}}>
                {isDemo?'D':(wallet?.username?.[0]||addr[2]||'W').toUpperCase()}
              </div>
              <div>
                <div style={{fontWeight:600,fontSize:14,color:'var(--text)'}}>
                  {isDemo?'Demo Wallet':wallet?.username||'My Wallet'}
                </div>
                <div style={{fontFamily:'var(--mono)',fontSize:10,color:'var(--muted)'}}>
                  {isDemo?'demo mode':addr.slice(0,8)+'...'+addr.slice(-6)}
                </div>
              </div>
            </div>
            <button onClick={onClose} style={{background:'none',border:'none',color:'var(--muted)',
              fontSize:22,cursor:'pointer',lineHeight:1}}>×</button>
          </div>
          {/* Address bar */}
          <div style={{display:'flex',alignItems:'center',gap:8,background:'rgba(255,255,255,.06)',
            borderRadius:8,padding:'8px 12px',cursor:'pointer'}} onClick={copy}>
            <span style={{fontFamily:'var(--mono)',fontSize:10,color:'var(--text2)',flex:1,
              overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>
              {isDemo?'0xdemo...0000':addr}
            </span>
            <span style={{fontSize:12,color:copied?'var(--accent3)':'var(--muted)',flexShrink:0}}>
              {copied?'✓ Copied':'⧉'}
            </span>
          </div>
          {/* Total balance */}
          {totalUSD&&(
            <div style={{textAlign:'center',marginTop:14}}>
              <div style={{fontSize:28,fontWeight:700,color:'var(--text)',letterSpacing:'-0.5px'}}>{totalUSD}</div>
              <div style={{fontSize:11,color:'var(--muted)',marginTop:2}}>Total Portfolio Value</div>
            </div>
          )}
        </div>

        {/* Token list OR QR view */}
        <div style={{flex:1,overflowY:'auto',padding:'12px 0'}}>
          {showQRTab?(
            <div style={{display:'flex',flexDirection:'column',alignItems:'center',gap:16,padding:'16px'}}>
              <div style={{fontFamily:'var(--mono)',fontSize:9,color:'var(--muted)',letterSpacing:'1.5px'}}>SCAN TO RECEIVE</div>
              <div style={{background:'#fff',borderRadius:14,padding:14,display:'inline-block',boxShadow:'0 4px 24px rgba(0,0,0,.3)'}}>
                <QRInline address={isDemo?'demo-wallet-address':addr}/>
              </div>
              <div style={{textAlign:'center'}}>
                <div style={{fontSize:13,fontWeight:600,color:'var(--text)',marginBottom:6}}>{wallet?.username||'My Wallet'}</div>
                <div style={{fontFamily:'var(--mono)',fontSize:10,color:'var(--accent)',wordBreak:'break-all',background:'var(--surface)',borderRadius:8,padding:'8px 12px',cursor:'pointer',border:'1px solid var(--border)'}} onClick={copy}>
                  {isDemo?'demo-wallet-address':addr}
                  <span style={{marginLeft:8,color:copied?'var(--accent3)':'var(--muted)'}}>{copied?'✓':'⧉'}</span>
                </div>
              </div>
            </div>
          ):(
            <div>
              <div style={{padding:'0 16px 8px',fontFamily:'var(--mono)',fontSize:9,color:'var(--muted)',letterSpacing:'1.5px'}}>ASSETS</div>
              {loading&&(
                <div style={{display:'flex',flexDirection:'column',gap:10,padding:'0 16px'}}>
                  {[1,2,3].map(i=>(
                    <div key={i} style={{display:'flex',alignItems:'center',gap:12,padding:'12px',background:'var(--surface)',borderRadius:10,animation:'pulse 1.5s ease-in-out infinite'}}>
                      <div style={{width:36,height:36,borderRadius:'50%',background:'var(--surface2)'}}/>
                      <div style={{flex:1}}>
                        <div style={{width:80,height:12,background:'var(--surface2)',borderRadius:4,marginBottom:6}}/>
                        <div style={{width:50,height:10,background:'var(--surface2)',borderRadius:4}}/>
                      </div>
                    </div>
                  ))}
                </div>
              )}
              {!loading&&tokens.length===0&&(
                <div style={{textAlign:'center',padding:'32px 20px',color:'var(--muted)',fontSize:13}}>No tokens found</div>
              )}
              {!loading&&tokens.map((t,i)=>(
                <div key={i} style={{display:'flex',alignItems:'center',gap:12,padding:'10px 16px',transition:'background .15s',cursor:'default'}}
                  onMouseEnter={e=>e.currentTarget.style.background='var(--surface)'}
                  onMouseLeave={e=>e.currentTarget.style.background='transparent'}>
                  <div style={{width:38,height:38,borderRadius:'50%',background:`${t.color}20`,border:`1.5px solid ${t.color}50`,display:'flex',alignItems:'center',justifyContent:'center',fontSize:15,fontWeight:700,color:t.color,flexShrink:0}}>{t.icon}</div>
                  <div style={{flex:1,minWidth:0}}>
                    <div style={{display:'flex',justifyContent:'space-between',alignItems:'center'}}>
                      <span style={{fontWeight:600,fontSize:13,color:'var(--text)'}}>{t.symbol}</span>
                      <span style={{fontFamily:'var(--mono)',fontSize:12,color:'var(--text)',fontWeight:500}}>{t.balance}</span>
                    </div>
                    <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginTop:2}}>
                      <span style={{fontSize:11,color:'var(--muted)'}}>{t.name}</span>
                      <div style={{display:'flex',gap:8,alignItems:'center'}}>
                        {t.value&&<span style={{fontSize:11,color:'var(--muted)'}}>{t.value}</span>}
                        {t.change&&<span style={{fontSize:10,fontFamily:'var(--mono)',color:t.pos?'var(--accent3)':'var(--danger)'}}>{t.change}</span>}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
        {/* Footer */}
        <div style={{padding:'12px 16px',borderTop:'1px solid var(--border)',flexShrink:0,
          display:'flex',gap:8}}>
          <button onClick={()=>{if(!isDemo)fetchBalances(addr);}}
            style={{flex:1,padding:'10px',background:'var(--surface)',border:'1px solid var(--border)',
              borderRadius:9,color:'var(--text)',fontSize:12,cursor:'pointer',fontFamily:'var(--mono)'}}>
            ↻ Refresh
          </button>
          <button onClick={()=>setShowQRTab(t=>!t)}
            style={{flex:1,padding:'10px',background:showQRTab?'var(--accent)':'var(--surface)',
              border:'1px solid var(--border)',borderRadius:9,
              color:showQRTab?'#000':'var(--text)',fontSize:12,cursor:'pointer',fontWeight:600}}>
            {showQRTab?'← Tokens':'▦ My QR'}
          </button>
        </div>
      </div>
    </div>
  );
}
