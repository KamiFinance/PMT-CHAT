// @ts-nocheck
import { REACTION_EMOJIS } from '../../constants/ai';
import React from 'react';
import Twemoji from '../ui/Twemoji';

// PMT logo is the first "emoji" in the reaction bar
const ALL_REACTIONS = ['__PMT__', ...REACTION_EMOJIS];

export default function ReactionPicker({onPick,onClose,isOut}){
  return(
    <div style={{position:'absolute',bottom:'calc(100% + 6px)',
      ...(isOut?{right:0}:{left:0}),
      background:'var(--panel)',border:'1px solid var(--border)',borderRadius:16,
      padding:'6px 8px',display:'flex',flexWrap:'wrap',gap:2,zIndex:200,
      boxShadow:'0 8px 24px rgba(0,0,0,.5)',animation:'fadeIn .12s ease',
      maxWidth:260}}>
      {ALL_REACTIONS.map(e=>(
        <button key={e} onClick={(ev)=>{ev.stopPropagation();onPick(e);onClose();}}
          style={{background:'none',border:'none',cursor:'pointer',fontSize:20,
            padding:'3px 4px',borderRadius:8,transition:'transform .1s',
            minWidth:34,minHeight:34,display:'flex',alignItems:'center',justifyContent:'center'}}
          onMouseEnter={ev=>ev.currentTarget.style.transform='scale(1.3)'}
          onMouseLeave={ev=>ev.currentTarget.style.transform='scale(1)'}>
          {e==='__PMT__'
            ?<img src="/pmt-logo.png" style={{width:24,height:24,borderRadius:'50%',objectFit:'cover'}}/>
            :<Twemoji emoji={e} size={24}/>}
        </button>
      ))}
    </div>
  );
}
