// @ts-nocheck
import ProfilePic from '../ui/ProfilePic';
import { REACTION_EMOJIS } from '../../constants/ai';
import React, { useState, useEffect, useRef, useCallback } from 'react';

import Avatar from '../ui/Avatar';
import TxCard from './TxCard';
import VoiceBubble from './VoiceBubble';
import ImageBubble from './ImageBubble';
import FileBubble from './FileBubble';
import ReactionPicker from './ReactionPicker';
import HighlightText from '../ui/HighlightText';
import LinkifyText from '../ui/LinkifyText';
// ── Sender Profile Card (popup when clicking avatar) ──────────────────────
function SenderProfileCard({msg, contact, onClose}) {
  const name = msg.senderName || contact?.name || 'Unknown';
  const avatarUrl = msg.senderAvatarUrl || contact?.avatarUrl || null;
  const initials = (msg.senderName || contact?.avatar || '??').slice(0, 2).toUpperCase();
  const color = contact?.color || '#a78bfa';
  const bg = contact?.bg || '#1e1b30';
  const bio = msg.senderBio || '';
  const address = msg.senderAddress || contact?.address || '';

  return (
    <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,.6)',display:'flex',alignItems:'center',
      justifyContent:'center',zIndex:300,animation:'fadeIn .15s ease'}}
      onClick={onClose}>
      <div style={{background:'var(--panel)',border:'1px solid var(--border)',borderRadius:18,
        padding:'28px 24px',width:300,display:'flex',flexDirection:'column',alignItems:'center',gap:12,
        animation:'slideUp .2s ease'}} onClick={e=>e.stopPropagation()}>
        {/* Avatar */}
        <div style={{position:'relative'}}>
          {avatarUrl
            ? <img src={avatarUrl} style={{width:72,height:72,borderRadius:'50%',objectFit:'cover',
                border:'2px solid '+color}} alt={name}/>
            : <div style={{width:72,height:72,borderRadius:'50%',background:bg,
                border:'2px solid '+color,display:'flex',alignItems:'center',justifyContent:'center',
                fontSize:22,fontWeight:700,color:color}}>{initials}</div>
          }
          <div style={{position:'absolute',bottom:2,right:2,width:14,height:14,borderRadius:'50%',
            background:'var(--accent3)',border:'2px solid var(--panel)'}}/>
        </div>
        {/* Name */}
        <div style={{fontSize:18,fontWeight:700,color:'var(--text)',textAlign:'center'}}>{name}</div>
        {/* Address */}
        {address && (
          <div style={{fontFamily:'var(--mono)',fontSize:10,color:'var(--accent)',
            background:'var(--surface)',borderRadius:8,padding:'5px 12px',
            wordBreak:'break-all',textAlign:'center'}}>
            {address.length > 20 ? address.slice(0,10)+'...'+address.slice(-8) : address}
          </div>
        )}
        {/* Bio */}
        {bio && (
          <div style={{fontSize:13,color:'var(--text2)',textAlign:'center',lineHeight:1.5,
            background:'var(--surface)',borderRadius:10,padding:'10px 14px',width:'100%'}}>
            {bio}
          </div>
        )}
        {/* PMT Chain badge */}
        <div style={{fontFamily:'var(--mono)',fontSize:9,color:'var(--accent2)',
          background:'rgba(167,139,250,.1)',border:'1px solid rgba(167,139,250,.3)',
          borderRadius:20,padding:'3px 12px',letterSpacing:'1px'}}>
          PMT CHAIN USER
        </div>
        <button onClick={onClose}
          style={{marginTop:4,padding:'9px 32px',background:'var(--surface)',border:'1px solid var(--border)',
            borderRadius:10,color:'var(--muted)',fontSize:13,cursor:'pointer'}}>
          Close
        </button>
      </div>
    </div>
  );
}

