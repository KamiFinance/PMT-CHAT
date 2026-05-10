// @ts-nocheck
import ProfilePic from '../ui/ProfilePic';
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { uploadToPinata, getIpfsUrl } from '../../lib/pinata';
import { now, rndHash, uid, formatSize, currentBlock } from '../../lib/utils';

import Avatar from '../ui/Avatar';
import Bubble from './Bubble';
import AttachMenu from './AttachMenu';
import MobileTopbar from '../ui/MobileTopbar';
import BlockStrip from '../ui/BlockStrip';
import SendModal from '../modals/SendModal';

// ── Emoji Picker ────────────────────────────────────────────────────────────
const EMOJI_CATEGORIES = [
  { label:'😀', name:'Smileys', emojis:['😀','😂','🤣','😅','😊','😇','🥰','😍','🤩','😘','😗','😙','😚','🙂','🤗','🤭','🤫','🤔','😐','😑','😶','🙄','😏','😒','😞','😔','😟','😕','🙃','🤑','😲','😳','🥺','😦','😧','😨','😰','😥','😢','😭','😱','😖','😣','😓','😩','😫','🥱','😤','😡','🤬','😈','💀','💩','🤡','👻','👽','🤖','😺','😸','😹','😻','😼','😽'] },
  { label:'👍', name:'Gestures', emojis:['👋','🤚','🖐','✋','🖖','👌','🤌','🤏','✌️','🤞','🤟','🤘','🤙','👈','👉','👆','🖕','👇','☝️','👍','👎','✊','👊','🤛','🤜','👏','🙌','🫶','👐','🤲','🤝','🙏','✍️','💅','🤳','💪','🦾','🦿','🦵','🦶','👂','🦻','👃','🫀','🫁','🧠','🦷','🦴','👀','👁','👅','👄','🫦','💋','🩸'] },
  { label:'❤️', name:'Hearts', emojis:['❤️','🧡','💛','💚','💙','💜','🖤','🤍','🤎','💔','❤️‍🔥','❤️‍🩹','💕','💞','💓','💗','💖','💘','💝','💟','☮️','✝️','☪️','🕉️','☸️','✡️','🔯','🕎','☯️','☦️','🛐','⛎','🔱','⚜️','🔰','♻️','✅','🈴'] },
  { label:'🎉', name:'Fun', emojis:['🎉','🎊','🎈','🎁','🎀','🎗','🎟','🎫','🎖','🏆','🥇','🥈','🥉','🏅','🎯','🎮','🕹','🎲','🎭','🎨','🖼','🎪','🎤','🎧','🎼','🎵','🎶','🎷','🎸','🎹','🎺','🎻','🥁','🎬','🎥','📽','🎞','📺','📷','📸','🔭','🔬','💡','🔦','🕯','🪔','🧯','💰','💴','💵','💶','💷','💸','💳','🪙'] },
  { label:'🌍', name:'Nature', emojis:['🌍','🌎','🌏','🌐','🗺','🧭','🌋','🏔','⛰','🌁','🏕','🏖','🏜','🏝','🏞','🌅','🌄','🌠','🎇','🎆','🌇','🌆','🏙','🌃','🌌','🌉','🌁','⛺','🏗','🧱','🪨','🪵','🛖','🏠','🏡','🏢','🏣','🏤','🏥','🏦','🏨','🏩','🏪','🏫','🏬','🏭','🏯','🗼','🗽','⛪','🕌','🛕','🕍','⛩','🕋','⛲','⛺'] },
  { label:'🐶', name:'Animals', emojis:['🐶','🐱','🐭','🐹','🐰','🦊','🐻','🐼','🐨','🐯','🦁','🐮','🐷','🐸','🐵','🙈','🙉','🙊','🐔','🐧','🐦','🐤','🦆','🦅','🦉','🦇','🐺','🐗','🐴','🦄','🐝','🪱','🐛','🦋','🐌','🐞','🐜','🪲','🦟','🦗','🪳','🕷','🦂','🐢','🦖','🦕','🐍','🦎','🦴','🐡','🐠','🐟','🐬','🦭','🐳','🦈','🐙','🦑','🦐','🦞','🦀','🐡'] },
  { label:'🍕', name:'Food', emojis:['🍕','🍔','🌮','🌯','🥪','🥙','🥗','🍜','🍝','🍛','🍣','🍱','🍤','🍙','🍚','🍘','🍥','🥮','🍢','🧆','🥚','🍳','🥘','🍲','🥣','🧇','🥞','🧈','🍞','🥐','🥖','🥨','🧀','🥓','🥩','🍗','🍖','🦴','🌭','🍟','🫕','🍦','🍧','🍨','🍩','🍪','🎂','🍰','🧁','🥧','🍫','🍬','🍭','🍮','🧃','🥤','🧋','☕','🍵','🧉','🍺','🍷'] },
  { label:'✈️', name:'Travel', emojis:['✈️','🚀','🛸','🚁','🛩','🪂','⛵','🚢','🛳','⛴','🚤','🛥','🛻','🚗','🚕','🚙','🚌','🏎','🚓','🚑','🚒','🚐','🛻','🚚','🚛','🚜','🏍','🛵','🚲','🛴','🛹','🛼','🚏','🛣','🛤','⛽','🚥','🚦','🚧','🛑','⚓','🪝','⛵','🚣','🛶','⛷','🏂','🪁','🏇','🧗','🚵','🚴'] },
  { label:'💬', name:'Symbols', emojis:['💬','💭','🗯','💤','💢','💥','💦','💨','🕳','💝','💘','💖','💗','💓','💞','💕','💟','❣','❤','🔔','🔕','🎵','🎶','💲','💱','♻','🔰','✅','❌','❎','🚫','⛔','🔴','🟠','🟡','🟢','🔵','🟣','⚫','⚪','🟤','🔶','🔷','🔸','🔹','🔺','🔻','💠','🔘','🔲','🔳','⬜','⬛','◼','◻','◾','◽','▪','▫'] },
];

