// @ts-nocheck
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { getIpfsUrl } from '../../lib/pinata';
import ProfilePic from '../ui/ProfilePic';

import Avatar from '../ui/Avatar';
export default function VoiceBubble({msg,isOut,contact}){
  const [playing,setPlaying]=useState(false);
  const [progress,setProgress]=useState(0);
  const audioRef=useRef(null);

  // Try to get audioUrl — from msg directly, or reconstruct from audioMsgId
  const [audioUrl,setAudioUrl]=useState(msg.audioUrl||null);
  useEffect(()=>{
    if(audioUrl)return;
    // Try audioB64 FIRST (immediate, no network) before IPFS (slow, may fail)
    if((msg as any).audioB64){
      try{
        const b64=(msg as any).audioB64 as string;
        const mimeMatch=b64.match(/^data:([^;]+(?:;codecs=[^;]+)?);base64,/);
        const mime=mimeMatch?mimeMatch[1]:'audio/mp4';
        const dec=atob(b64.split(',')[1]);
        const bytes=new Uint8Array(dec.length);
        for(let i=0;i<dec.length;i++) bytes[i]=dec.charCodeAt(i);
        setAudioUrl(URL.createObjectURL(new Blob([bytes],{type:mime})));
        return;
      }catch(e){}
    }
    // Fallback: IPFS
    if(msg.ipfsCid){
      setAudioUrl(getIpfsUrl(msg.ipfsCid)||('https://ipfs.io/ipfs/'+msg.ipfsCid));
      return;
    }
    if(msg.ipfsUrl){ setAudioUrl(msg.ipfsUrl); return; }
    // Same-device fallback: localStorage
    if(!msg.audioMsgId)return;
    try{
      const b64=localStorage.getItem('pmt_audio_'+msg.audioMsgId);
      if(!b64||b64.length<50)return;
      const mimeMatch=b64.match(/^data:([^;]+(?:;codecs=[^;]+)?);base64,/);
      const mime=mimeMatch?mimeMatch[1]:'audio/webm';
      const dec=atob(b64.split(',')[1]);
      const bytes=new Uint8Array(dec.length);
      for(let i=0;i<dec.length;i++) bytes[i]=dec.charCodeAt(i);
      setAudioUrl(URL.createObjectURL(new Blob([bytes],{type:mime})));
    }catch(e){}
  },[msg.audioMsgId,msg.ipfsCid,msg.ipfsUrl,(msg as any).audioB64]);

  const hasAudio=!!audioUrl;
  const toggle=()=>{
    if(!hasAudio||!audioRef.current)return;
    if(playing){audioRef.current.pause();}
    else{audioRef.current.play();}
    setPlaying(!playing);
  };

  useEffect(()=>{
    const a=audioRef.current;
    if(!a)return;
    const onTime=()=>setProgress((a.currentTime/a.duration)*100||0);
    const onEnd=()=>{setPlaying(false);setProgress(0);};
    a.addEventListener('timeupdate',onTime);
    a.addEventListener('ended',onEnd);
    return()=>{a.removeEventListener('timeupdate',onTime);a.removeEventListener('ended',onEnd);};
  },[]);

  const bars=msg.waveform||Array.from({length:30},(_,i)=>0.2+Math.abs(Math.sin(i*0.8+(msg.id||0)))*0.8);
  const dur=msg.duration||0;
  const mins=Math.floor(dur/60);
  const secs=String(dur%60).padStart(2,'0');

  return(
    <div style={{display:'flex',alignItems:'flex-end',gap:8,marginBottom:3,
      flexDirection:isOut?'row-reverse':'row',animation:'fadeIn .2s ease'}}>
      {!isOut&&<ProfilePic initials={contact?.avatar} avatarUrl={contact?.avatarUrl}
        color={contact?.color} bg={contact?.bg} size={26} fs={10}/>}
      <div style={{maxWidth:'280px',padding:'10px 14px',borderRadius:16,
        ...(isOut?{background:'#1a2a4a',border:'1px solid rgba(99,210,255,.15)',borderBottomRightRadius:4}
                 :{background:'var(--surface2)',border:'1px solid var(--border)',borderBottomLeftRadius:4})}}>
        {audioUrl&&<audio ref={audioRef} src={audioUrl}/>}
        <div style={{display:'flex',alignItems:'center',gap:10}}>
          {/* Play button */}
          <button onClick={toggle}
            title={hasAudio?'Play':'🔒 E2E encrypted — audio only on sender device'}
            style={{width:36,height:36,borderRadius:'50%',
              background:hasAudio?(isOut?'var(--accent)':'var(--accent2)'):'rgba(255,255,255,.1)',
              border:hasAudio?'none':'1px solid rgba(255,255,255,.2)',
              display:'flex',alignItems:'center',justifyContent:'center',
              cursor:hasAudio?'pointer':'default',flexShrink:0,fontSize:14,
              color:hasAudio?'#0a0c14':'var(--muted)',opacity:hasAudio?1:0.7}}>
            {playing?'⏸':'▶'}
          </button>
          {/* Waveform */}
          <div style={{flex:1,display:'flex',alignItems:'center',gap:1.5,height:32,position:'relative'}}>
            {bars.map((h,i)=>{
              const pct=progress/100;
              const filled=i/bars.length<pct;
              return(
                <div key={i} style={{
                  width:2.5,borderRadius:2,flexShrink:0,
                  height:Math.max(3,h*28)+'px',
                  background:filled
                    ?(isOut?'var(--accent)':'var(--accent2)')
                    :'rgba(255,255,255,0.15)',
                  transition:'background .1s'
                }}/>
              );
            })}
          </div>
          {/* Duration */}
          <span style={{fontFamily:'var(--mono)',fontSize:10,color:'var(--muted)',flexShrink:0}}>
            {mins}:{secs}
          </span>
        </div>
        <div style={{display:'flex',alignItems:'center',gap:6,marginTop:6,flexWrap:'wrap'}}>
          <span style={{fontFamily:'var(--mono)',fontSize:9,color:'var(--muted)'}}>{msg.time}</span>
          <span style={{fontFamily:'var(--mono)',fontSize:9,color:'var(--accent2)',opacity:.7}}>{msg.hash?msg.hash.slice(0,8)+'...'+msg.hash.slice(-4):''}</span>
          <span style={{fontFamily:'var(--mono)',fontSize:9,color:'var(--accent3)'}}>✓{msg.confirms||0}</span>
        </div>
      </div>
    </div>
  );
}
