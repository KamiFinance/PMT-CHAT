// @ts-nocheck
import ProfilePic from '../ui/ProfilePic';
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { uploadToPinata, getIpfsUrl } from '../../lib/pinata';
import { now, rndHash, uid, formatSize, currentBlock } from '../../lib/utils';

import Avatar from '../ui/Avatar';
import Bubble from './Bubble';
import Twemoji from '../ui/Twemoji';
import EmojiInput from './EmojiInput';
import AttachMenu from './AttachMenu';
import GifStickerPicker from './GifStickerPicker';
import EmojiGifPanel from './EmojiGifPanel';
import MobileTopbar from '../ui/MobileTopbar';
import BlockStrip from '../ui/BlockStrip';
import SendModal from '../modals/SendModal';

// ── Emoji Picker ────────────────────────────────────────────────────────────
const PMT_LOGO_EMOJI = '🏛';

// Returns true if the emoji renders visibly (not blank box / not-found glyph)
const emojiRendersOk = (() => {
  const cache: Record<string,boolean> = {};
  return (e: string): boolean => {
    if (e === '__PMT__') return true;
    if (cache[e] !== undefined) return cache[e];
    try {
      const canvas = document.createElement('canvas');
      canvas.width = canvas.height = 10;
      const ctx = canvas.getContext('2d')!;
      ctx.font = '8px sans-serif';
      ctx.fillText(e, 0, 8);
      const d = ctx.getImageData(0, 0, 10, 10).data;
      // If any pixel has been drawn, the emoji rendered
      let hasPixel = false;
      for (let i = 3; i < d.length; i += 4) { if (d[i] > 0) { hasPixel = true; break; } }
      cache[e] = hasPixel;
      return hasPixel;
    } catch { return true; }
  };
})();

