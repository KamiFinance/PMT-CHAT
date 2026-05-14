// @ts-nocheck
import ProfilePic from '../ui/ProfilePic';
import { REACTION_EMOJIS } from '../../constants/ai';
import React, { useState, useEffect, useRef, useCallback } from 'react';

import Avatar from '../ui/Avatar';
import TxCard from './TxCard';
import VoiceBubble from './VoiceBubble';
import VideoBubble from './VideoBubble';
import Twemoji from '../ui/Twemoji';
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

export default function Bubble({msg,isOut,contact,myAddress,onReact,onReply,onPin,onDelete,onOpenCtxMenu,onOpenDelConfirm,onCloseMenus,ctxMenuOpen,delConfirmOpen,searchQuery,onJoinGroup}:{[k:string]:any}){
  const [showPicker,setShowPicker]=useState(false);
  const [showSenderProfile,setShowSenderProfile]=useState(false);
  const [showPinChoice,setShowPinChoice]=useState(false);
  const delLongPressRef=useRef<any>(null);
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


  // Swipe-right to reply — attach as non-passive so we can preventDefault and
  // stop iOS from treating the gesture as a horizontal page/container scroll
  useEffect(()=>{
    const el=bubbleRef.current;
    if(!el) return;
    const handleMove=(e:TouchEvent)=>{
      // Cancel long-press if user moves finger
      if(longPressRef.current) clearTimeout(longPressRef.current);
      if(swipeStartX.current===null) return;
      const dx=e.touches[0].clientX-(swipeStartX.current as number);
      if(dx>0&&dx<80){
        e.preventDefault(); // stops the whole conversation from moving
        swipeTranslate.current=dx;
        (el as HTMLElement).style.transform=`translateX(${dx}px)`;
      }
    };
    el.addEventListener('touchmove',handleMove,{passive:false});
    return ()=>el.removeEventListener('touchmove',handleMove);
  },[]);

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
  const handleDelLongPressStart=()=>{if(onDelete) delLongPressRef.current=setTimeout(()=>{clearTimeout(longPressRef.current);onCloseMenus&&onCloseMenus();onOpenCtxMenu&&onOpenCtxMenu(msg);},700);};
  const handleDelLongPressEnd=()=>{clearTimeout(delLongPressRef.current);};
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
    // Flash highlight on the inner bubble element only
    const bubble = (el.querySelector('.msg-bubble-text') as HTMLElement) || el;
    bubble.style.transition = 'outline .15s, outline-offset .15s';
    bubble.style.outline = '2px solid var(--accent)';
    bubble.style.outlineOffset = '2px';
    setTimeout(() => { bubble.style.outline = ''; bubble.style.outlineOffset = ''; }, 1400);
  };

  // Quoted message preview (shown when msg.replyTo is set)
  const replyPreview=msg.replyTo&&(
    <div onClick={(e)=>{e.stopPropagation();jumpToReply();}} style={{
      borderLeft:`3px solid ${isOut?'rgba(0,0,0,0.3)':'rgba(255,255,255,0.4)'}`,
      background:isOut?'rgba(0,0,0,.12)':'rgba(255,255,255,.08)',
      borderRadius:'0 8px 8px 0',
      padding:'5px 8px',
      marginBottom:6,
      cursor:'pointer',
      maxWidth:'100%',
      overflow:'hidden',
      WebkitTapHighlightColor:'transparent',
    }}>
      <div style={{fontFamily:'var(--sans)',fontSize:11,fontWeight:600,marginBottom:2,
        color:isOut?'rgba(0,0,0,0.7)':'rgba(255,255,255,0.9)'}}>
        ↩ {msg.replyTo.senderName}
      </div>
      <div style={{fontSize:12,whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis',
        color:isOut?'rgba(0,0,0,0.5)':'rgba(255,255,255,0.65)'}}>
        {msg.replyTo.type==='voice'?'🎵 Voice message':msg.replyTo.type==='image'?'🖼 Image':msg.replyTo.type==='file'?'📎 File':msg.replyTo.text}
      </div>
    </div>
  );

  // On yellow outgoing bubble, use dark/black text; otherwise use theme colors
  const mc = isOut ? 'rgba(0,0,0,0.5)' : 'var(--muted)';
  const mc2 = isOut ? 'rgba(0,0,0,0.45)' : 'var(--accent2)';
  const mcOk = isOut ? 'rgba(0,0,0,0.6)' : 'var(--accent3)';

  const meta=(
    <div style={{display:'flex',alignItems:'center',gap:6,marginTop:5,flexWrap:'wrap'}}>
      <span style={{fontFamily:'var(--mono)',fontSize:9,color:mc}}>{msg.time}</span>
      <span style={{fontFamily:'var(--mono)',fontSize:9,color:mc2,opacity:.8}}>{msg.hash?msg.hash.slice(0,8)+'...'+msg.hash.slice(-4):''}</span>
      {msg.block&&<span style={{fontFamily:'var(--mono)',fontSize:9,color:mc,opacity:.7}}>#{(msg.block||0).toLocaleString()}</span>}
      <span style={{fontFamily:'var(--mono)',fontSize:9,color:msg.pending?mc:msg.confirms===0?mc:msg.confirms<6?mc2:mcOk}}>
        {msg.pending?'✓':('✓'+msg.confirms)}
      </span>
      {isOut&&(
        <span style={{fontFamily:'var(--mono)',fontSize:9,color:msg.read?mcOk:mc}}>
          {msg.pending?'':msg.read?'✓✓':'✓'}
        </span>
      )}
      {msg.onChain&&(
        <span title={`On-chain tx: ${msg.hash}`}
          style={{fontFamily:'var(--mono)',fontSize:8,
            color:isOut?'rgba(0,0,0,0.6)':'var(--accent3)',
            background:isOut?'rgba(0,0,0,.1)':'rgba(52,211,153,.12)',
            border:`1px solid ${isOut?'rgba(0,0,0,.2)':'rgba(52,211,153,.3)'}`,
            borderRadius:4,padding:'0 4px',letterSpacing:.5}}>
          ⛓{msg.chain==='ethereum'?'ETH':'PMT'}
        </span>
      )}
      {onReact&&(
        <button onClick={togglePicker}
          style={{background:'none',border:'none',cursor:'pointer',fontSize:11,
            color:mc,padding:'0 2px',lineHeight:1,opacity:.6}}>
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
            {emoji==='__PMT__'
              ?<img src='/pmt-logo.png' style={{width:16,height:16,borderRadius:'50%',objectFit:'cover',verticalAlign:'middle'}}/>
              :<Twemoji emoji={emoji} size={16} style={{verticalAlign:'middle'}}/>}
            <span style={{fontFamily:'var(--mono)',fontSize:10,color:'var(--text2)'}}>{count}</span>
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
      <ReactionPicker isOut={isOut}
        onPick={(e)=>{onReact&&onReact(msg.id,e);}}
        onClose={()=>setShowPicker(false)}/>
    </>
  );

  if(msg.type==='voice') return(
    <div style={{position:'relative'}} onContextMenu={(e)=>{e.preventDefault();if(onDelete){onCloseMenus&&onCloseMenus();onOpenCtxMenu&&onOpenCtxMenu(msg);}else{setShowPicker(true);}}}
      onTouchStart={handleLongPress} onTouchEnd={()=>{cancelLongPress();handleDelLongPressEnd();}} onTouchMove={cancelLongPress}>
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
    <div style={{position:'relative'}} onContextMenu={(e)=>{e.preventDefault();if(onDelete){onCloseMenus&&onCloseMenus();onOpenCtxMenu&&onOpenCtxMenu(msg);}else{setShowPicker(true);}}}
      onTouchStart={handleLongPress} onTouchEnd={()=>{cancelLongPress();handleDelLongPressEnd();}} onTouchMove={cancelLongPress}>
      <ImageBubble msg={msg} isOut={isOut} contact={contact}/>
      {reactionsBar}{picker}
    </div>
  );
  if(msg.type==='video') return(
    <div style={{position:'relative'}} onContextMenu={(e)=>{e.preventDefault();if(onDelete){onCloseMenus&&onCloseMenus();onOpenCtxMenu&&onOpenCtxMenu(msg);}else{setShowPicker(true);}}}
      onTouchStart={(e)=>{handleLongPress(e);onTouchStartSwipe(e);}}
      onTouchEnd={(e)=>{cancelLongPress();onTouchEndSwipe();}}
      onTouchMove={cancelLongPress}>
      <VideoBubble msg={msg} isOut={isOut} contact={contact}/>
      {reactionsBar}{picker}
    </div>
  );
  if(msg.type==='file') return(
    <div style={{position:'relative'}} onContextMenu={(e)=>{e.preventDefault();if(onDelete){onCloseMenus&&onCloseMenus();onOpenCtxMenu&&onOpenCtxMenu(msg);}else{setShowPicker(true);}}}
      onTouchStart={handleLongPress} onTouchEnd={()=>{cancelLongPress();handleDelLongPressEnd();}} onTouchMove={cancelLongPress}>
      <FileBubble msg={msg} isOut={isOut} contact={contact}/>
      {reactionsBar}{picker}
    </div>
  );
  if(msg.type==='tx') return(
    <div style={{position:'relative'}} onContextMenu={(e)=>{e.preventDefault();if(onDelete){onCloseMenus&&onCloseMenus();onOpenCtxMenu&&onOpenCtxMenu(msg);}else{setShowPicker(true);}}}
      onTouchStart={handleLongPress} onTouchEnd={()=>{cancelLongPress();handleDelLongPressEnd();}} onTouchMove={cancelLongPress}>
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
      onContextMenu={(e)=>{e.preventDefault();if(onDelete){onCloseMenus&&onCloseMenus();onOpenCtxMenu&&onOpenCtxMenu(msg);}else{setShowPicker(true);}}}
      onTouchStart={(e)=>{handleLongPress(e);handleDelLongPressStart();onTouchStartSwipe(e);}}
      onTouchEnd={(e)=>{cancelLongPress();handleDelLongPressEnd();onTouchEndSwipe();}}
      onTouchMove={cancelLongPress}>
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
        <div className="msg-bubble-text" style={{maxWidth:'68%',padding:'9px 13px',borderRadius:16,fontSize:15,lineHeight:1.45,
          ...(isOut?{background:'var(--bubble-out)',border:'none',borderBottomRightRadius:4,color:'#0a0c14'}
                   :{background:'var(--bubble-in)',border:'none',borderBottomLeftRadius:4})}}>
          {msg.senderName&&!isOut&&contact?.isGroup&&(
            <div style={{fontFamily:'var(--mono)',fontSize:10,marginBottom:3,fontWeight:600,display:'flex',alignItems:'center',gap:5}}>
              <span style={{color:'var(--accent2)'}}>{msg.senderName}</span>
              {(msg as any).senderRole==='owner'&&<span style={{fontSize:9,padding:'1px 5px',borderRadius:4,background:'rgba(250,255,99,.15)',color:'var(--accent)',border:'1px solid rgba(250,255,99,.3)',letterSpacing:.5}}>OWNER</span>}
              {(msg as any).senderRole==='admin'&&<span style={{fontSize:9,padding:'1px 5px',borderRadius:4,background:'rgba(99,210,255,.15)',color:'var(--accent)',border:'1px solid rgba(99,210,255,.3)',letterSpacing:.5}}>ADMIN</span>}
              {(msg as any).senderRole==='moderator'&&<span style={{fontSize:9,padding:'1px 5px',borderRadius:4,background:'rgba(167,139,250,.15)',color:'var(--accent2)',border:'1px solid rgba(167,139,250,.3)',letterSpacing:.5}}>MOD</span>}
            </div>
          )}
          {isOut&&contact?.isGroup&&(msg as any).senderRole&&(
            <div style={{fontFamily:'var(--mono)',fontSize:9,marginBottom:3,display:'flex',justifyContent:'flex-end'}}>
              {(msg as any).senderRole==='owner'&&<span style={{padding:'1px 5px',borderRadius:4,background:'rgba(0,0,0,.12)',color:'rgba(0,0,0,0.5)',border:'1px solid rgba(0,0,0,.15)',letterSpacing:.5}}>OWNER</span>}
              {(msg as any).senderRole==='admin'&&<span style={{padding:'1px 5px',borderRadius:4,background:'rgba(0,0,0,.12)',color:'rgba(0,0,0,0.5)',border:'1px solid rgba(0,0,0,.15)',letterSpacing:.5}}>ADMIN</span>}
              {(msg as any).senderRole==='moderator'&&<span style={{padding:'1px 5px',borderRadius:4,background:'rgba(0,0,0,.12)',color:'rgba(0,0,0,0.5)',border:'1px solid rgba(0,0,0,.15)',letterSpacing:.5}}>MOD</span>}
            </div>
          )}
          {replyPreview}
          <LinkifyText text={msg.text} query={searchQuery} onJoinGroup={onJoinGroup} isOut={isOut}/>
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
        {onPin&&(
          <div style={{position:'relative',alignSelf:'center',flexShrink:0}}>
            <button onClick={(e)=>{
              e.stopPropagation();
              if(msg.pinned){onPin(msg);return;} // unpin directly
              if(contact?.isGroup){setShowPinChoice(v=>!v);return;} // groups show notify choice
              setShowPinChoice(v=>!v); // 1-on-1: show choice
            }}
              title={msg.pinned?'Unpin message':'Pin message'}
              style={{background:'var(--surface)',border:'1px solid var(--border)',
                borderRadius:'50%',width:26,height:26,display:'flex',alignItems:'center',
                justifyContent:'center',cursor:'pointer',fontSize:13,
                color:msg.pinned?'var(--accent)':'var(--muted)',
                opacity:showReplyBtn||msg.pinned?1:0,transition:'opacity .15s',
                WebkitTapHighlightColor:'transparent'}}>
              📌
            </button>
            {showPinChoice&&(
              <div style={{position:'absolute',bottom:30,right:0,background:'var(--panel)',
                border:'1px solid var(--border)',borderRadius:10,padding:'6px 0',
                boxShadow:'0 8px 24px rgba(0,0,0,.4)',zIndex:100,minWidth:160}}
                onMouseLeave={()=>setShowPinChoice(false)}>
                <div style={{fontSize:10,color:'var(--muted)',fontFamily:'var(--mono)',
                  padding:'2px 12px 6px',letterSpacing:'1px'}}>PIN MESSAGE</div>
                {contact?.isGroup ? (<>
                  <button onClick={(e)=>{e.stopPropagation();onPin(msg,true);setShowPinChoice(false);}}
                    style={{width:'100%',background:'none',border:'none',padding:'8px 14px',
                      display:'flex',alignItems:'center',gap:8,cursor:'pointer',color:'var(--text)',
                      fontSize:13,textAlign:'left'}}
                    onMouseEnter={e=>(e.currentTarget.style.background='var(--surface)')}
                    onMouseLeave={e=>(e.currentTarget.style.background='none')}>
                    <span>📢</span> Pin + notify members
                  </button>
                  <button onClick={(e)=>{e.stopPropagation();onPin(msg,false);setShowPinChoice(false);}}
                    style={{width:'100%',background:'none',border:'none',padding:'8px 14px',
                      display:'flex',alignItems:'center',gap:8,cursor:'pointer',color:'var(--text)',
                      fontSize:13,textAlign:'left'}}
                    onMouseEnter={e=>(e.currentTarget.style.background='var(--surface)')}
                    onMouseLeave={e=>(e.currentTarget.style.background='none')}>
                    <span>📌</span> Pin silently
                  </button>
                </>) : (<>
                  <button onClick={(e)=>{e.stopPropagation();onPin(msg,true);setShowPinChoice(false);}}
                    style={{width:'100%',background:'none',border:'none',padding:'8px 14px',
                      display:'flex',alignItems:'center',gap:8,cursor:'pointer',color:'var(--text)',
                      fontSize:13,textAlign:'left'}}
                    onMouseEnter={e=>(e.currentTarget.style.background='var(--surface)')}
                    onMouseLeave={e=>(e.currentTarget.style.background='none')}>
                    <span>📌</span> Pin for both
                  </button>
                  <button onClick={(e)=>{e.stopPropagation();onPin(msg,false);setShowPinChoice(false);}}
                    style={{width:'100%',background:'none',border:'none',padding:'8px 14px',
                      display:'flex',alignItems:'center',gap:8,cursor:'pointer',color:'var(--text)',
                      fontSize:13,textAlign:'left'}}
                    onMouseEnter={e=>(e.currentTarget.style.background='var(--surface)')}
                    onMouseLeave={e=>(e.currentTarget.style.background='none')}>
                    <span>🔒</span> Pin just for me
                  </button>
                </>)}
              </div>
            )}
          </div>
        )}
      </div>
      {reactionsBar}
      {picker}

      {/* Delete context menu — shown on right-click or long-press */}
      {ctxMenuOpen&&onDelete&&(
        <div style={{position:'absolute',zIndex:200,[isOut?'right':'left']:0,bottom:'100%',marginBottom:4,
          background:'var(--panel)',border:'1px solid var(--border)',borderRadius:10,
          boxShadow:'0 8px 24px rgba(0,0,0,.4)',padding:'4px 0',minWidth:160}}
          onMouseDown={(e)=>{if(e.button!==2) e.stopPropagation();}}>
          <button
            onClick={(e)=>{e.stopPropagation();onCloseMenus&&onCloseMenus();onOpenDelConfirm&&onOpenDelConfirm(msg);}}
            style={{width:'100%',background:'none',border:'none',padding:'10px 16px',
              display:'flex',alignItems:'center',gap:10,cursor:'pointer',color:'var(--danger)',
              fontSize:13,textAlign:'left',fontFamily:'var(--sans)'}}
            onMouseEnter={e=>(e.currentTarget.style.background='rgba(248,113,113,.1)')}
            onMouseLeave={e=>(e.currentTarget.style.background='none')}>
            <span style={{fontSize:16}}>🗑️</span> Delete message
          </button>
        </div>
      )}

      {/* Delete confirmation popup */}
      {delConfirmOpen&&onDelete&&(
        <div style={{position:'fixed',inset:0,zIndex:300,display:'flex',alignItems:'center',justifyContent:'center'}}
          onClick={()=>onCloseMenus&&onCloseMenus()}>
          <div style={{background:'var(--panel)',border:'1px solid var(--border)',borderRadius:14,
            padding:'20px 20px 14px',minWidth:240,maxWidth:300,boxShadow:'0 16px 40px rgba(0,0,0,.5)',
            animation:'slideUp .2s ease'}}
            onClick={e=>e.stopPropagation()}>
            <div style={{fontSize:15,fontWeight:600,color:'var(--text)',marginBottom:4}}>Delete message?</div>
            <div style={{fontSize:12,color:'var(--muted)',marginBottom:16,lineHeight:1.5}}>
              {contact?.isGroup?'This message will be removed from your view, or for everyone in the group.':'This message will be removed from your view, or for both sides of the conversation.'}
            </div>
            <div style={{display:'flex',flexDirection:'column',gap:8}}>
              <button onClick={()=>{onDelete(msg,false);onCloseMenus&&onCloseMenus();}}
                style={{padding:'10px',background:'var(--surface)',border:'1px solid var(--border)',
                  borderRadius:9,color:'var(--text)',fontSize:13,cursor:'pointer',fontWeight:500,
                  textAlign:'left',fontFamily:'var(--sans)'}}>
                🙋 Delete for me
              </button>
              <button onClick={()=>{onDelete(msg,true);onCloseMenus&&onCloseMenus();}}
                style={{padding:'10px',background:'rgba(248,113,113,.1)',border:'1px solid rgba(248,113,113,.3)',
                  borderRadius:9,color:'var(--danger)',fontSize:13,cursor:'pointer',fontWeight:600,
                  textAlign:'left',fontFamily:'var(--sans)'}}>
                👥 {contact?.isGroup?'Delete for all':'Delete for both'}
              </button>
              <button onClick={()=>onCloseMenus&&onCloseMenus()}
                style={{padding:'8px',background:'none',border:'none',color:'var(--muted)',
                  fontSize:12,cursor:'pointer',textAlign:'center',fontFamily:'var(--sans)'}}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
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
