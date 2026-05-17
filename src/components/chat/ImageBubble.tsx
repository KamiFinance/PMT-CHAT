// @ts-nocheck
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { getIpfsUrl } from '../../lib/pinata';
import ProfilePic from '../ui/ProfilePic';

import Avatar from '../ui/Avatar';
export default function ImageBubble({msg,isOut,contact}){
  const [open,setOpen]=useState(false);
  const [fileUrl,setFileUrl]=useState(msg.fileUrl||null);
  useEffect(()=>{
    if(fileUrl)return;
    if(msg.ipfsCid){setFileUrl(getIpfsUrl(msg.ipfsCid)||('https://gateway.pinata.cloud/ipfs/'+msg.ipfsCid));return;}
    if(msg.b64Data){setFileUrl(msg.b64Data);return;}
    if(msg.b64Fallback){setFileUrl(msg.b64Fallback);return;}
    if(msg.imgData){setFileUrl(msg.imgData);return;}
    const sk=msg.mediaMsgId?'pmt_media_'+msg.mediaMsgId:msg.imgMsgId?'pmt_media_'+msg.imgMsgId:null;
    if(sk){try{const s=localStorage.getItem(sk)||localStorage.getItem(sk.replace('pmt_media_','pmt_img_'));if(s){try{const p=JSON.parse(s);setFileUrl(p.ipfsUrl||(p.cid?getIpfsUrl(p.cid):null)||s);}catch{setFileUrl(s);}}}catch{}}
  },[msg.imgMsgId,msg.ipfsCid,msg.b64Data,msg.fileUrl]);
  const bubbleStyle=isOut
    ?{background:'#1a2a4a',border:'1px solid rgba(99,210,255,.15)',borderBottomRightRadius:4}
    :{background:'var(--surface2)',border:'1px solid var(--border)',borderBottomLeftRadius:4};
  return(
    <div style={{display:'flex',alignItems:'flex-end',gap:8,marginBottom:3,
      flexDirection:isOut?'row-reverse':'row',animation:'fadeIn .2s ease'}}>
      {!isOut&&<ProfilePic initials={contact?.avatar} avatarUrl={contact?.avatarUrl}
        color={contact?.color} bg={contact?.bg} size={26} fs={10}/>}
      <div style={{maxWidth:'72%'}}>
        <div style={{...bubbleStyle,borderRadius:14,overflow:'hidden',cursor:'pointer',position:'relative'}}
          onClick={()=>setOpen(true)}>
          {fileUrl
            ? <img src={fileUrl} alt={msg.fileName||'image'}
                style={{display:'block',maxWidth:'100%',maxHeight:280,objectFit:'cover',width:'100%'}}/>
            : <div style={{width:'100%',height:120,display:'flex',alignItems:'center',justifyContent:'center',
                color:'var(--muted)',fontSize:12,fontFamily:'var(--mono)',flexDirection:'column',gap:6}}>
                {msg.uploading
                  ? <><div style={{fontSize:18}}>📌</div><div>Uploading to IPFS...</div></>
                  : <><div style={{fontSize:18}}>🖼</div><div>Loading image...</div></>
                }
              </div>
          }
          <div style={{position:'absolute',bottom:0,left:0,right:0,
            background:'linear-gradient(transparent,rgba(0,0,0,.5))',
            padding:'20px 10px 8px',display:'flex',alignItems:'center',gap:6}}>
          </div>
        </div>
        <div style={{display:'flex',alignItems:'center',gap:6,marginTop:4,flexWrap:'wrap',
          paddingLeft:4}}>
          <span style={{fontFamily:'var(--mono)',fontSize:9,color:'var(--muted)'}}>{msg.time}</span>
          <span style={{fontFamily:'var(--mono)',fontSize:9,color:'var(--accent2)',opacity:.7}}>{msg.hash?msg.hash.slice(0,8)+'...'+msg.hash.slice(-4):''}</span>
          <span style={{fontFamily:'var(--mono)',fontSize:9,
            color:msg.confirms===0?'var(--muted)':msg.confirms<6?'var(--accent)':'var(--accent3)'}}>
            {msg.pending?'⏳':('✓'+(msg.confirms||0))}
          </span>
        </div>
      </div>
      {/* Lightbox */}
      {open&&(
        <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,.9)',zIndex:999,
          display:'flex',alignItems:'center',justifyContent:'center'}}
          onClick={()=>setOpen(false)}>
          <img src={fileUrl} alt={msg.fileName}
            style={{maxWidth:'90vw',maxHeight:'90vh',objectFit:'contain',borderRadius:8}}/>
          <button onClick={()=>{const a=document.createElement('a');a.href=fileUrl;a.download=msg.fileName||'image';a.click();}}
            style={{position:'absolute',top:20,right:60,background:'var(--surface)',border:'1px solid var(--border)',
              borderRadius:8,padding:'6px 14px',color:'var(--text)',fontSize:13,cursor:'pointer'}}
            onClick={e=>{e.stopPropagation();const a=document.createElement('a');a.href=fileUrl;a.download=msg.fileName||'image';a.click();}}>
            Download
          </button>
          <button onClick={()=>setOpen(false)}
            style={{position:'absolute',top:20,right:20,background:'var(--surface)',border:'1px solid var(--border)',
              borderRadius:8,width:36,height:36,color:'var(--text)',fontSize:18,cursor:'pointer',
              display:'flex',alignItems:'center',justifyContent:'center'}}>
            x
          </button>
        </div>
      )}
    </div>
  );
}