function EmojiPicker({onSelect,onClose}:{onSelect:(e:string)=>void,onClose:()=>void}){
  const [cat,setCat]=React.useState(0);
  const ref=React.useRef<HTMLDivElement>(null);

  React.useEffect(()=>{
    const handler=(e:MouseEvent)=>{
      if(ref.current&&!ref.current.contains(e.target as Node)) onClose();
    };
    setTimeout(()=>document.addEventListener('mousedown',handler),0);
    return ()=>document.removeEventListener('mousedown',handler);
  },[onClose]);

  return(
    <div ref={ref} style={{position:'absolute',bottom:'calc(100% + 8px)',left:0,
      background:'var(--panel)',border:'1px solid var(--border)',borderRadius:14,
      boxShadow:'0 8px 32px rgba(0,0,0,.5)',zIndex:200,width:320,overflow:'hidden',
      display:'flex',flexDirection:'column'}}>
      {/* Category tabs */}
      <div style={{display:'flex',borderBottom:'1px solid var(--border)',padding:'4px 6px',gap:2,flexWrap:'wrap'}}>
        {EMOJI_CATEGORIES.map((c,i)=>(
          <button key={i} onClick={()=>setCat(i)} title={c.name}
            style={{width:32,height:32,background:cat===i?'var(--surface2)':'transparent',
              border:cat===i?'1px solid var(--border)':'1px solid transparent',
              borderRadius:8,cursor:'pointer',fontSize:16,display:'flex',
              alignItems:'center',justifyContent:'center',transition:'all .1s'}}>
            {c.label}
          </button>
        ))}
      </div>
      {/* Emoji grid */}
      <div style={{padding:'8px 6px',display:'grid',gridTemplateColumns:'repeat(8,1fr)',
        gap:2,maxHeight:220,overflowY:'auto'}}>
        {EMOJI_CATEGORIES[cat].emojis.map((e,i)=>(
          <button key={i} onClick={()=>{onSelect(e);}}
            style={{width:34,height:34,background:'transparent',border:'none',
              cursor:'pointer',fontSize:20,borderRadius:7,display:'flex',
              alignItems:'center',justifyContent:'center',transition:'background .1s'}}
            onMouseEnter={ev=>(ev.currentTarget.style.background='var(--surface2)')}
            onMouseLeave={ev=>(ev.currentTarget.style.background='transparent')}>
            {e}
          </button>
        ))}
      </div>
      {/* Category name */}
      <div style={{padding:'4px 10px 6px',fontSize:10,color:'var(--muted)',
        fontFamily:'var(--mono)',letterSpacing:'1px'}}>
        {EMOJI_CATEGORIES[cat].name.toUpperCase()}
      </div>
    </div>
  );
}