export default function Bubble({msg,isOut,contact,myAddress,onReact,onReply,searchQuery,onJoinGroup}){
  const [showPicker,setShowPicker]=useState(false);
  const [showSenderProfile,setShowSenderProfile]=useState(false);
  const reactions=msg.reactions||{};
  // Support both formats: {emoji: {addr: 1}} (new) and {emoji: count} (old)
  const getRxnCount=(v)=>typeof v==='object'&&v!==null?Object.values(v).filter((x)=>Number(x)>0).length:Number(v)>0?Number(v):0;
  const iMine=(v)=>typeof v==='object'&&v!==null?Number((v as any)[myAddress??''])>0:Number(v)>0;
  const reactionEntries=Object.entries(reactions).filter(([,v])=>getRxnCount(v)>0);
  const longPressRef=useRef(null);
  const [showReplyBtn,setShowReplyBtn]=useState(false);
  const swipeStartX=useRef(null);
  const swipeTranslate=useRef(0);
  const bubbleRef=useRef(null);

  // Swipe-right to reply (mobile)
  const onTouchStartSwipe=(e)=>{
    swipeStartX.current=e.touches[0].clientX;
    if(bubbleRef.current) bubbleRef.current.style.transition='none';
  };
  const onTouchMoveSwipe=(e)=>{
    if(swipeStartX.current===null) return;
    const dx=e.touches[0].clientX-swipeStartX.current;
    if(dx>0&&dx<80){
      swipeTranslate.current=dx;
      if(bubbleRef.current) bubbleRef.current.style.transform=`translateX(${dx}px)`;
    }
  };
  const onTouchEndSwipe=()=>{
    if(swipeTranslate.current>40&&onReply) onReply(msg);
    if(bubbleRef.current){
      bubbleRef.current.style.transition='transform .2s ease';
      bubbleRef.current.style.transform='translateX(0)';
    }
    swipeStartX.current=null;
    swipeTranslate.current=0;
  };

  const handleLongPress=()=>{longPressRef.current=setTimeout(()=>setShowPicker(true),500);};
  const cancelLongPress=()=>clearTimeout(longPressRef.current);
  const togglePicker=(e)=>{e.stopPropagation();setShowPicker(p=>!p);};

  // Scroll to and highlight the original quoted message
  const jumpToReply = () => {
    if (!msg.replyTo?.id) return;
    const el = document.getElementById('msg-' + msg.replyTo.id);
    if (!el) return;
    // Find the nearest scrollable ancestor (overflow: auto/scroll)
    let scrollParent: HTMLElement | null = el.parentElement;
    while (scrollParent) {
      const cs = window.getComputedStyle(scrollParent);
      if (cs.overflowY === 'auto' || cs.overflowY === 'scroll') break;
      scrollParent = scrollParent.parentElement;
    }
    if (scrollParent) {
      // Scroll the container so the target is centered
      const containerRect = scrollParent.getBoundingClientRect();
      const elRect = el.getBoundingClientRect();
      const targetScrollTop = scrollParent.scrollTop + elRect.top - containerRect.top - containerRect.height / 2 + elRect.height / 2;
      scrollParent.scrollTo({ top: targetScrollTop, behavior: 'smooth' });
    } else {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
    // Flash highlight
    el.style.transition = 'background .2s, outline .2s';
    el.style.background = 'rgba(99,210,255,.2)';
    el.style.borderRadius = '10px';
    el.style.outline = '2px solid rgba(99,210,255,.4)';
    setTimeout(() => { el.style.background = ''; el.style.borderRadius = ''; el.style.outline = ''; }, 1500);
  };

  // Quoted message preview (shown when msg.replyTo is set)
  const replyPreview=msg.replyTo&&(
    <div onClick={(e)=>{e.stopPropagation();jumpToReply();}} style={{
      borderLeft:'3px solid var(--accent2)',
      background:'rgba(99,210,255,.07)',
      borderRadius:'0 6px 6px 0',
      padding:'4px 8px',
      marginBottom:5,
      cursor:'pointer',
      maxWidth:'100%',
      overflow:'hidden',
      WebkitTapHighlightColor:'transparent',
    }}>
      <div style={{fontFamily:'var(--mono)',fontSize:9,color:'var(--accent2)',fontWeight:700,marginBottom:2}}>
        ↩ {msg.replyTo.senderName}
      </div>
      <div style={{fontSize:11,color:'var(--muted)',whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>
        {msg.replyTo.type==='voice'?'🎵 Voice message':msg.replyTo.type==='image'?'🖼 Image':msg.replyTo.type==='file'?'📎 File':msg.replyTo.text}
      </div>
    </div>
  );

  const meta=(
    <div style={{display:'flex',alignItems:'center',gap:6,marginTop:5,flexWrap:'wrap'}}>
      <span style={{fontFamily:'var(--mono)',fontSize:9,color:'var(--muted)'}}>{msg.time}</span>
      <span style={{fontFamily:'var(--mono)',fontSize:9,color:'var(--accent2)',opacity:.7}}>{msg.hash?msg.hash.slice(0,8)+'...'+msg.hash.slice(-4):''}</span>
      {msg.block&&<span style={{fontFamily:'var(--mono)',fontSize:9,color:'var(--muted)',opacity:.6}}>#{(msg.block||0).toLocaleString()}</span>}
      <span style={{fontFamily:'var(--mono)',fontSize:9,color:msg.pending?'var(--muted)':msg.confirms===0?'var(--muted)':msg.confirms<6?'var(--accent)':'var(--accent3)'}}>
        {msg.pending?'✓':('✓'+msg.confirms)}
      </span>
      {isOut&&(
        <span style={{fontFamily:'var(--mono)',fontSize:9,color:msg.read?'var(--accent)':'var(--muted)'}}>
          {msg.pending?'':msg.read?'✓✓':'✓'}
        </span>
      )}
      {msg.onChain&&(
        <span title={`On-chain tx: ${msg.hash}`}
          style={{fontFamily:'var(--mono)',fontSize:8,
            color:'var(--accent3)',background:'rgba(52,211,153,.12)',
            border:'1px solid rgba(52,211,153,.3)',borderRadius:4,
            padding:'0 4px',letterSpacing:.5}}>
          ⛓{msg.chain==='ethereum'?'ETH':'PMT'}
        </span>
      )}
      {onReact&&(
        <button onClick={togglePicker}
          style={{background:'none',border:'none',cursor:'pointer',fontSize:11,
            color:'var(--muted)',padding:'0 2px',lineHeight:1,opacity:.6}}>
          😊
        </button>
      )}
    </div>
  );

  const reactionsBar=reactionEntries.length>0&&(
    <div style={{display:'flex',gap:3,marginTop:4,flexWrap:'wrap',justifyContent:isOut?'flex-end':'flex-start'}}>
      {reactionEntries.map(([emoji,v])=>{
        const count=getRxnCount(v);
        const mine=iMine(v);
        const reactors=typeof v==='object'&&v!==null
          ?Object.entries(v).filter(([,n])=>Number(n)>0).map(([addr]:any)=>addr===myAddress?'You':addr.slice(0,6)+'...'+addr.slice(-4)).join(', '):'';
        return(
          <button key={emoji}
            onClick={()=>onReact&&onReact(msg.id,emoji)}
            title={mine?`Remove your reaction${reactors?'\nReacted: '+reactors:''}`:reactors?'Reacted: '+reactors:undefined}
            style={{background:mine?'rgba(250,255,99,.12)':'var(--surface)',
              border:`1px solid ${mine?'rgba(250,255,99,.4)':'var(--border)'}`,
              borderRadius:12,padding:'1px 6px',fontSize:12,
              cursor:'pointer',
              display:'flex',alignItems:'center',gap:3,
              animation:'popIn .2s ease',
              opacity:mine?1:0.85}}>
            {emoji}<span style={{fontFamily:'var(--mono)',fontSize:10,color:'var(--text2)'}}>{count}</span>
          </button>
        );
      })}
    </div>
  );

  const picker=showPicker&&(
    <>
      {/* Invisible backdrop to close picker on outside tap */}
      <div onClick={()=>setShowPicker(false)}
        style={{position:'fixed',inset:0,zIndex:198}}/>
      <div style={{position:'absolute',bottom:'calc(100% + 2px)',zIndex:199,...(isOut?{right:0}:{left:0}),
        background:'var(--panel)',border:'1px solid var(--border)',borderRadius:24,
        padding:'6px 10px',display:'flex',gap:4,
        boxShadow:'0 8px 24px rgba(0,0,0,.6)',animation:'fadeIn .12s ease'}}>
        {REACTION_EMOJIS.map(e=>(
          <button key={e}
            onClick={(ev)=>{ev.stopPropagation();onReact&&onReact(msg.id,e);setShowPicker(false);}}
            style={{background:'none',border:'none',cursor:'pointer',fontSize:22,
              padding:'4px 5px',borderRadius:8,minWidth:36,minHeight:36,
              display:'flex',alignItems:'center',justifyContent:'center',
              transition:'transform .1s'}}
            onMouseEnter={ev=>ev.currentTarget.style.transform='scale(1.3)'}
            onMouseLeave={ev=>ev.currentTarget.style.transform='scale(1)'}>
            {e}
          </button>
        ))}
      </div>
    </>
  );

  if(msg.type==='voice') return(
    <div style={{position:'relative'}} onContextMenu={(e)=>{e.preventDefault();setShowPicker(true);}}
      onTouchStart={handleLongPress} onTouchEnd={cancelLongPress} onTouchMove={cancelLongPress}>
      <VoiceBubble msg={msg} isOut={isOut} contact={contact}/>
      {reactionsBar}{picker}
    </div>
  );
  // Typing indicator
  if(msg.isTyping) return(
    <div style={{display:'flex',alignItems:'flex-end',gap:8,marginBottom:3,animation:'fadeIn .2s ease'}}>
      <div style={{width:26,height:26,borderRadius:'50%',background:'#1a1a0a',border:'1px solid #faff6340',
        display:'flex',alignItems:'center',justifyContent:'center',fontSize:9,fontWeight:700,color:'#faff63',flexShrink:0}}>
        AI
      </div>
      <div style={{background:'var(--surface2)',border:'1px solid var(--border)',borderRadius:14,borderBottomLeftRadius:4,
        padding:'10px 14px',display:'flex',gap:4,alignItems:'center'}}>
        {[0,1,2].map(i=>(
          <div key={i} style={{width:6,height:6,borderRadius:'50%',background:'var(--muted)',
            animation:'typingDot 1.2s ease-in-out infinite',animationDelay:(i*0.2)+'s'}}/>
        ))}
      </div>
    </div>
  );
  if(msg.type==='image') return(
    <div style={{position:'relative'}} onContextMenu={(e)=>{e.preventDefault();setShowPicker(true);}}
      onTouchStart={handleLongPress} onTouchEnd={cancelLongPress} onTouchMove={cancelLongPress}>
      <ImageBubble msg={msg} isOut={isOut} contact={contact}/>
      {reactionsBar}{picker}
    </div>
  );
  if(msg.type==='file') return(
    <div style={{position:'relative'}} onContextMenu={(e)=>{e.preventDefault();setShowPicker(true);}}
      onTouchStart={handleLongPress} onTouchEnd={cancelLongPress} onTouchMove={cancelLongPress}>
      <FileBubble msg={msg} isOut={isOut} contact={contact}/>
      {reactionsBar}{picker}
    </div>
  );
  if(msg.type==='tx') return(
    <div style={{position:'relative'}} onContextMenu={(e)=>{e.preventDefault();setShowPicker(true);}}
      onTouchStart={handleLongPress} onTouchEnd={cancelLongPress} onTouchMove={cancelLongPress}>
      <div style={{display:'flex',alignItems:'flex-end',gap:8,marginBottom:3,flexDirection:isOut?'row-reverse':'row',animation:'fadeIn .2s ease'}}>
        {!isOut&&(
          <div style={{flexShrink:0}}>
            <ProfilePic
              initials={msg.senderName?.slice(0,2).toUpperCase()||contact?.avatar}
              avatarUrl={msg.senderAvatarUrl!==undefined?msg.senderAvatarUrl:contact?.avatarUrl}
              color={contact?.color}
              bg={contact?.bg}
              size={28} fs={10}
            />
          </div>
        )}
        <TxCard msg={msg} isOut={isOut}/>
      </div>
      {reactionsBar}{picker}
    </div>
  );
  if(msg.type==='system') return(
    <div style={{textAlign:'center',margin:'8px 0',animation:'fadeIn .2s ease'}}>
      <span style={{fontFamily:'var(--mono)',fontSize:10,color:'var(--muted)',background:'var(--surface)',
        border:'1px solid var(--border)',borderRadius:20,padding:'3px 12px'}}>{msg.text}</span>
    </div>
  );
  return(
    <>
    <div id={'msg-'+msg.id} style={{position:'relative',marginBottom:3}}
      ref={bubbleRef}
      onContextMenu={(e)=>{e.preventDefault();setShowPicker(true);}}
      onTouchStart={(e)=>{handleLongPress(e);onTouchStartSwipe(e);}}
      onTouchEnd={(e)=>{cancelLongPress();onTouchEndSwipe();}}
      onTouchMove={(e)=>{cancelLongPress();onTouchMoveSwipe(e);}}>
      <div style={{display:'flex',alignItems:'flex-end',gap:4,flexDirection:isOut?'row-reverse':'row',animation:'fadeIn .2s ease'}}
        onMouseEnter={()=>setShowReplyBtn(true)} onMouseLeave={()=>setShowReplyBtn(false)}>
        {!isOut&&(
          <div style={{flexShrink:0}}>
            <ProfilePic
              initials={msg.senderName?.slice(0,2).toUpperCase()||contact?.avatar}
              avatarUrl={msg.senderAvatarUrl!==undefined?msg.senderAvatarUrl:contact?.avatarUrl}
              color={contact?.color}
              bg={contact?.bg}
              size={28} fs={10}
            />
          </div>
        )}
        <div className="msg-bubble-text" style={{maxWidth:'68%',padding:'9px 13px',borderRadius:16,fontSize:13.5,lineHeight:1.5,
          ...(isOut?{background:'#1a2a4a',border:'1px solid rgba(99,210,255,.15)',borderBottomRightRadius:4}
                   :{background:'var(--surface2)',border:'1px solid var(--border)',borderBottomLeftRadius:4})}}>
          {msg.senderName&&!isOut&&(
            <div style={{fontFamily:'var(--mono)',fontSize:10,color:'var(--accent2)',marginBottom:3,fontWeight:600}}>{msg.senderName}</div>
          )}
          {replyPreview}
          <LinkifyText text={msg.text} query={searchQuery} onJoinGroup={onJoinGroup}/>
          {meta}
        </div>
        {/* Reply button — shown in flex row on hover, stays visible when moving to click */}
        {onReply&&(
          <button onClick={(e)=>{e.stopPropagation();onReply(msg);}}
            title="Reply"
            style={{alignSelf:'center',background:'var(--surface)',border:'1px solid var(--border)',
              borderRadius:'50%',width:26,height:26,display:'flex',alignItems:'center',
              justifyContent:'center',cursor:'pointer',fontSize:13,flexShrink:0,
              color:'var(--muted)',opacity:showReplyBtn?1:0,transition:'opacity .15s',
              WebkitTapHighlightColor:'transparent'}}>
            ↩
          </button>
        )}
      </div>
      {reactionsBar}
      {picker}
    </div>
    {showSenderProfile&&(
      <SenderProfileCard
        msg={msg}
        contact={contact}
        onClose={()=>setShowSenderProfile(false)}
      />
    )}
    </>
  );
}