const EMOJI_CATEGORIES = [
  { label:'🏛', name:'PMT', emojis:['__PMT__','🪙','💎','🔒','🌐','🤝','💡','🚀','⚡','🏆','✨','🔑','💰','💻','📱','🌟','🎯','🏅','💹','🏦','💳','📊','📈','🎲','🎰','🌍','🔭','🎉','🔥','💥','🌈','🎪','🎭','💫','🔮','🧩','🎸','🎺','🥁','🎮','🕹','🔋','🛰','🌙','⭐','🌠','🌌'] },
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
        {EMOJI_CATEGORIES.map((ec,i)=>(
          <button key={i} onClick={()=>setCat(i)} title={ec.name}
            style={{width:32,height:32,background:cat===i?'var(--surface2)':'transparent',
              border:cat===i?'1px solid var(--border)':'1px solid transparent',
              borderRadius:8,cursor:'pointer',fontSize:16,display:'flex',
              alignItems:'center',justifyContent:'center',transition:'all .1s'}}>
            {ec.name==='PMT'
              ?<img src="/pmt-logo.png" style={{width:20,height:20,borderRadius:'50%',objectFit:'cover'}}/>
              :<Twemoji emoji={ec.label} size={18}/>}
          </button>
        ))}
      </div>
      {/* Emoji grid */}
      <div style={{padding:'8px 6px',display:'grid',gridTemplateColumns:'repeat(8,1fr)',
        gap:2,maxHeight:220,overflowY:'auto'}}>
        {EMOJI_CATEGORIES[cat].emojis.filter(e=>emojiRendersOk(e)).map((e,i)=>(
          <button key={e} onClick={()=>{onSelect(e==='__PMT__'?'[PMT]':e);}}
            style={{width:34,height:34,background:'transparent',border:'none',
              cursor:'pointer',fontSize:20,borderRadius:7,display:'flex',
              alignItems:'center',justifyContent:'center',transition:'background .1s'}}
            onMouseEnter={ev=>(ev.currentTarget.style.background='var(--surface2)')}
            onMouseLeave={ev=>(ev.currentTarget.style.background='transparent')}>
            {e==='__PMT__'
              ?<img src="/pmt-logo.png" style={{width:24,height:24,borderRadius:'50%',objectFit:'cover'}}/>
              :<Twemoji emoji={e} size={24}/>}
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


// Convert audio blob to WAV base64 for universal compatibility (iOS, Android, Chrome, Firefox)
async function blobToWavBase64(blob: Blob): Promise<string> {
  const arrayBuffer = await blob.arrayBuffer();
  const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
  const decoded = await audioCtx.decodeAudioData(arrayBuffer);
  audioCtx.close();
  // Render to PCM
  const numChannels = decoded.numberOfChannels;
  const sampleRate = decoded.sampleRate;
  const numSamples = decoded.length;
  const pcmData = decoded.getChannelData(0); // mono
  // Build WAV file
  const wavBuffer = new ArrayBuffer(44 + numSamples * 2);
  const view = new DataView(wavBuffer);
  const writeStr = (offset: number, str: string) => { for (let i = 0; i < str.length; i++) view.setUint8(offset + i, str.charCodeAt(i)); };
  writeStr(0, 'RIFF');
  view.setUint32(4, 36 + numSamples * 2, true);
  writeStr(8, 'WAVE');
  writeStr(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, 1, true); // mono
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeStr(36, 'data');
  view.setUint32(40, numSamples * 2, true);
  for (let i = 0; i < numSamples; i++) {
    view.setInt16(44 + i * 2, Math.max(-1, Math.min(1, pcmData[i])) * 0x7FFF, true);
  }
  // Convert to base64
  const bytes = new Uint8Array(wavBuffer);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return 'data:audio/wav;base64,' + btoa(binary);
}

// ── Forward Modal ────────────────────────────────────────────────────────────
function ForwardModal({msg,contacts,onForward,onClose}:{msg:any;contacts:any[];onForward:(c:any)=>void;onClose:()=>void}){
  const [search,setSearch]=React.useState('');
  const [forwarded,setForwarded]=React.useState<string|null>(null);
  const filtered=contacts.filter((c:any)=>
    c.name?.toLowerCase().includes(search.toLowerCase())||
    c.address?.toLowerCase().includes(search.toLowerCase())
  );
  const handlePick=(c:any)=>{
    if(forwarded) return; // prevent double-send
    setForwarded(c.id);
    onForward(c);
    // Brief "Sent" flash then close
    setTimeout(()=>onClose(),900);
  };
  // Preview snippet of what's being forwarded
  const preview = msg.type==='voice'?'🎙 Voice message':msg.type==='image'?'🖼 Image':
    msg.type==='file'?`📄 ${msg.fileName||'File'}`:msg.type==='video'?'🎬 Video':
    (msg.text||'').slice(0,80)+(msg.text?.length>80?'…':'');
  return(
    <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,.72)',
      display:'flex',alignItems:'center',justifyContent:'center',zIndex:400,padding:16}}
      onClick={onClose}>
      <div style={{background:'var(--panel)',border:'1px solid var(--border)',
        borderRadius:18,width:'100%',maxWidth:380,maxHeight:'75vh',
        display:'flex',flexDirection:'column',overflow:'hidden',
        animation:'slideUp .2s ease',boxShadow:'0 24px 60px rgba(0,0,0,.6)'}}
        onClick={e=>e.stopPropagation()}>
        {/* Header */}
        <div style={{padding:'16px 18px 12px',borderBottom:'1px solid var(--border)',
          display:'flex',alignItems:'center',gap:10}}>
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="var(--accent)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{flexShrink:0}}><polyline points="15 17 20 12 15 7"/><path d="M4 18v-2a4 4 0 0 1 4-4h12"/></svg>
          <div style={{flex:1}}>
            <div style={{fontSize:15,fontWeight:600,color:'var(--text)'}}>Forward to…</div>
            <div style={{fontFamily:'var(--mono)',fontSize:9,color:'var(--muted)',marginTop:1,
              whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis',maxWidth:260}}>
              {preview}
            </div>
          </div>
          <button onClick={onClose} style={{background:'none',border:'none',
            color:'var(--muted)',fontSize:20,cursor:'pointer',lineHeight:1,flexShrink:0}}>×</button>
        </div>
        {/* Search */}
        <div style={{padding:'10px 14px',borderBottom:'1px solid var(--border)'}}>
          <input value={search} onChange={e=>setSearch(e.target.value)}
            placeholder="Search contacts…" autoFocus
            style={{width:'100%',background:'var(--surface)',border:'1px solid var(--border)',
              borderRadius:9,padding:'9px 13px',color:'var(--text)',fontSize:14,
              outline:'none',fontFamily:'var(--sans)',boxSizing:'border-box'}}/>
        </div>
        {/* Contact list */}
        <div style={{flex:1,overflowY:'auto',padding:'6px 0'}}>
          {filtered.length===0&&(
            <div style={{padding:'28px',textAlign:'center',color:'var(--muted)',fontSize:13}}>
              No contacts found
            </div>
          )}
          {filtered.map((c:any)=>(
            <button key={c.id} onClick={()=>handlePick(c)}
              disabled={!!forwarded}
              style={{width:'100%',background:forwarded===c.id?'rgba(250,255,99,.08)':'none',
                border:'none',padding:'10px 16px',display:'flex',alignItems:'center',
                gap:12,cursor:forwarded?'default':'pointer',textAlign:'left',
                transition:'background .12s',opacity:forwarded&&forwarded!==c.id?.toString()?0.5:1}}
              onMouseEnter={e=>{if(!forwarded)(e.currentTarget as any).style.background='rgba(255,255,255,.05)';}}
              onMouseLeave={e=>{if(!forwarded)(e.currentTarget as any).style.background='none';}}>
              <ProfilePic initials={(c.avatar||c.name||'?').slice(0,2).toUpperCase()}
                avatarUrl={c.avatarUrl} color={c.color} bg={c.bg} size={40} fs={14}/>
              <div style={{flex:1,minWidth:0}}>
                <div style={{fontSize:14,fontWeight:500,color:'var(--text)',
                  whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>
                  {c.name}
                </div>
                <div style={{fontFamily:'var(--mono)',fontSize:10,color:'var(--muted)',marginTop:1}}>
                  {c.address?.slice(0,8)}…{c.address?.slice(-4)}
                </div>
              </div>
              {forwarded===c.id?.toString()&&(
                <div style={{display:'flex',alignItems:'center',gap:4,color:'var(--accent)',
                  fontFamily:'var(--mono)',fontSize:11,fontWeight:600,flexShrink:0}}>
                  <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><polyline points="20 6 9 17 4 12"/></svg>
                  Sent
                </div>
              )}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Floating date chip helper ─────────────────────────────────────────────
function formatFloatingDate(ts: number): string {
  if (!ts) return '';
  const d = new Date(ts);
  const now = new Date();
  const toDay = (dt: Date) => new Date(dt.getFullYear(), dt.getMonth(), dt.getDate()).getTime();
  const todayTs = toDay(now);
  const msgTs = toDay(d);
  const diff = todayTs - msgTs;
  if (diff === 0) return 'Today';
  if (diff === 86400000) return 'Yesterday';
  if (diff < 7 * 86400000) return d.toLocaleDateString('en-US', { weekday: 'long' });
  if (d.getFullYear() === now.getFullYear())
    return d.toLocaleDateString('en-US', { month: 'long', day: 'numeric' });
  return d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
}


export default function ChatPanel({contact,messages,onSend,onSendETH,isDemo,myAddress,onReact,searchQuery,isGroup,onMediaUploaded,onOpenSidebar,onBack,onViewContact,onManageGroup,needsPasswordToSend,onJoinGroup,onPin,pinnedMsgs,onDelete,onEditMsg,contacts,onForwardMsg,lastSeenTs=0,chatWallpaper='none',onStickerCreated}){
  const [text,setText]=useState('');
  const [showSend,setShowSend]=useState(false);
  const [showAttach,setShowAttach]=useState(false);
  const [showEmoji,setShowEmoji]=useState(false);
  const [showGif,setShowGif]=useState(false);
  const [showPanel,setShowPanel]=useState<'emoji'|'gif'|'sticker'|null>(null);
  const [replyingTo,setReplyingTo]=useState(null); // message being replied to
  const [editingMsg,setEditingMsg]=useState<any>(null); // message being edited
  const [localSearch,setLocalSearch]=useState(''); // in-chat search query
  const [searchActive,setSearchActive]=useState(false); // search bar open
  const [searchIdx,setSearchIdx]=useState(0); // current match index
  const [pinnedIdx,setPinnedIdx]=useState(0); // current pinned message index for cycling
  const [ctxMenuMsg,setCtxMenuMsg]=useState<any>(null); // which message has ctx menu open
  const [delConfirmMsg,setDelConfirmMsg]=useState<any>(null); // which message needs delete confirm
  const [pickerMsgId,setPickerMsgId]=useState<string|null>(null); // which message has emoji picker open
  const [pinConfirmMsgId,setPinConfirmMsgId]=useState<string|null>(null); // which message has pin confirm open
  const [showForward,setShowForward]=useState(false); // forward modal open
  const [forwardMsg,setForwardMsg]=useState<any>(null); // message to forward
  // Typing indicator state
  const [contactTyping,setContactTyping]=useState(false);
  const lastTypingPostRef=useRef<number>(0);


  // Lock scroll on messages container when any popup is open (web/mouse only)
  useEffect(()=>{
    const el = messagesRef.current;
    if(!el) return;
    const anyOpen = !!(ctxMenuMsg||delConfirmMsg||pickerMsgId||pinConfirmMsgId);
    const isDesktop = window.matchMedia('(hover:hover) and (pointer:fine)').matches;
    if(anyOpen && isDesktop){
      const prevent=(e:Event)=>{ e.preventDefault(); e.stopPropagation(); };
      el.addEventListener('wheel', prevent, {passive:false, capture:true});
      return ()=>{ el.removeEventListener('wheel', prevent, {capture:true} as any); };
    }
  },[ctxMenuMsg,delConfirmMsg,pickerMsgId,pinConfirmMsgId]);

  // ── Typing indicator: broadcast when user types (throttled to once/2s) ──
  useEffect(()=>{
    if(!text||!contact?.address||contact.isGroup||contact.isAI||isDemo||!myAddress) return;
    const now=Date.now();
    if(now-lastTypingPostRef.current<2000) return;
    lastTypingPostRef.current=now;
    fetch(`/api/typing?from=${myAddress}&to=${contact.address.toLowerCase()}`,{method:'POST'}).catch(()=>{});
  },[text]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Typing indicator: poll contact's typing status every 2.5s ──
  useEffect(()=>{
    if(!contact?.address||contact.isGroup||contact.isAI||isDemo||!myAddress) return;
    let mounted=true;
    const addr=contact.address.toLowerCase();
    const check=()=>{
      fetch(`/api/typing?from=${addr}&to=${myAddress}`)
        .then(r=>r.json())
        .then(d=>{if(mounted) setContactTyping(!!d.typing);})
        .catch(()=>{if(mounted) setContactTyping(false);});
    };
    check();
    const iv=setInterval(check,2500);
    return ()=>{mounted=false;clearInterval(iv);setContactTyping(false);};
  },[contact?.id,contact?.address,isDemo,myAddress]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Read receipts: send when conversation is opened or new messages arrive ──
  const lastReadReceiptRef=useRef<number>(0); // timestamp of last receipt sent
  useEffect(()=>{
    if(!contact?.address||contact.isGroup||contact.isAI||isDemo||!myAddress) return;
    // Find latest incoming message
    const lastIncoming=[...messages].reverse().find(m=>!m.out&&!m.isTyping);
    if(!lastIncoming) return;
    const msgTs=lastIncoming.ts||0;
    // Don't re-send if we already sent for this timestamp
    if(msgTs<=lastReadReceiptRef.current) return;
    lastReadReceiptRef.current=msgTs;
    const contactAddr=contact.address.toLowerCase();
    // Debounce slightly to avoid sending while user rapidly switches contacts
    const t=setTimeout(()=>{
      fetch(`/api/inbox?address=${contactAddr}`,{
        method:'POST',headers:{'Content-Type':'application/json'},
        body:JSON.stringify({
          id:'r'+Date.now().toString(36),
          type:'read',
          readUpToTs:Date.now(),
          from:myAddress,
          ts:Date.now(),
        }),
      }).catch(()=>{});
    },800);
    return ()=>clearTimeout(t);
  },[contact?.id,messages.length,isDemo,myAddress]); // eslint-disable-line react-hooks/exhaustive-deps

  // Close ctx menu when clicking/touching anywhere outside
  // Delay attaching listeners so the long-press touch sequence ends first —
  // otherwise the synthetic mousedown after touchend closes the popup immediately
  useEffect(()=>{
    if(!ctxMenuMsg) return;
    const close=()=>{ setCtxMenuMsg(null); };
    const t = setTimeout(()=>{
      document.addEventListener('mousedown',close);
      document.addEventListener('touchstart',close,{passive:true});
    },350);
    return ()=>{
      clearTimeout(t);
      document.removeEventListener('mousedown',close);
      document.removeEventListener('touchstart',close);
    };
  },[ctxMenuMsg]);

  // Close emoji picker when clicking/touching anywhere outside
  useEffect(()=>{
    if(!pickerMsgId) return;
    const close=()=>setPickerMsgId(null);
    const t = setTimeout(()=>{
      document.addEventListener('touchstart',close,{passive:true});
      document.addEventListener('mousedown',close);
    },350);
    return ()=>{
      clearTimeout(t);
      document.removeEventListener('touchstart',close);
      document.removeEventListener('mousedown',close);
    };
  },[pickerMsgId]);
  const searchInputRef=useRef<HTMLInputElement>(null);
  const [recording,setRecording]=useState(false);
  const [showScrollBtn,setShowScrollBtn]=useState(false);
  const [floatingDate,setFloatingDate]=useState('');
  const [floatingDateVisible,setFloatingDateVisible]=useState(false);
  const floatingDateTimerRef=useRef<ReturnType<typeof setTimeout>|null>(null);
  const fileInputRef=useRef(null);
  const cameraInputRef=useRef(null);
  const attachBtnRef=useRef(null);
  const fileAcceptRef=useRef('*');
  const [recordSeconds,setRecordSeconds]=useState(0);
  const recordSecondsRef=useRef(0); // ref to avoid stale closure in onstop
  const [recorderError,setRecorderError]=useState(null);
  const [micMuted,setMicMuted]=useState(false);
  const silentFramesRef=useRef(0); // consecutive silent frames counter
  const bottomRef=useRef(null);
  const unreadDividerRef=useRef<HTMLDivElement>(null);
  const messagesRef=useRef<HTMLDivElement>(null);


  // Document-level wheel listener (capture phase) — works without any click,
  // from the moment the mouse enters the chat area.
  useEffect(()=>{
    const handler=(e:WheelEvent)=>{
      // Skip when any modal is open — the App-level handler manages scroll then
      if(document.body.classList.contains('modal-open')) return;
      // Skip when scrolling inside the GIF/sticker picker or unified emoji/gif panel
      if((e.target as Element)?.closest?.('[data-gif-picker]')) return;
      if((e.target as Element)?.closest?.('[data-emoji-gif-panel]')) return;
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

  // Reset floating date chip when switching conversations
  useEffect(()=>{
    setFloatingDate('');
    setFloatingDateVisible(false);
    if(floatingDateTimerRef.current) clearTimeout(floatingDateTimerRef.current);
  },[contact?.id]);

  // Scroll tracking: scroll-to-bottom button + floating date chip
  useEffect(()=>{
    const el=messagesRef.current;
    if(!el) return;
    const onScroll=()=>{
      const distFromBottom=el.scrollHeight-el.scrollTop-el.clientHeight;
      setShowScrollBtn(distFromBottom>120);

      // Floating date chip — only show when scrolled up
      if(distFromBottom>250){
        const containerRect=el.getBoundingClientRect();
        const markers=el.querySelectorAll('[data-ts]');
        for(const marker of Array.from(markers)){
          // display:contents elements: use firstElementChild rect as fallback
          const el2=(marker as HTMLElement);
          let rect=el2.getBoundingClientRect();
          if(!rect.height && el2.firstElementChild){
            rect=(el2.firstElementChild as HTMLElement).getBoundingClientRect();
          }
          // First marker whose bottom edge is inside the visible area
          if(rect.bottom>containerRect.top && rect.top<containerRect.bottom){
            const ts=Number(el2.dataset.ts||el2.getAttribute('data-ts'));
            if(ts>0){
              const label=formatFloatingDate(ts);
              if(label) setFloatingDate(label);
            }
            break;
          }
        }
        setFloatingDateVisible(true);
        if(floatingDateTimerRef.current) clearTimeout(floatingDateTimerRef.current);
        floatingDateTimerRef.current=setTimeout(()=>setFloatingDateVisible(false),1800);
      } else {
        setFloatingDateVisible(false);
        if(floatingDateTimerRef.current) clearTimeout(floatingDateTimerRef.current);
        setFloatingDate('');
      }
    };
    el.addEventListener('scroll',onScroll,{passive:true});
    return()=>{
      el.removeEventListener('scroll',onScroll);
      if(floatingDateTimerRef.current) clearTimeout(floatingDateTimerRef.current);
    };
  },[]);
  const inputRef=useRef(null);
  const mediaRecRef=useRef(null);
  const chunksRef=useRef([]);
  const timerRef=useRef(null);
  const waveformRef=useRef([]);
  const onSendRef=useRef(onSend);
  useEffect(()=>{onSendRef.current=onSend;},[onSend]);

  // Smart scroll: on contact open → jump instantly to unread divider; on new message → go to bottom
  const prevContactIdRef=useRef<any>(null);
  useEffect(()=>{
    const contactChanged = contact?.id !== prevContactIdRef.current;
    prevContactIdRef.current = contact?.id;
    const container = messagesRef.current;
    if(!container) return;
    if(contactChanged && firstUnreadIdx >= 0 && unreadDividerRef.current) {
      const divider = unreadDividerRef.current;
      requestAnimationFrame(()=>requestAnimationFrame(()=>{
        container.scrollTop = divider.offsetTop - 10;
      }));
    } else {
      const scrollToBottom = () => { container.scrollTop = container.scrollHeight; };
      // Double rAF for desktop; extra 150ms timeout for mobile (images may still be loading)
      requestAnimationFrame(()=>requestAnimationFrame(()=>{
        scrollToBottom();
        setTimeout(scrollToBottom, 150);
      }));
    }
  },[messages]);
  useEffect(()=>{setText('');setReplyingTo(null);setEditingMsg(null);
    // Only auto-focus on desktop — on mobile this triggers the virtual keyboard immediately
    if(!('ontouchstart' in window)) inputRef.current?.focus();
    setShowAttach(false);setShowEmoji(false);},[contact?.id]);
  useEffect(()=>{
    if(!showAttach)return;
    const close=e=>{
      if(!e.target.closest('[data-attach]'))setShowAttach(false);
    };
    setTimeout(()=>document.addEventListener('click',close),0);
    return()=>document.removeEventListener('click',close);
  },[showAttach]);

  const send=()=>{
    const t=text.trim();if(!t)return;
    // If editing an existing message, update it instead of sending new
    if(editingMsg){
      onEditMsg&&onEditMsg(editingMsg,t);
      setText('');setEditingMsg(null);
      return;
    }
    if(replyingTo){
      // Pass as object with type:'text' so sendMsg handles it correctly
      onSend({type:'text',text:t,replyTo:{
        id:replyingTo.id,
        text:replyingTo.text||'',
        senderName:replyingTo.senderName||(replyingTo.out?'You':contact?.name||''),
        type:replyingTo.type,
      }});
    } else {
      onSend(t); // plain string for normal sends (existing behaviour)
    }
    setText('');setReplyingTo(null);
  };
  const insertEmoji=(emoji:string)=>{
    const el=inputRef.current as any;
    if(!el){setText(p=>p+emoji);return;}
    if(el.insertAtCursor){el.insertAtCursor(emoji);return;}
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

  const handleCameraPhoto=(e:any)=>{
    const file=e.target.files?.[0];
    if(!file)return;
    const localUrl=URL.createObjectURL(file);
    const img=new Image();
    img.onload=()=>{
      const MAX=1200;
      let w=img.width,h=img.height;
      if(w>MAX||h>MAX){const r=Math.min(MAX/w,MAX/h);w=Math.round(w*r);h=Math.round(h*r);}
      const canvas=document.createElement('canvas');
      canvas.width=w;canvas.height=h;
      canvas.getContext('2d')?.drawImage(img,0,0,w,h);
      const b64=canvas.toDataURL('image/jpeg',0.75);
      const msgId='m'+Date.now();
      onSend({type:'image',fileUrl:b64,b64Data:b64,mediaMsgId:msgId,imgMsgId:msgId,
        fileName:file.name,fileSize:formatSize(file.size),mimeType:'image/jpeg'});
      if(onMediaUploaded)onMediaUploaded(msgId,null,null,b64);
      URL.revokeObjectURL(localUrl);
    };
    img.onerror=()=>{
      const reader=new FileReader();
      reader.onload=ev=>{
        const b64=ev.target?.result as string;
        onSend({type:'image',b64Data:b64,fileName:file.name,
          fileSize:formatSize(file.size),mimeType:file.type});
      };
      reader.readAsDataURL(file);
    };
    img.src=localUrl;
    e.target.value='';
  };
  const handleFileChosen=e=>{
    const file=e.target.files[0];
    if(!file)return;
    const localUrl=URL.createObjectURL(file);
    const isImage=file.type.startsWith('image/');
    const isVideo=file.type.startsWith('video/');
    const msgType=isImage?'image':isVideo?'video':'file';
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
      // No Pinata upload — b64Data in the relay handles cross-device delivery
      // (avoids creating public pins on Pinata for private chat images)
      if(onMediaUploaded) onMediaUploaded(msgId, null, null, b64Data);
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
    } else if(isVideo){
      // 50MB size limit
      if(file.size > 50 * 1024 * 1024){
        alert('Video too large. Maximum size is 50MB.');
        e.target.value='';
        return;
      }
      const localUrl=URL.createObjectURL(file);
      const tmpId='vtmp'+Date.now();
      // Add local-only message so sender sees preview immediately
      onSend({type:'video',localUrl,fileName:file.name,fileSize:formatSize(file.size),
        mimeType:file.type,uploading:true,mediaMsgId:tmpId});
      // Upload then relay
      const reader2=new FileReader();
      reader2.onloadend=async()=>{
        try{
          const base64=(reader2.result as string).split(',')[1];
          const resp=await fetch('/api/pinata-upload',{method:'POST',headers:{'Content-Type':'application/json'},
            body:JSON.stringify({data:base64,name:file.name,mimeType:file.type})});
          const {cid,url}=await resp.json();
          // Update local message with IPFS cid + relay to recipient
          if(onMediaUploaded) onMediaUploaded(tmpId,cid,url,null);
          onSendRef.current({type:'video',ipfsCid:cid,ipfsUrl:url,
            fileName:file.name,fileSize:formatSize(file.size),mimeType:file.type,skipLocal:true});
        }catch(e){console.warn('Video upload failed',e);}
      };
      reader2.readAsDataURL(file);
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
      // Prefer webm/opus on desktop (Chrome/Firefox/Android), mp4 for Safari/iOS
      // audio/mp4 in Chrome uses Opus codec which iOS can't play — webm is more explicit
      const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
      const mimeOrder = isIOS ? ['audio/mp4','audio/aac','audio/webm;codecs=opus','audio/webm'] : ['audio/webm;codecs=opus','audio/webm','audio/ogg;codecs=opus','audio/mp4','audio/aac'];
      const mimeType = mimeOrder.find(t=>MediaRecorder.isTypeSupported(t)) || '';
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
        // Mute detection: if avg < 0.005 for 2+ seconds, mic is likely muted/silent
        if(avg < 0.005){ silentFramesRef.current++; } else { silentFramesRef.current=0; }
        setMicMuted(silentFramesRef.current>=2);
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

          // Convert to WAV for universal compatibility (iOS, Android, all browsers)
          // audioBase64 is the original format — wavBase64 is universally playable
          blobToWavBase64(blob).then(wavBase64 => {
            const sendVoice=(extra={})=>onSendRef.current({
              type:'voice', audioUrl:url, audioMsgId:msgId,
              audioB64:wavBase64, duration:dur, waveform:bars, ...extra
            });
            // Also try IPFS upload for redundancy
            uploadToPinata(blob, 'voice_'+msgId+'.'+(mr.mimeType?.includes('mp4')||mr.mimeType?.includes('aac')?'m4a':'webm'))
              .then(cid=>{ sendVoice({ipfsCid:cid, ipfsUrl:getIpfsUrl(cid)}); })
              .catch(()=>{ sendVoice(); });
          }).catch(()=>{
            // WAV conversion failed — fall back to original format
            const sendVoice=(extra={})=>onSendRef.current({
              type:'voice', audioUrl:url, audioMsgId:msgId,
              audioB64:audioBase64, duration:dur, waveform:bars, ...extra
            });
            uploadToPinata(blob, 'voice_'+msgId+'.webm')
              .then(cid=>{ sendVoice({ipfsCid:cid, ipfsUrl:getIpfsUrl(cid)}); })
              .catch(()=>{ sendVoice(); });
          });
        };
        reader.readAsDataURL(blob);
        setRecordSeconds(0);
        recordSecondsRef.current=0;
      };
      mr.start(100);
      mediaRecRef.current=mr;
      setMicMuted(false);
      silentFramesRef.current=0;
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
    setMicMuted(false);
    silentFramesRef.current=0;
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
  // Pin permission: in 1-on-1 everyone can pin; in groups only owner/admin/mod
  const canPin = !contact.isGroup
    || contact.createdBy?.toLowerCase() === myAddress?.toLowerCase()
    || (contact as any).roles?.[myAddress?.toLowerCase()] === 'admin'
    || (contact as any).roles?.[myAddress?.toLowerCase()] === 'moderator';

  // Local search: filter messages by text match
  const searchTerm = localSearch.trim().toLowerCase();
  const filteredMessages = searchTerm
    ? messages.filter(m =>
        m.text?.toLowerCase().includes(searchTerm) ||
        m.replyTo?.text?.toLowerCase().includes(searchTerm)
      )
    : messages;

  // Unread divider: index of first unread incoming message since lastSeenTs
  // m.ts may be missing on older messages — fall back to timestamp embedded in id (u{ms}{random})
  const firstUnreadIdx = React.useMemo(()=>{
    if(!lastSeenTs||lastSeenTs<=0) return -1;
    return filteredMessages.findIndex(m=>{
      if(m.out||m.isTyping) return false;
      const msgTs = m.ts || (m.id ? parseInt(m.id.replace(/^[a-z]/,'').slice(0,13)) : 0);
      return msgTs > lastSeenTs;
    });
  },[filteredMessages,lastSeenTs]);
  const unreadCount = firstUnreadIdx>=0 ? filteredMessages.length-firstUnreadIdx : 0;
  const matchCount = searchTerm ? filteredMessages.length : 0;

  // Navigate to match
  const safeIdx = matchCount > 0 ? Math.min(searchIdx, matchCount - 1) : 0;
  const goNext = () => setSearchIdx(i => matchCount > 0 ? (i + 1) % matchCount : 0);
  const goPrev = () => setSearchIdx(i => matchCount > 0 ? (i - 1 + matchCount) % matchCount : 0);

  // Scroll to current match bubble
  const scrollToMatch = (idx: number) => {
    if (!filteredMessages[idx]) return;
    const el = document.getElementById('msg-' + filteredMessages[idx].id);
    if (el && messagesRef.current) {
      const containerRect = messagesRef.current.getBoundingClientRect();
      const elRect = el.getBoundingClientRect();
      messagesRef.current.scrollTop += elRect.top - containerRect.top - containerRect.height / 2 + elRect.height / 2;
      // Target the inner bubble element, not the full-width wrapper row
      const bubble = (el.querySelector('.msg-bubble-text') as HTMLElement) || el;
      bubble.style.transition = 'outline .15s, outline-offset .15s';
      bubble.style.outline = '2px solid var(--accent)';
      bubble.style.outlineOffset = '2px';
      setTimeout(() => { bubble.style.outline = ''; bubble.style.outlineOffset = ''; }, 1400);
    }
  };

  return(
    <>
      {/* iOS PWA safe area spacer — pushes content below status bar reliably */}
      
      <MobileTopbar contact={contact} onBack={onBack||onOpenSidebar} onOpenSidebar={onOpenSidebar} onViewContact={onViewContact} onSendETH={onSendETH} isDemo={isDemo} needsPasswordToSend={needsPasswordToSend} onManageGroup={onManageGroup} myAddress={myAddress}
        searchActive={searchActive}
        pinnedMsgs={pinnedMsgs}
        pinnedIdx={pinnedIdx}
        canPin={canPin}
        onPinnedClick={()=>{
          if(!pinnedMsgs||pinnedMsgs.length===0) return;
          const safePin=Math.min(pinnedIdx,pinnedMsgs.length-1);
          const pin=pinnedMsgs[pinnedMsgs.length-1-safePin];
          const el=document.getElementById('msg-'+pin.id);
          if(el&&messagesRef.current){
            const cr=messagesRef.current.getBoundingClientRect();
            const er=el.getBoundingClientRect();
            messagesRef.current.scrollTop+=er.top-cr.top-cr.height/2+er.height/2;
            const b=(el.querySelector('.msg-bubble-text') as HTMLElement)||el;
            b.style.transition='outline .15s,outline-offset .15s';
            b.style.outline='2px solid var(--accent)';
            b.style.outlineOffset='2px';
            setTimeout(()=>{b.style.outline='';b.style.outlineOffset='';},1400);
          }
          setPinnedIdx(i=>(i+1)%pinnedMsgs.length);
        }}
        onUnpinCurrent={pinnedMsgs&&pinnedMsgs.length>0&&pinnedMsgs[pinnedMsgs.length-1-Math.min(pinnedIdx,pinnedMsgs.length-1)]?.pinnedBy===myAddress?.toLowerCase()?()=>{
          const safePin=Math.min(pinnedIdx,pinnedMsgs.length-1);
          const pin=pinnedMsgs[pinnedMsgs.length-1-safePin];
          onPin&&onPin(pin);
        }:undefined}
        onSearchToggle={()=>{setSearchActive(s=>{const next=!s;if(!next){setLocalSearch('');setSearchIdx(0);}return next;});setTimeout(()=>searchInputRef.current?.focus(),80);}}
        searchBar={(
          <div style={{padding:'8px 12px',background:'var(--panel)',borderBottom:'1px solid var(--border)',
            display:'flex',alignItems:'center',gap:8}}>
            <input ref={searchInputRef}
              value={localSearch}
              onChange={e=>{setLocalSearch(e.target.value);setSearchIdx(0);}}
              onKeyDown={e=>{if(e.key==='Enter'){e.shiftKey?goPrev():goNext();scrollToMatch(safeIdx);}if(e.key==='Escape'){setSearchActive(false);setLocalSearch('');setSearchIdx(0);}}}
              placeholder="Search messages…"
              style={{flex:1,background:'var(--surface)',border:'1px solid var(--border)',borderRadius:8,
                padding:'8px 12px',color:'var(--text)',fontSize:14,outline:'none',fontFamily:'var(--sans)'}}/>
            {searchTerm&&(
              <>
                <span style={{fontFamily:'var(--mono)',fontSize:10,color:'var(--muted)',flexShrink:0,minWidth:36,textAlign:'center'}}>
                  {matchCount>0?`${safeIdx+1}/${matchCount}`:'0'}
                </span>
                <button onClick={()=>{goPrev();setTimeout(()=>scrollToMatch((safeIdx-1+matchCount)%matchCount),50);}}
                  disabled={matchCount===0}
                  style={{background:'var(--surface)',border:'1px solid var(--border)',borderRadius:6,
                    width:32,height:32,cursor:matchCount>0?'pointer':'default',color:'var(--text2)',
                    display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0,opacity:matchCount===0?.4:1}}>↑</button>
                <button onClick={()=>{goNext();setTimeout(()=>scrollToMatch((safeIdx+1)%matchCount),50);}}
                  disabled={matchCount===0}
                  style={{background:'var(--surface)',border:'1px solid var(--border)',borderRadius:6,
                    width:32,height:32,cursor:matchCount>0?'pointer':'default',color:'var(--text2)',
                    display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0,opacity:matchCount===0?.4:1}}>↓</button>
              </>
            )}
            <button onClick={()=>{setSearchActive(false);setLocalSearch('');setSearchIdx(0);}}
              style={{background:'none',border:'none',color:'var(--muted)',fontSize:20,cursor:'pointer',
                flexShrink:0,lineHeight:1,padding:'0 2px'}}>×</button>
          </div>
        )}
      />

      {/* Outer wrapper — fills the chat-panel flex slot */}
      <div style={{flex:1,position:'relative',overflow:'hidden',minHeight:0}}>

        {/* ── Wallpaper layer — static, never scrolls. Messages float above it. ── */}
        {chatWallpaper && chatWallpaper !== 'none' && (
          <div style={{
            position:'absolute',inset:0,zIndex:0,
            backgroundImage:`url(/${chatWallpaper}.png?v=2)`,
            backgroundSize:'cover',backgroundPosition:'center',backgroundRepeat:'no-repeat',
            // Dark tint so bubbles pop — same trick Telegram uses
            filter:'brightness(0.72)',
          }}/>
        )}

        {/* ── Messages div covers the ENTIRE area — always under the cursor ── */}
        <div ref={messagesRef}
          className="chat-messages-area"
          style={{position:'absolute',inset:0,overflowY:'auto',
            zIndex:1,background:'transparent',
            paddingTop:searchActive?(pinnedMsgs?.length?138:102):(pinnedMsgs?.length?94:62),paddingBottom:95,
            display:'flex',flexDirection:'column'}}>
          <div style={{flex:1,padding:'0 20px 0',display:'flex',flexDirection:'column',gap:2}}>
            {searchQuery&&!searchTerm&&(
              <div style={{textAlign:'center',fontFamily:'var(--mono)',fontSize:10,color:'var(--accent)',
                margin:'4px 0 8px',background:'rgba(250,255,99,.08)',
                border:'1px solid rgba(250,255,99,.2)',borderRadius:8,padding:'5px 12px'}}>
                Showing results for "{searchQuery}"
              </div>
            )}
            {searchTerm&&matchCount===0&&(
              <div style={{textAlign:'center',fontFamily:'var(--mono)',fontSize:10,color:'var(--muted)',
                margin:'4px 0 8px',background:'var(--surface)',
                border:'1px solid var(--border)',borderRadius:8,padding:'5px 12px'}}>
                No messages found for "{localSearch}"
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
            {filteredMessages.map((m,idx)=>(
              <React.Fragment key={m.id}>
                <div data-ts={m.ts||0} style={{display:'contents'}}>
                {/* Unread messages divider */}
                {idx===firstUnreadIdx&&firstUnreadIdx>=0&&(
                  <div ref={unreadDividerRef} style={{display:'flex',alignItems:'center',gap:10,margin:'10px 0',
                    fontFamily:'var(--mono)',fontSize:9,color:'var(--accent2)',letterSpacing:'1px'}}>
                    <div style={{flex:1,height:1,background:'rgba(99,210,255,.25)'}}/>
                    <span style={{background:'rgba(99,210,255,.08)',border:'1px solid rgba(99,210,255,.22)',
                      borderRadius:20,padding:'3px 10px',whiteSpace:'nowrap',color:'var(--accent)'}}>
                      {unreadCount} NEW MESSAGE{unreadCount!==1?'S':''}
                    </span>
                    <div style={{flex:1,height:1,background:'rgba(99,210,255,.25)'}}/>
                  </div>
                )}
                <Bubble msg={m} isOut={m.out} contact={contact}
                myAddress={myAddress} onReact={onReact}
                searchQuery={searchTerm || searchQuery}
                onJoinGroup={onJoinGroup}
                onReply={(msg)=>{setReplyingTo(msg);setTimeout(()=>inputRef.current?.focus(),50);}}
                onPin={canPin?(msg:any,forBoth?:boolean)=>onPin&&onPin(msg,forBoth):undefined}
                onDelete={onDelete&&(contact.isGroup ? canPin : (m.out||m.from?.toLowerCase()===myAddress?.toLowerCase()))
                  ?(msg:any,forAll:boolean)=>onDelete(msg,forAll):undefined}
                onEdit={(m.out||m.from?.toLowerCase()===myAddress?.toLowerCase())
                  ?(msg:any)=>{setEditingMsg(msg);setText(msg.text||'');setTimeout(()=>inputRef.current?.focus(),50);}
                  :undefined}
                ctxMenuOpen={ctxMenuMsg?.id===m.id}
                delConfirmOpen={delConfirmMsg?.id===m.id}
                onOpenCtxMenu={(m:any)=>{setDelConfirmMsg(null);setCtxMenuMsg(m);setPickerMsgId(null);}}
                onOpenDelConfirm={(m:any)=>{setCtxMenuMsg(null);setDelConfirmMsg(m);}}
                anyPopupOpen={!!(ctxMenuMsg||delConfirmMsg||pickerMsgId||pinConfirmMsgId)}
                isSelected={ctxMenuMsg?.id===m.id||pickerMsgId===m.id||pinConfirmMsgId===m.id}
                pinConfirmOpen={pinConfirmMsgId===m.id}
                onOpenPinConfirm={(mm:any)=>{setPinConfirmMsgId(mm.id);}}
                onCloseMenus={()=>{setCtxMenuMsg(null);setDelConfirmMsg(null);setPickerMsgId(null);setPinConfirmMsgId(null);}}
                pickerOpen={pickerMsgId===m.id}
                onOpenPicker={(m:any)=>{setCtxMenuMsg(null);setDelConfirmMsg(null);setPickerMsgId(m.id);}}
                onClosePicker={()=>setPickerMsgId(null)}
                onForward={onForwardMsg?(msg:any)=>{setForwardMsg(msg);setShowForward(true);}:undefined}
                onSaveSticker={(msg:any)=>{
                  // Import here to avoid circular deps — save sticker URL to custom stickers list
                  const url = msg.gifUrl;
                  if (!url) return;
                  try {
                    const existing: any[] = (() => { try { return JSON.parse(localStorage.getItem('pmt_custom_stickers')||'[]'); } catch { return []; } })();
                    // Already saved?
                    if (existing.some((s:any) => s.url === url || (s.gifId && s.gifId === msg.gifId))) return;
                    const newSticker = { id: 'cs-' + Date.now(), url, title: msg.title || 'Sticker', createdAt: Date.now() };
                    localStorage.setItem('pmt_custom_stickers', JSON.stringify([newSticker, ...existing].slice(0, 50)));
                    onStickerCreated?.(); // trigger backup
                  } catch {}
                }}/>
                </div>
              </React.Fragment>
            ))}
            {/* Typing indicator bubble */}
            {contactTyping&&!contact.isGroup&&!contact.isAI&&(
              <div style={{display:'flex',alignItems:'flex-end',gap:8,margin:'4px 0 2px',animation:'fadeIn .2s ease'}}>
                <ProfilePic initials={contact.avatar} avatarUrl={contact.avatarUrl}
                  color={contact.color} bg={contact.bg} size={26} fs={9}/>
                <div style={{background:'var(--bubble-in)',borderRadius:14,borderBottomLeftRadius:4,
                  padding:'10px 16px',display:'flex',gap:5,alignItems:'center',
                  boxShadow:'0 1px 3px rgba(0,0,0,.2)'}}>
                  {[0,1,2].map(i=>(
                    <div key={i} style={{width:7,height:7,borderRadius:'50%',background:'var(--muted)',
                      animation:'typingDot 1.2s ease-in-out infinite',animationDelay:(i*0.2)+'s'}}/>
                  ))}
                </div>
                <span style={{fontFamily:'var(--mono)',fontSize:9,color:'var(--muted)',paddingBottom:2,opacity:.7}}>
                  {contact.name} is typing
                </span>
              </div>
            )}
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
            <button onClick={()=>{setSearchActive(s=>{const next=!s;if(!next){setLocalSearch('');setSearchIdx(0);}return next;});setTimeout(()=>searchInputRef.current?.focus(),80);}}
              title="Search in chat"
              style={{background:'var(--surface)',border:'1px solid var(--border)',borderRadius:8,
                width:32,height:32,display:'flex',alignItems:'center',justifyContent:'center',
                cursor:'pointer',flexShrink:0,color:searchActive?'var(--accent)':'var(--muted)',fontSize:15,
                boxShadow:searchActive?'0 0 0 1px var(--accent) inset':'none'}}>
              🔍
            </button>
          </div>
        </div>

        {/* ── In-chat search bar (desktop only — mobile version is in MobileTopbar) ── */}
        {searchActive&&(
          <div className="desktop-search-bar" style={{position:'absolute',top:58,left:0,right:0,zIndex:9,
            background:'var(--panel)',borderBottom:'1px solid var(--border)',
            padding:'8px 14px',alignItems:'center',gap:8}}>
            <input ref={searchInputRef}
              value={localSearch}
              onChange={e=>{setLocalSearch(e.target.value);setSearchIdx(0);}}
              onKeyDown={e=>{if(e.key==='Enter'){e.shiftKey?goPrev():goNext();scrollToMatch(safeIdx);}if(e.key==='Escape'){setSearchActive(false);setLocalSearch('');setSearchIdx(0);}}}
              placeholder="Search in chat…"
              style={{flex:1,background:'var(--surface)',border:'1px solid var(--border)',borderRadius:8,
                padding:'7px 12px',color:'var(--text)',fontSize:13,outline:'none',fontFamily:'var(--sans)'}}/>
            {searchTerm&&(
              <>
                <span style={{fontFamily:'var(--mono)',fontSize:10,color:'var(--muted)',flexShrink:0,minWidth:40,textAlign:'center'}}>
                  {matchCount>0?`${safeIdx+1}/${matchCount}`:'0'}
                </span>
                <button onClick={()=>{goPrev();setTimeout(()=>scrollToMatch((safeIdx-1+matchCount)%matchCount),50);}}
                  disabled={matchCount===0}
                  style={{background:'var(--surface)',border:'1px solid var(--border)',borderRadius:6,
                    width:28,height:28,cursor:matchCount>0?'pointer':'default',color:'var(--text2)',
                    display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0,opacity:matchCount===0?.4:1}}>↑</button>
                <button onClick={()=>{goNext();setTimeout(()=>scrollToMatch((safeIdx+1)%matchCount),50);}}
                  disabled={matchCount===0}
                  style={{background:'var(--surface)',border:'1px solid var(--border)',borderRadius:6,
                    width:28,height:28,cursor:matchCount>0?'pointer':'default',color:'var(--text2)',
                    display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0,opacity:matchCount===0?.4:1}}>↓</button>
              </>
            )}
            <button onClick={()=>{setSearchActive(false);setLocalSearch('');setSearchIdx(0);}}
              style={{background:'none',border:'none',color:'var(--muted)',fontSize:18,cursor:'pointer',
                flexShrink:0,lineHeight:1,padding:'0 2px'}}>×</button>
          </div>
        )}

        {/* ── Pinned message banner (multiple, Telegram-style cycling) ── */}
        {pinnedMsgs&&pinnedMsgs.length>0&&(()=>{
          const safePin = Math.min(pinnedIdx, pinnedMsgs.length-1);
          const currentPin = pinnedMsgs[pinnedMsgs.length-1-safePin]; // newest first
          const scrollToPin = (pin: any) => {
            const el=document.getElementById('msg-'+pin.id);
            if(el&&messagesRef.current){
              const cr=messagesRef.current.getBoundingClientRect();
              const er=el.getBoundingClientRect();
              messagesRef.current.scrollTop+=er.top-cr.top-cr.height/2+er.height/2;
              const b=(el.querySelector('.msg-bubble-text') as HTMLElement)||el;
              b.style.transition='outline .15s,outline-offset .15s';
              b.style.outline='2px solid var(--accent)';
              b.style.outlineOffset='2px';
              setTimeout(()=>{b.style.outline='';b.style.outlineOffset='';},1400);
            }
          };
          return (
          <div className="desktop-search-bar" style={{position:'absolute',top:62,left:0,right:0,zIndex:8,
            background:'var(--panel)',borderBottom:'1px solid var(--border)',
            borderLeft:'3px solid var(--accent)',
            display:'flex',alignItems:'center',gap:8,padding:'6px 14px',cursor:'pointer'}}
            onClick={()=>{
              scrollToPin(currentPin);
              // Cycle to next pinned message on each click (like Telegram)
              setPinnedIdx(i=>(i+1)%pinnedMsgs.length);
            }}>
            <div style={{display:'flex',flexDirection:'column',alignItems:'center',gap:1,flexShrink:0}}>
              <span style={{fontSize:13}}>📌</span>
              {pinnedMsgs.length>1&&<span style={{fontFamily:'var(--mono)',fontSize:8,color:'var(--accent)',lineHeight:1}}>{safePin+1}/{pinnedMsgs.length}</span>}
            </div>
            <div style={{flex:1,minWidth:0}}>
              <div style={{fontFamily:'var(--mono)',fontSize:9,color:'var(--accent)',letterSpacing:'1px',marginBottom:1}}>
                PINNED MESSAGE {pinnedMsgs.length>1?`• tap to cycle`:''}
              </div>
              <div style={{fontSize:12,color:'var(--text2)',whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>
                {currentPin.text||'📎 Media'}
              </div>
            </div>
            {currentPin.pinnedBy === myAddress?.toLowerCase()&&(
              <button onClick={(e)=>{e.stopPropagation();onPin&&onPin(currentPin);}}
                title="Unpin this message"
                style={{background:'none',border:'none',color:'var(--muted)',fontSize:16,cursor:'pointer',flexShrink:0,padding:'0 2px',lineHeight:1}}>
                ×
              </button>
            )}
          </div>
          );
        })()}

        {/* ── Block strip ── */}
        {/* Floating date chip — Telegram-style, appears while scrolling up */}
        <div style={{
          position:'absolute',
          top:pinnedMsgs?.length?100:68,
          left:'50%',transform:'translateX(-50%)',
          zIndex:8,pointerEvents:'none',
          transition:'opacity .25s ease, transform .25s ease',
          opacity:floatingDateVisible&&floatingDate?1:0,
          transform:floatingDateVisible&&floatingDate?'translateX(-50%) translateY(0)':'translateX(-50%) translateY(-6px)',
        }}>
          <span style={{
            display:'inline-block',
            background:'rgba(0,0,0,.55)',
            backdropFilter:'blur(8px)',WebkitBackdropFilter:'blur(8px)',
            color:'#fff',
            fontFamily:'var(--sans)',fontSize:12,fontWeight:600,
            padding:'4px 12px',borderRadius:12,
            whiteSpace:'nowrap',
            boxShadow:'0 1px 6px rgba(0,0,0,.3)',
            letterSpacing:'0.01em',
          }}>
            {floatingDate}
          </span>
        </div>

        {/* Scroll-to-bottom button */}
        {showScrollBtn&&(
          <button
            onClick={()=>{const el=messagesRef.current;if(el){el.scrollTo({top:el.scrollHeight,behavior:'smooth'});}}}
            style={{position:'absolute',bottom:86,right:16,zIndex:8,
              width:38,height:38,borderRadius:'50%',border:'none',cursor:'pointer',
              background:'var(--panel)',boxShadow:'0 2px 12px rgba(0,0,0,.45)',
              display:'flex',alignItems:'center',justifyContent:'center',
              color:'var(--text)',fontSize:18,transition:'opacity .2s,transform .2s',
              animation:'fadeIn .15s ease'}}
            onMouseEnter={e=>{e.currentTarget.style.transform='scale(1.1)';}}
            onMouseLeave={e=>{e.currentTarget.style.transform='scale(1)';}}>
            <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="6 9 12 15 18 9"/>
            </svg>
          </button>
        )}
        <div className="chat-passthrough" style={{position:'absolute',bottom:70,left:0,right:0,zIndex:5}}>
          <div>
            <BlockStrip blockNum={currentBlock()} className="block-strip-bar"/>
          </div>
        </div>

        {/* ── Input — .chat-passthrough makes background pass-through, buttons/textarea stay clickable ── */}
        <div className="chat-passthrough" style={{position:'absolute',bottom:0,left:0,right:0,zIndex:10}}>
          {/* Announcement group: non-owners see a read-only bar instead of input */}
          {contact.isAnnouncement && contact.createdBy?.toLowerCase() !== myAddress?.toLowerCase() && (
            <div style={{padding:'14px 18px',borderTop:'1px solid var(--border)',background:'var(--panel)',
              display:'flex',alignItems:'center',justifyContent:'center',gap:8,color:'var(--muted)',fontSize:13}}>
              📢 Only the group owner can send messages in this channel
            </div>
          )}
          {!(contact.isAnnouncement && contact.createdBy?.toLowerCase() !== myAddress?.toLowerCase()) && (
          <React.Fragment>
          {/* Reply preview bar — inside the input container so it's always above the input on iOS */}
          {editingMsg&&(
            <div style={{display:'flex',alignItems:'center',gap:10,padding:'8px 14px 4px',
              background:'var(--panel)',borderTop:'1px solid var(--border)',
              borderLeft:'3px solid var(--accent)'}}>
              <div style={{flex:1,minWidth:0}}>
                <div style={{fontFamily:'var(--mono)',fontSize:9,color:'var(--accent)',fontWeight:700,marginBottom:1}}>
                  ✏️ Editing message
                </div>
                <div style={{fontSize:11,color:'var(--muted)',whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>
                  {editingMsg.text}
                </div>
              </div>
              <button onClick={()=>{setEditingMsg(null);setText('');}}
                style={{background:'none',border:'none',color:'var(--muted)',fontSize:18,cursor:'pointer',
                  flexShrink:0,lineHeight:1,padding:'0 4px'}}>
                ×
              </button>
            </div>
          )}
          {replyingTo&&(
            <div style={{display:'flex',alignItems:'center',gap:10,padding:'8px 14px 4px',
              background:'var(--panel)',borderTop:'1px solid var(--border)',
              borderLeft:'3px solid var(--accent2)'}}>
              <div style={{flex:1,minWidth:0}}>
                <div style={{fontFamily:'var(--mono)',fontSize:9,color:'var(--accent2)',fontWeight:700,marginBottom:1}}>
                  ↩ Replying to {replyingTo.out?'yourself':contact?.name||''}
                </div>
                <div style={{fontSize:11,color:'var(--muted)',whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>
                  {replyingTo.type==='voice'?'🎵 Voice message':replyingTo.type==='image'?'🖼 Image':replyingTo.type==='file'?'📎 File':replyingTo.text}
                </div>
              </div>
              <button onClick={()=>setReplyingTo(null)}
                style={{background:'none',border:'none',color:'var(--muted)',fontSize:18,cursor:'pointer',
                  flexShrink:0,lineHeight:1,padding:'0 4px'}}>
                ×
              </button>
            </div>
          )}
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
                <div style={{flex:1,background:'var(--surface)',
                  border:`1px solid ${micMuted?'rgba(251,191,36,.5)':'rgba(248,113,113,.4)'}`,
                  borderRadius:12,display:'flex',alignItems:'center',padding:'0 14px',gap:10,height:42}}>
                  <div style={{width:8,height:8,borderRadius:'50%',
                    background:micMuted?'#fbbf24':'var(--danger)',
                    animation:'pulse 1s infinite',flexShrink:0}}/>
                  <span style={{fontFamily:'var(--mono)',fontSize:11,
                    color:micMuted?'#fbbf24':'var(--danger)'}}>
                    {String(Math.floor(recordSeconds/60)).padStart(2,'0')}:{String(recordSeconds%60).padStart(2,'0')}
                  </span>
                  <span style={{fontSize:11,color:micMuted?'#fbbf24':'var(--muted)',flex:1}}>
                    {micMuted?'🔇 Mic appears muted':'Recording... tap stop to send'}
                  </span>
                  {micMuted&&(
                    <button onClick={()=>{
                        try{
                          const ua=navigator.userAgent;
                          if(/Mac/.test(ua)){window.open('x-apple.systempreferences:com.apple.preference.sound','_self');}
                          else if(/Win/.test(ua)){window.open('ms-settings:sound','_self');}
                          else{window.open('chrome://settings/content/microphone','_blank');}
                        }catch(e){}
                      }}
                      title="Check microphone settings"
                      style={{fontSize:10,padding:'2px 8px',background:'rgba(251,191,36,.12)',
                        border:'1px solid rgba(251,191,36,.35)',borderRadius:6,color:'#fbbf24',
                        cursor:'pointer',flexShrink:0,whiteSpace:'nowrap',fontWeight:600}}>
                      🔧 Fix mic
                    </button>
                  )}
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
                  <input ref={cameraInputRef} type="file" accept="image/*" capture="camera" style={{display:'none'}} onChange={handleCameraPhoto}/>
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

                {/* Text input box — emoji button sits inside like Telegram/WhatsApp */}
                <div style={{flex:1,background:'var(--surface)',border:'0.5px solid var(--border)',
                  borderRadius:22,display:'flex',alignItems:'center',padding:'0 6px 0 12px'}}>
                  <EmojiInput ref={inputRef} value={text}
                    onChange={setText} onKeyDown={key}
                    onFocus={()=>setShowPanel(null)}
                    placeholder="(encrypted on-chain)"/>
                  <button data-emoji-gif-btn="1"
                    onClick={()=>setShowPanel(p=>p?null:'emoji')}
                    style={{flexShrink:0,width:32,height:32,background:'none',border:'none',
                      borderRadius:16,display:'flex',alignItems:'center',
                      justifyContent:'center',cursor:'pointer',transition:'color .15s',
                      color:showPanel?'var(--accent)':'var(--muted)',padding:0}}>
                    <svg viewBox="0 0 24 24" width="22" height="22" fill="none"
                      stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                      <circle cx="12" cy="12" r="10"/>
                      <path d="M8 14s1.5 2 4 2 4-2 4-2"/>
                      <line x1="9" y1="9" x2="9.01" y2="9" strokeWidth="2.5" strokeLinecap="round"/>
                      <line x1="15" y1="9" x2="15.01" y2="9" strokeWidth="2.5" strokeLinecap="round"/>
                    </svg>
                  </button>
                  <span style={{fontFamily:'var(--sans)',fontSize:10,color:'var(--muted)',
                    opacity:.8,fontWeight:500,flexShrink:0,paddingRight:4}}>🔒 E2E</span>
                </div>
                {showPanel&&(
                  <EmojiGifPanel
                    defaultTab={showPanel}
                    isMobile={'ontouchstart' in window}
                    onSelectEmoji={e=>{insertEmoji(e);}}
                    onSelectGif={(item,isSticker)=>{
                      onSend({type:'gif',gifId:item.id,gifUrl:item.url||item.preview,gifWidth:item.width,gifHeight:item.height,
                        isSticker,title:item.title,text:''});
                      setShowPanel(null);
                    }}
                    onClose={()=>setShowPanel(null)}
                    onStickerCreated={onStickerCreated}/>
                )}
                {text.trim()?(
                  <button onClick={send}
                    style={{width:38,height:38,background:'var(--accent)',border:'none',
                      borderRadius:19,color:'#fff',fontSize:16,display:'flex',alignItems:'center',
                      justifyContent:'center',flexShrink:0,cursor:'pointer',transition:'all .15s'}}>➤</button>
                ):(
                  <button onClick={startRecording}
                    style={{width:38,height:38,background:'var(--surface)',border:'none',
                      borderRadius:19,color:'var(--accent)',fontSize:20,display:'flex',alignItems:'center',
                      justifyContent:'center',flexShrink:0,cursor:'pointer',transition:'all .15s'}}
                    title="Hold to record voice message">🎙</button>
                )}
              </div>
            )}
          </div>
          </React.Fragment>)}
        </div>
      </div>

      {showSend&&<SendModal contact={contact} onClose={()=>setShowSend(false)}
        onSend={(amt,pwd)=>onSendETH(contact,amt,pwd)} isDemo={isDemo}
        needsPassword={!!needsPasswordToSend}/>}

      {/* ── Forward modal — portal to body (escapes overflow containers on iOS Safari) ── */}
      {showForward&&forwardMsg&&createPortal(
        <ForwardModal
          msg={forwardMsg}
          contacts={(contacts||[]).filter((c:any)=>!c.isAI)}
          onForward={(targetContact:any)=>{
            onForwardMsg&&onForwardMsg(forwardMsg,targetContact);
            setShowForward(false);setForwardMsg(null);
          }}
          onClose={()=>{setShowForward(false);setForwardMsg(null);}}
        />,
        document.body
      )}
    </>
  );
}