export default function ChatPanel({contact,messages,onSend,onSendETH,isDemo,myAddress,onReact,searchQuery,isGroup,onMediaUploaded,onOpenSidebar,onBack,onViewContact,onManageGroup,needsPasswordToSend,onJoinGroup}){
  const [text,setText]=useState('');
  const [showSend,setShowSend]=useState(false);
  const [showAttach,setShowAttach]=useState(false);
  const [showEmoji,setShowEmoji]=useState(false);
  const [recording,setRecording]=useState(false);
  const fileInputRef=useRef(null);
  const attachBtnRef=useRef(null);
  const fileAcceptRef=useRef('*');
  const [recordSeconds,setRecordSeconds]=useState(0);
  const recordSecondsRef=useRef(0); // ref to avoid stale closure in onstop
  const [recorderError,setRecorderError]=useState(null);
  const bottomRef=useRef(null);
  const messagesRef=useRef<HTMLDivElement>(null);

  // Document-level wheel listener (capture phase) — works without any click,
  // from the moment the mouse enters the chat area.
  useEffect(()=>{
    const handler=(e:WheelEvent)=>{
      const msgs=messagesRef.current;
      if(!msgs) return;
      // Check mouse is inside the chat panel
      const panel=msgs.closest('.chat-panel')||msgs.parentElement?.closest('.chat-panel');
      if(!panel) return;
      const r=panel.getBoundingClientRect();
      if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom) return;
      // Redirect scroll to messages div
      e.preventDefault();
      msgs.scrollTop+=e.deltaY;
    };
    document.addEventListener('wheel',handler,{passive:false,capture:true});
    return()=>document.removeEventListener('wheel',handler,{capture:true});
  },[]);
  const inputRef=useRef(null);
  const mediaRecRef=useRef(null);
  const chunksRef=useRef([]);
  const timerRef=useRef(null);
  const waveformRef=useRef([]);
  const onSendRef=useRef(onSend);
  useEffect(()=>{onSendRef.current=onSend;},[onSend]);

  useEffect(()=>bottomRef.current?.scrollIntoView({behavior:'smooth'}),[messages]);
  useEffect(()=>{setText('');inputRef.current?.focus();setShowAttach(false);setShowEmoji(false);},[contact?.id]);
  useEffect(()=>{
    if(!showAttach)return;
    const close=e=>{
      if(!e.target.closest('[data-attach]'))setShowAttach(false);
    };
    setTimeout(()=>document.addEventListener('click',close),0);
    return()=>document.removeEventListener('click',close);
  },[showAttach]);

  const send=()=>{const t=text.trim();if(!t)return;onSend(t);setText('');};
  const insertEmoji=(emoji:string)=>{
    const el=inputRef.current as any;
    if(!el){setText(p=>p+emoji);return;}
    const start=el.selectionStart??text.length;
    const end=el.selectionEnd??text.length;
    const newText=text.slice(0,start)+emoji+text.slice(end);
    setText(newText);
    // Restore cursor after emoji
    requestAnimationFrame(()=>{
      el.focus();
      el.setSelectionRange(start+emoji.length,start+emoji.length);
    });
  };

  const formatSize=bytes=>{
    if(bytes<1024)return bytes+'B';
    if(bytes<1024*1024)return (bytes/1024).toFixed(1)+'KB';
    return (bytes/(1024*1024)).toFixed(1)+'MB';
  };

  const openFilePicker=(accept)=>{
    fileAcceptRef.current=accept;
    fileInputRef.current.accept=accept;
    fileInputRef.current.click();
  };

  const handleFileChosen=e=>{
    const file=e.target.files[0];
    if(!file)return;
    const localUrl=URL.createObjectURL(file);
    const isImage=file.type.startsWith('image/');
    const msgType=isImage?'image':'file';
    const msgId='m'+Date.now();

    const sendWithB64=(b64Data,mimeType=file.type)=>{
      onSend({
        type:msgType,
        fileUrl:b64Data,   // sender sees the compressed image immediately
        b64Data,
        mediaMsgId:msgId,
        imgMsgId:msgId,
        fileName:file.name,
        fileSize:formatSize(file.size),
        mimeType,
      });
      // Upload to Pinata in background — upgrades to IPFS CID when done
      uploadToPinata(file, file.name)
        .then(cid=>{
          if(onMediaUploaded) onMediaUploaded(msgId, cid, getIpfsUrl(cid));
        })
        .catch(()=>{
          if(onMediaUploaded) onMediaUploaded(msgId, null, null, b64Data);
        });
    };

    if(isImage){
      // Compress image before relay: mobile photos can be 3-5MB+ which exceed Redis 1MB limit
      // Resize to max 900px and encode as JPEG at 0.7 quality — ensures < 200KB base64 for Redis 1MB limit
      const img=new Image();
      img.onload=()=>{
        const MAX=900;
        let w=img.width, h=img.height;
        if(w>MAX||h>MAX){ const r=Math.min(MAX/w,MAX/h); w=Math.round(w*r); h=Math.round(h*r); }
        const canvas=document.createElement('canvas');
        canvas.width=w; canvas.height=h;
        canvas.getContext('2d').drawImage(img,0,0,w,h);
        const b64Data=canvas.toDataURL('image/jpeg',0.7);
        sendWithB64(b64Data,'image/jpeg');
      };
      img.onerror=()=>{
        // Fallback: send original if canvas fails
        const reader=new FileReader();
        reader.onloadend=()=>sendWithB64(reader.result);
        reader.readAsDataURL(file);
      };
      img.src=localUrl;
    } else {
      // Non-image files: send as-is
      const reader=new FileReader();
      reader.onloadend=()=>sendWithB64(reader.result);
      reader.readAsDataURL(file);
    }
    e.target.value='';
  };
  const key=e=>{if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();send();}};

  const startRecording=async()=>{
    setRecorderError(null);
    try{
      const stream=await navigator.mediaDevices.getUserMedia({audio:true});
      // Pick MIME type supported by this browser — iOS Safari needs audio/mp4, Chrome uses audio/webm
      const mimeType = ['audio/mp4','audio/aac','audio/webm;codecs=opus','audio/webm','audio/ogg'].find(t=>MediaRecorder.isTypeSupported(t)) || '';
      const mr=mimeType ? new MediaRecorder(stream,{mimeType}) : new MediaRecorder(stream);
      chunksRef.current=[];
      waveformRef.current=[];
      // Analyse audio for waveform
      const ctx=new (window.AudioContext||window.webkitAudioContext)();
      const src=ctx.createMediaStreamSource(stream);
      const analyser=ctx.createAnalyser();
      analyser.fftSize=64;
      src.connect(analyser);
      const dataArr=new Uint8Array(analyser.frequencyBinCount);
      const captureWave=()=>{
        analyser.getByteFrequencyData(dataArr);
        const avg=dataArr.reduce((a,b)=>a+b,0)/dataArr.length/255;
        waveformRef.current.push(avg);
      };
      mr.ondataavailable=e=>chunksRef.current.push(e.data);
      mr.onstop=()=>{
        stream.getTracks().forEach(t=>t.stop());
        ctx.close();
        const blob=new Blob(chunksRef.current,{type:mr.mimeType||'audio/webm'});
        const url=URL.createObjectURL(blob);
        const dur=recordSecondsRef.current;
        const raw=waveformRef.current;
        const bars=Array.from({length:30},(_,i)=>{
          const idx=Math.floor(i/30*raw.length);
          return Math.max(0.05, raw[idx]||0.1);
        });
        // Read as base64 and store in a SEPARATE key by msgId
        // so the inbox message stays small
        const reader=new FileReader();
        reader.onloadend=()=>{
          const audioBase64=reader.result as string;
          const msgId='v'+Date.now();
          try{ localStorage.setItem('pmt_audio_'+msgId, audioBase64); }catch(e){}

          // Always include base64 in message for reliable cross-device delivery
          // (Pinata/IPFS is unreliable — base64 guarantees recipient gets the audio)
          const sendVoice=(extra={})=>onSendRef.current({
            type:'voice', audioUrl:url, audioMsgId:msgId,
            audioB64:audioBase64, duration:dur, waveform:bars, ...extra
          });

          // Try IPFS upload in background — if it works, resend with CID for efficiency
          // If it fails, the already-sent base64 message is sufficient
          uploadToPinata(blob, 'voice_'+msgId+'.'+(mr.mimeType?.includes('mp4')||mr.mimeType?.includes('aac')?'m4a':'webm'))
            .then(cid=>{ sendVoice({ipfsCid:cid, ipfsUrl:getIpfsUrl(cid)}); })
            .catch(()=>{ sendVoice(); });
        };
        reader.readAsDataURL(blob);
        setRecordSeconds(0);
        recordSecondsRef.current=0;
      };
      mr.start(100);
      mediaRecRef.current=mr;
      setRecording(true);
      let s=0;
      timerRef.current=setInterval(()=>{
        s++;
        setRecordSeconds(s);
        recordSecondsRef.current=s;
        captureWave();
        if(s>=120){stopRecording();}  // 2 min max
      },1000);
    }catch(e){
      setRecorderError(e.name==='NotAllowedError'?'Microphone access denied':'Could not access microphone');
    }
  };

  const stopRecording=()=>{
    clearInterval(timerRef.current);
    if(mediaRecRef.current&&mediaRecRef.current.state!=='inactive'){
      mediaRecRef.current.stop();
    }
    setRecording(false);
  };

  const cancelRecording=()=>{
    clearInterval(timerRef.current);
    if(mediaRecRef.current&&mediaRecRef.current.state!=='inactive'){
      mediaRecRef.current.stream?.getTracks().forEach(t=>t.stop());
      mediaRecRef.current.ondataavailable=null;
      mediaRecRef.current.onstop=null;
      mediaRecRef.current.stop();
    }
    setRecording(false);
    setRecordSeconds(0);
    recordSecondsRef.current=0;
  };
  return(
    <>
      <MobileTopbar contact={contact} onBack={onBack||onOpenSidebar} onOpenSidebar={onOpenSidebar} onViewContact={onViewContact} onSendETH={onSendETH} isDemo={isDemo} needsPasswordToSend={needsPasswordToSend}/>

      {/* Outer wrapper — fills the chat-panel flex slot */}
      <div style={{flex:1,position:'relative',overflow:'hidden',minHeight:0}}>

        {/* ── Messages div covers the ENTIRE area — always under the cursor ── */}
        <div ref={messagesRef}
          style={{position:'absolute',inset:0,overflowY:'auto',
            paddingTop:62,paddingBottom:95,
            display:'flex',flexDirection:'column'}}>
          <div style={{flex:1,padding:'0 20px 0',display:'flex',flexDirection:'column',gap:2}}>
            {searchQuery&&(
              <div style={{textAlign:'center',fontFamily:'var(--mono)',fontSize:10,color:'var(--accent)',
                margin:'4px 0 8px',background:'rgba(250,255,99,.08)',
                border:'1px solid rgba(250,255,99,.2)',borderRadius:8,padding:'5px 12px'}}>
                Showing results for "{searchQuery}"
              </div>
            )}
            <div style={{textAlign:'center',fontFamily:'var(--mono)',fontSize:10,
              color:'var(--accent2)',margin:'6px 0',opacity:.7}}>
              🔗 E2E encryption handshake verified · block #{currentBlock().toLocaleString()}
            </div>
            <div style={{display:'flex',alignItems:'center',gap:10,margin:'14px 0 8px',
              fontFamily:'var(--mono)',fontSize:10,color:'var(--muted)',letterSpacing:'1px'}}>
              <div style={{flex:1,height:1,background:'var(--border)'}}/>TODAY
              <div style={{flex:1,height:1,background:'var(--border)'}}/>
            </div>
            {messages.map(m=>(
              <Bubble key={m.id} msg={m} isOut={m.out} contact={contact}
                myAddress={myAddress} onReact={onReact} searchQuery={searchQuery} onJoinGroup={onJoinGroup}/>
            ))}
            <div ref={bottomRef}/>
          </div>
        </div>

        {/* ── Header — .chat-passthrough makes all descendants pe:none, interactive elements pe:auto ── */}
        <div className="desktop-topbar"
          style={{position:'absolute',top:0,left:0,right:0,zIndex:10,
            borderBottom:'1px solid var(--border)',background:'var(--panel)'}}>
          <div style={{padding:'12px 18px',display:'flex',alignItems:'center',gap:10}}>
            <span onClick={()=>{
                if(contact.isGroup && onManageGroup && contact.createdBy?.toLowerCase()===myAddress?.toLowerCase()){
                  onManageGroup(contact);
                } else if(onViewContact && !contact.isGroup){
                  onViewContact(contact);
                }
              }}
              style={{cursor:(contact.isGroup&&contact.createdBy?.toLowerCase()===myAddress?.toLowerCase())||(!contact.isGroup&&onViewContact)?'pointer':'default',flexShrink:0,pointerEvents:'auto'}}
              title={contact.isGroup&&contact.createdBy?.toLowerCase()===myAddress?.toLowerCase()?'Manage group & invite links':undefined}>
              <ProfilePic initials={contact.isGroup?'#':contact.avatar} avatarUrl={contact.avatarUrl}
                color={contact.isGroup?'var(--accent2)':contact.color}
                bg={contact.isGroup?'#1e1b30':contact.bg} online={contact.online}/>
              {contact.isGroup&&contact.createdBy?.toLowerCase()===myAddress?.toLowerCase()&&(
                <div style={{position:'absolute',bottom:-2,right:-2,background:'var(--accent)',borderRadius:'50%',width:16,height:16,display:'flex',alignItems:'center',justifyContent:'center',fontSize:9,color:'#0a0c14',fontWeight:700,border:'2px solid var(--panel)'}}>⚙</div>
              )}
            </span>
            <div style={{flex:1}}>
              <div style={{fontSize:14,fontWeight:600}}>{contact.name}</div>
              <div style={{fontFamily:'var(--mono)',fontSize:10,color:'var(--accent)',opacity:.8,
                whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>
                {contact.isGroup?`${contact.members?.length||0} members · PMTchain`:contact.address}
              </div>
            </div>
            <div className="chain-badge" style={{display:'flex',alignItems:'center',gap:5,
              padding:'5px 10px',background:'rgba(99,210,255,.07)',
              border:'1px solid rgba(99,210,255,.18)',borderRadius:20,
              fontFamily:'var(--mono)',fontSize:10,color:'var(--accent)',flexShrink:0}}>
              <div style={{width:6,height:6,borderRadius:'50%',background:'var(--accent3)',animation:'pulse 2s infinite'}}/>
              PMTchain
            </div>
            {!contact.isGroup&&(
              <button className="qr-btn" onClick={()=>setShowSend(true)}
                style={{padding:'5px 10px',background:'var(--surface)',border:'1px solid var(--border)',
                  borderRadius:8,color:'var(--text2)',fontSize:12,cursor:'pointer',flexShrink:0}}>↑ PMT</button>
            )}
          </div>
        </div>

        {/* ── Block strip ── */}
        <div className="chat-passthrough" style={{position:'absolute',bottom:70,left:0,right:0,zIndex:5}}>
          <div>
            <BlockStrip blockNum={currentBlock()} className="block-strip-bar"/>
          </div>
        </div>

        {/* ── Input — .chat-passthrough makes background pass-through, buttons/textarea stay clickable ── */}
        <div className="chat-passthrough" style={{position:'absolute',bottom:0,left:0,right:0,zIndex:10}}>
          <div className="chat-input-row"
            style={{padding:'12px 18px',
              borderTop:'1px solid var(--border)',background:'var(--panel)',
              display:'flex',flexDirection:'column',gap:6}}>
            {recorderError&&(
              <div style={{fontSize:11,color:'var(--danger)',fontFamily:'var(--mono)',textAlign:'center'}}>{recorderError}</div>
            )}
            {recording?(
              <div style={{display:'flex',alignItems:'center',gap:10}}>
                <button onClick={cancelRecording}
                  style={{width:38,height:38,background:'var(--surface)',border:'1px solid var(--border)',
                    borderRadius:9,color:'var(--danger)',fontSize:16,display:'flex',alignItems:'center',
                    justifyContent:'center',flexShrink:0,cursor:'pointer'}}>✕</button>
                <div style={{flex:1,background:'var(--surface)',border:'1px solid rgba(248,113,113,.4)',
                  borderRadius:12,display:'flex',alignItems:'center',padding:'0 14px',gap:10,height:42}}>
                  <div style={{width:8,height:8,borderRadius:'50%',background:'var(--danger)',
                    animation:'pulse 1s infinite',flexShrink:0}}/>
                  <span style={{fontFamily:'var(--mono)',fontSize:11,color:'var(--danger)'}}>
                    {String(Math.floor(recordSeconds/60)).padStart(2,'0')}:{String(recordSeconds%60).padStart(2,'0')}
                  </span>
                  <span style={{fontSize:11,color:'var(--muted)',flex:1}}>Recording... tap stop to send</span>
                </div>
                <button onClick={stopRecording}
                  style={{width:40,height:40,background:'var(--danger)',border:'none',
                    borderRadius:10,color:'#fff',fontSize:16,display:'flex',alignItems:'center',
                    justifyContent:'center',flexShrink:0,cursor:'pointer'}}>■</button>
              </div>
            ):(
              <div style={{display:'flex',alignItems:'flex-end',gap:8}}>
                <div style={{position:'relative'}}>
                  <input ref={fileInputRef} type="file" style={{display:'none'}} onChange={handleFileChosen}/>
                  <button ref={attachBtnRef} data-attach="true" onClick={()=>setShowAttach(v=>!v)}
                    style={{width:44,height:44,background:showAttach?'var(--surface2)':'var(--surface)',
                      border:`1px solid ${showAttach?'var(--accent)':'var(--border)'}`,
                      borderRadius:9,color:showAttach?'var(--accent)':'var(--muted)',fontSize:18,
                      display:'flex',alignItems:'center',justifyContent:'center',
                      flexShrink:0,cursor:'pointer',transition:'all .15s'}}>📎</button>
                  {showAttach&&<AttachMenu
                    onImage={accept=>openFilePicker(accept)}
                    onFile={accept=>openFilePicker(accept)}
                    anchorRect={attachBtnRef.current?.getBoundingClientRect()}
                    onClose={()=>setShowAttach(false)}/>}
                </div>
                <div style={{position:'relative'}}>
                  <button onClick={()=>{setShowEmoji(v=>!v);setShowAttach(false);}}
                    style={{width:44,height:44,background:showEmoji?'var(--surface2)':'var(--surface)',
                      border:`1px solid ${showEmoji?'var(--accent)':'var(--border)'}`,
                      borderRadius:9,fontSize:20,display:'flex',alignItems:'center',
                      justifyContent:'center',flexShrink:0,cursor:'pointer',transition:'all .15s'}}>
                    😊
                  </button>
                  {showEmoji&&<EmojiPicker onSelect={e=>{insertEmoji(e);}} onClose={()=>setShowEmoji(false)}/>}
                </div>
                <div style={{flex:1,background:'var(--surface)',border:'1px solid var(--border)',
                  borderRadius:12,display:'flex',alignItems:'flex-end',padding:'0 12px'}}>
                  <textarea ref={inputRef} rows={1} value={text}
                    onChange={e=>setText(e.target.value)} onKeyDown={key}
                    placeholder="(encrypted on-chain)"
                    style={{flex:1,background:'transparent',border:'none',outline:'none',
                      color:'var(--text)',fontFamily:'var(--sans)',fontSize:13.5,
                      padding:'10px 0',resize:'none',lineHeight:1.5,maxHeight:120}}/>
                  <span style={{fontFamily:'var(--mono)',fontSize:9,color:'var(--accent)',
                    opacity:.6,paddingBottom:11}}>🔒 E2E</span>
                </div>
                {text.trim()?(
                  <button onClick={send}
                    style={{width:44,height:44,background:'var(--accent)',border:'none',
                      borderRadius:10,color:'#0a0c14',fontSize:18,display:'flex',alignItems:'center',
                      justifyContent:'center',flexShrink:0,cursor:'pointer',transition:'all .15s'}}>➤</button>
                ):(
                  <button onClick={startRecording}
                    style={{width:44,height:44,background:'var(--surface)',border:'1px solid var(--border)',
                      borderRadius:10,color:'var(--accent2)',fontSize:20,display:'flex',alignItems:'center',
                      justifyContent:'center',flexShrink:0,cursor:'pointer',transition:'all .15s'}}
                    title="Hold to record voice message">🎙</button>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {showSend&&<SendModal contact={contact} onClose={()=>setShowSend(false)}
        onSend={(amt,pwd)=>onSendETH(contact,amt,pwd)} isDemo={isDemo}
        needsPassword={!!needsPasswordToSend}/>}
    </>
  );
}
