// @ts-nocheck
import React, { useState, useEffect } from 'react';
import { getIpfsUrl } from '../../lib/pinata';
import ProfilePic from '../ui/ProfilePic';
import { createPortal } from 'react-dom';

export default function FileBubble({msg,isOut,contact}){
  const ext=(msg.fileName||'').split('.').pop().toUpperCase().slice(0,4)||'FILE';
  const [fileUrl,setFileUrl]=useState(msg.fileUrl||null);
  const [open,setOpen]=useState(false);

  useEffect(()=>{
    if(fileUrl)return;
    if(msg.ipfsCid){setFileUrl(getIpfsUrl(msg.ipfsCid));return;}
    if(msg.b64Data){setFileUrl(msg.b64Data);return;}
    if(msg.b64Fallback){setFileUrl(msg.b64Fallback);return;}
    if(msg.imgData){setFileUrl(msg.imgData);return;}
    const sk=msg.mediaMsgId?'pmt_media_'+msg.mediaMsgId:msg.imgMsgId?'pmt_media_'+msg.imgMsgId:null;
    if(sk){try{const s=localStorage.getItem(sk);if(s){try{const p=JSON.parse(s);setFileUrl(p.ipfsUrl||(p.cid?getIpfsUrl(p.cid):null)||s);}catch{setFileUrl(s);}}}catch{}}
  },[msg.mediaMsgId,msg.imgMsgId,msg.ipfsCid,msg.b64Data]);

  const extColors={PDF:'#f87171',DOC:'#60a5fa',DOCX:'#60a5fa',XLS:'#34d399',
    XLSX:'#34d399',ZIP:'#f59e0b',RAR:'#f59e0b',MP4:'#a78bfa',MP3:'#a78bfa',TXT:'#9ca3af'};
  const color=extColors[ext]||'var(--accent)';
  const bubbleStyle=isOut
    ?{background:'#1a2a4a',border:'1px solid rgba(99,210,255,.15)',borderBottomRightRadius:4}
    :{background:'var(--surface2)',border:'1px solid var(--border)',borderBottomLeftRadius:4};

  const handleDownload=(e)=>{
    e?.stopPropagation();
    if(!fileUrl){alert('File not available yet');return;}
    const a=document.createElement('a');
    a.href=fileUrl;a.download=msg.fileName||'file';a.click();
  };

  const isImg=['PNG','JPG','JPEG','GIF','WEBP','SVG'].includes(ext);
  const isPdf=ext==='PDF';

  const modal=open&&createPortal(
    <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,.93)',zIndex:9999,
      display:'flex',flexDirection:'column'}}
      onClick={()=>setOpen(false)}>
      {/* Header */}
      <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',
        padding:'14px 16px',background:'rgba(0,0,0,.5)'}}
        onClick={e=>e.stopPropagation()}>
        <span style={{color:'var(--text)',fontSize:14,fontWeight:500,
          overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap',maxWidth:'70%'}}>
          {msg.fileName||'File'}
        </span>
        <div style={{display:'flex',gap:10}}>
          <button onClick={handleDownload}
            style={{background:'var(--surface)',border:'1px solid var(--border)',
              borderRadius:8,padding:'6px 14px',color:'var(--text)',fontSize:13,cursor:'pointer'}}>
            ↓ Download
          </button>
          <button onClick={()=>setOpen(false)}
            style={{background:'var(--surface)',border:'1px solid var(--border)',
              borderRadius:8,width:36,height:36,color:'var(--text)',fontSize:22,cursor:'pointer',
              display:'flex',alignItems:'center',justifyContent:'center',lineHeight:1}}>
            ×
          </button>
        </div>
      </div>
      {/* Content */}
      <div style={{flex:1,display:'flex',alignItems:'center',justifyContent:'center',
        overflow:'auto',padding:16}}
        onClick={e=>e.stopPropagation()}>
        {fileUrl&&isImg&&<img src={fileUrl} alt={msg.fileName}
          style={{maxWidth:'90vw',maxHeight:'80vh',objectFit:'contain',borderRadius:8}}/>}
        {fileUrl&&isPdf&&<iframe src={fileUrl} title={msg.fileName}
          style={{width:'90vw',height:'80vh',border:'none',borderRadius:8,background:'#fff'}}/>}
        {!isImg&&!isPdf&&(
          <div style={{display:'flex',flexDirection:'column',alignItems:'center',gap:16,padding:40}}>
            <div style={{width:64,height:64,borderRadius:16,background:`${color}20`,
              border:`1px solid ${color}40`,display:'flex',flexDirection:'column',
              alignItems:'center',justifyContent:'center',gap:2}}>
              <span style={{fontSize:11,fontFamily:'var(--mono)',color,fontWeight:700}}>{ext}</span>
              <span style={{fontSize:24}}>📄</span>
            </div>
            <div style={{textAlign:'center'}}>
              <div style={{color:'var(--text)',fontSize:15,fontWeight:500}}>{msg.fileName}</div>
              <div style={{color:'var(--muted)',fontSize:12,marginTop:4}}>{msg.fileSize}</div>
            </div>
            <button onClick={handleDownload}
              style={{background:'var(--accent)',border:'none',borderRadius:10,
                padding:'10px 28px',color:'#0a0c14',fontSize:14,fontWeight:600,cursor:'pointer'}}>
              ↓ Download
            </button>
          </div>
        )}
      </div>
    </div>,
    document.body
  );

  return(
    <div style={{display:'flex',alignItems:'flex-end',gap:8,marginBottom:3,
      flexDirection:isOut?'row-reverse':'row',animation:'fadeIn .2s ease'}}>
      {!isOut&&<ProfilePic initials={contact?.avatar} avatarUrl={contact?.avatarUrl}
        color={contact?.color} bg={contact?.bg} size={26} fs={10}/>}
      <div style={{maxWidth:'72%'}}>
        <div style={{...bubbleStyle,borderRadius:14,padding:'10px 14px',
          display:'flex',alignItems:'center',gap:12,cursor:'pointer',minWidth:200}}
          onClick={()=>setOpen(true)}>
          <div style={{width:42,height:42,borderRadius:10,background:`${color}20`,
            border:`1px solid ${color}40`,display:'flex',flexDirection:'column',
            alignItems:'center',justifyContent:'center',flexShrink:0,gap:1}}>
            <span style={{fontSize:9,fontFamily:'var(--mono)',color,fontWeight:700,letterSpacing:.5}}>{ext}</span>
            <span style={{fontSize:16}}>📄</span>
          </div>
          <div style={{flex:1,minWidth:0}}>
            <div style={{fontSize:13,fontWeight:500,whiteSpace:'nowrap',overflow:'hidden',
              textOverflow:'ellipsis',color:'var(--text)'}}>{msg.fileName||'file'}</div>
            <div style={{fontSize:11,color:'var(--muted)',marginTop:2}}>{msg.fileSize} · tap to preview</div>
          </div>
          <div style={{fontSize:18,color:'var(--muted)',flexShrink:0}}>👁</div>
        </div>
        <div style={{display:'flex',alignItems:'center',gap:6,marginTop:4,flexWrap:'wrap',paddingLeft:4}}>
          <span style={{fontFamily:'var(--mono)',fontSize:9,color:'var(--muted)'}}>{msg.time}</span>
          <span style={{fontFamily:'var(--mono)',fontSize:9,color:'var(--accent2)',opacity:.7}}>{msg.hash?msg.hash.slice(0,8)+'...'+msg.hash.slice(-4):''}</span>
          <span style={{fontFamily:'var(--mono)',fontSize:9,
            color:msg.confirms===0?'var(--muted)':msg.confirms<6?'var(--accent)':'var(--accent3)'}}>
            {msg.pending?'⏳':('✓'+(msg.confirms||0))}
          </span>
        </div>
      </div>
      {modal}
    </div>
  );
}
