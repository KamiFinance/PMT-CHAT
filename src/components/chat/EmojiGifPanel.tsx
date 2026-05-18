// @ts-nocheck
import React, { useState, useEffect, useRef, useCallback } from 'react';
import Twemoji from '../ui/Twemoji';

// ── Emoji categories (copied from ChatPanel) ──────────────────────────────────
const EMOJI_CATEGORIES = [
  { label:'🏛', name:'PMT', emojis:['__PMT__','🪙','💎','🔒','🌐','🤝','💡','🚀','⚡','🏆','✨','🔑','💰','💻','📱','🌟','🎯','🏅','💹','🏦','💳','📊','📈','🎲','🎰','🌍','🔭','🎉','🔥','💥','🌈','🎪','🎭','💫','🔮','🧩','🎸','🎺','🥁','🎮','🕹','🔋','🛰','🌙','⭐','🌠','🌌'] },
  { label:'😀', name:'Smileys', emojis:['😀','😂','🤣','😅','😊','😇','🥰','😍','🤩','😘','😗','😙','😚','🙂','🤗','🤭','🤫','🤔','😐','😑','😶','🙄','😏','😒','😞','😔','😟','😕','🙃','🤑','😲','😳','🥺','😦','😧','😨','😰','😥','😢','😭','😱','😖','😣','😓','😩','😫','🥱','😤','😡','🤬','😈','💀','💩','🤡','👻','👽','🤖','😺','😸','😹','😻','😼','😽'] },
  { label:'👍', name:'Gestures', emojis:['👋','🤚','🖐','✋','🖖','👌','🤌','🤏','✌️','🤞','🤟','🤘','🤙','👈','👉','👆','👇','👍','👎','✊','👊','🤛','🤜','👏','🙌','🫶','👐','🤲','🤝','🙏','✍️','💅','🤳','💪','🦾','👂','👃','👀','👅','👄','💋'] },
  { label:'❤️', name:'Hearts', emojis:['❤️','🧡','💛','💚','💙','💜','🖤','🤍','🤎','💔','❤️‍🔥','💕','💞','💓','💗','💖','💘','💝','💟'] },
  { label:'🎉', name:'Fun', emojis:['🎉','🎊','🎈','🎁','🎀','🎗','🎟','🎫','🏆','🥇','🥈','🥉','🎯','🎮','🕹','🎲','🎭','🎨','🎤','🎧','🎵','🎶','🎸','🎹','🎺','🎻','🥁','🎬','📷','🔭','🔬','💡','💰','🪙'] },
  { label:'🌍', name:'Nature', emojis:['🌍','🌎','🌏','🌐','🌋','🏔','⛰','🏕','🏖','🏜','🏝','🌅','🌄','🌠','🎇','🎆','🌌','🏠','🏢','🏦','🏨','🏪','🏬','🏯','🗼','🗽','⛲'] },
  { label:'🐶', name:'Animals', emojis:['🐶','🐱','🐭','🐹','🐰','🦊','🐻','🐼','🐨','🐯','🦁','🐮','🐷','🐸','🐵','🙈','🙉','🙊','🐔','🐧','🐦','🦆','🦅','🦉','🦇','🐺','🐗','🐴','🦄','🐝','🦋','🐌','🐞','🐢','🐍','🐬','🦭','🐳','🦈','🐙'] },
  { label:'🍕', name:'Food', emojis:['🍕','🍔','🌮','🌯','🥪','🥗','🍜','🍝','🍛','🍣','🍱','🍤','🍙','🍚','🥚','🍳','🍲','🥞','🍞','🥐','🥓','🥩','🍗','🍖','🌭','🍟','🍦','🍧','🍩','🍪','🎂','🍰','🧁','🍫','🍬','☕','🍵','🧋','🍺','🍷'] },
  { label:'✈️', name:'Travel', emojis:['✈️','🚀','🛸','🚁','⛵','🚢','🚗','🚕','🚙','🚌','🏎','🚓','🚑','🚒','🏍','🛵','🚲','🛴','🚏','⛽','🚥','🚦','🚧','⚓','🏖','🏔','🌋','🗺','🧭'] },
  { label:'💬', name:'Symbols', emojis:['💬','💭','🗯','💤','💢','💥','💦','💨','💝','❤','🔔','🔕','🎵','🎶','💲','♻','✅','❌','🚫','⛔','🔴','🟠','🟡','🟢','🔵','🟣','⚫','⚪','🔶','🔷','🔸','🔹','🔺','🔻','💠','⬜','⬛','▪','▫'] },
];

const emojiRendersOk = (e: string) => e !== '__PMT__' || true;

interface GifItem { id:string; url:string; width:number; height:number; preview:string; title:string; }

interface Props {
  onSelectEmoji: (e: string) => void;
  onSelectGif: (item: GifItem, isSticker: boolean) => void;
  onClose: () => void;
  defaultTab?: 'emoji' | 'gif' | 'sticker';
  isMobile?: boolean;
}

export default function EmojiGifPanel({ onSelectEmoji, onSelectGif, onClose, defaultTab = 'emoji', isMobile }: Props) {
  const [tab, setTab] = useState<'emoji'|'gif'|'sticker'>(defaultTab);
  const [emojiCat, setEmojiCat] = useState(0);
  const [query, setQuery] = useState('');
  const [gifItems, setGifItems] = useState<GifItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [gifPage, setGifPage] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const [panelH, setPanelH] = useState(0);
  const gridRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController|null>(null);
  const searchTimer = useRef<any>(null);
  const LIMIT = 30;

  // Detect keyboard / viewport height for mobile
  useEffect(() => {
    const update = () => {
      const vv = (window as any).visualViewport;
      if (vv) {
        // On mobile, keyboard height = window.innerHeight - vv.height
        const kbH = window.innerHeight - vv.height - (vv.offsetTop || 0);
        // Panel height: use keyboard height if keyboard was open, else default
        const h = kbH > 100 ? vv.height - 60 : (isMobile ? 300 : 340);
        setPanelH(Math.max(260, h));
      } else {
        setPanelH(isMobile ? 300 : 340);
      }
    };
    update();
    const vv = (window as any).visualViewport;
    vv?.addEventListener('resize', update);
    return () => vv?.removeEventListener('resize', update);
  }, [isMobile]);

  // Close on outside click
  useEffect(() => {
    const h = (e: MouseEvent) => {
      const t = e.target as Element;
      if (!t.closest('[data-emoji-gif-panel]') && !t.closest('[data-emoji-gif-btn]')) onClose();
    };
    setTimeout(() => document.addEventListener('mousedown', h), 50);
    return () => document.removeEventListener('mousedown', h);
  }, [onClose]);

  // Fetch GIFs
  const fetchGifs = useCallback(async (q: string, t: 'gif'|'sticker', page: number, append=false) => {
    if (abortRef.current) abortRef.current.abort();
    const ctrl = new AbortController(); abortRef.current = ctrl;
    setLoading(true);
    try {
      const params = new URLSearchParams({ type: t, limit: String(LIMIT), offset: String(page*LIMIT), ...(q?{q}:{}) });
      const r = await fetch(`/api/giphy?${params}`, { signal: ctrl.signal });
      const d = await r.json();
      const items: GifItem[] = d.items || [];
      setGifItems(prev => append ? [...prev, ...items] : items);
      setHasMore(items.length === LIMIT);
    } catch(e:any) { if(e?.name!=='AbortError') setGifItems(prev => append?prev:[]); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => {
    if (tab === 'gif' || tab === 'sticker') {
      setGifPage(0); setGifItems([]);
      clearTimeout(searchTimer.current);
      const delay = query ? 350 : 0;
      searchTimer.current = setTimeout(() => fetchGifs(query, tab, 0, false), delay);
      return () => clearTimeout(searchTimer.current);
    }
  }, [tab, query, fetchGifs]);

  const onScroll = useCallback(() => {
    const el = gridRef.current;
    if (!el || loading || !hasMore) return;
    if (el.scrollTop + el.clientHeight >= el.scrollHeight - 80) {
      const next = gifPage + 1;
      setGifPage(next);
      fetchGifs(query, tab as 'gif'|'sticker', next, true);
    }
  }, [loading, hasMore, gifPage, query, tab, fetchGifs]);

  const PANEL_HEIGHT = panelH || 340;

  return (
    <div data-emoji-gif-panel="1" style={{
      position: 'fixed',
      bottom: 'calc(env(safe-area-inset-bottom, 0px) + 60px)',
      left: '50%',
      transform: 'translateX(-50%)',
      width: 'min(380px, calc(100vw - 12px))',
      height: PANEL_HEIGHT,
      background: 'var(--panel)',
      border: '1px solid var(--border)',
      borderRadius: 16,
      boxShadow: '0 -4px 32px rgba(0,0,0,.45)',
      display: 'flex', flexDirection: 'column', overflow: 'hidden',
      zIndex: 400, pointerEvents: 'auto',
    }}>
      {/* Tab bar */}
      <div style={{ display:'flex', borderBottom:'1px solid var(--border)', flexShrink:0, background:'var(--panel)' }}>
        {[
          { id:'emoji', icon:'😊', label:'Emoji' },
          { id:'gif',   icon:'🎞', label:'GIF'   },
          { id:'sticker', icon:'✨', label:'Stickers' },
        ].map(t => (
          <button key={t.id} onClick={()=>{setTab(t.id as any); setQuery('');}}
            style={{
              flex:1, padding:'10px 0', background:'none', border:'none',
              borderBottom: tab===t.id ? '2px solid var(--accent)' : '2px solid transparent',
              color: tab===t.id ? 'var(--accent)' : 'var(--muted)',
              fontFamily:'var(--sans)', fontSize:12, fontWeight:600,
              cursor:'pointer', letterSpacing:'0.3px', display:'flex',
              alignItems:'center', justifyContent:'center', gap:5,
            }}>
            <span style={{fontSize:15}}>{t.icon}</span> {t.label}
          </button>
        ))}
      </div>

      {/* Search (GIF + Sticker only) */}
      {(tab==='gif'||tab==='sticker') && (
        <div style={{ padding:'7px 10px', borderBottom:'1px solid var(--border)', flexShrink:0 }}>
          <input value={query} onChange={e=>setQuery(e.target.value)}
            placeholder={tab==='gif' ? 'Search GIFs…' : 'Search Stickers…'}
            style={{ width:'100%', background:'var(--surface)', border:'1px solid var(--border)',
              borderRadius:20, padding:'6px 14px', color:'var(--text)',
              fontFamily:'var(--sans)', fontSize:13, outline:'none', boxSizing:'border-box' }}/>
        </div>
      )}

      {/* Content */}
      <div style={{ flex:1, overflow:'hidden', minHeight:0 }}>
        {/* Emoji tab */}
        {tab==='emoji' && (
          <div style={{ height:'100%', display:'flex', flexDirection:'column' }}>
            {/* Category tabs */}
            <div style={{ display:'flex', padding:'4px 6px', gap:2, flexWrap:'wrap',
              borderBottom:'1px solid var(--border)', flexShrink:0 }}>
              {EMOJI_CATEGORIES.map((ec,i) => (
                <button key={i} onClick={()=>setEmojiCat(i)} title={ec.name}
                  style={{ width:30, height:30, background:emojiCat===i?'var(--surface2)':'transparent',
                    border:emojiCat===i?'1px solid var(--border)':'1px solid transparent',
                    borderRadius:7, cursor:'pointer', fontSize:15, display:'flex',
                    alignItems:'center', justifyContent:'center', transition:'all .1s' }}>
                  {ec.name==='PMT'
                    ? <img src="/pmt-logo.png" style={{width:18,height:18,borderRadius:'50%',objectFit:'cover'}}/>
                    : <Twemoji emoji={ec.label} size={16}/>}
                </button>
              ))}
            </div>
            {/* Emoji grid */}
            <div style={{ flex:1, overflowY:'auto', padding:'6px', display:'grid',
              gridTemplateColumns:'repeat(8,1fr)', gap:2, alignContent:'start' }}>
              {EMOJI_CATEGORIES[emojiCat].emojis.filter(emojiRendersOk).map(e => (
                <button key={e} onClick={()=>onSelectEmoji(e==='__PMT__'?'[PMT]':e)}
                  style={{ width:'100%', aspectRatio:'1', background:'transparent', border:'none',
                    cursor:'pointer', borderRadius:7, display:'flex', alignItems:'center',
                    justifyContent:'center', transition:'background .1s', padding:0 }}
                  onMouseEnter={ev=>(ev.currentTarget.style.background='var(--surface2)')}
                  onMouseLeave={ev=>(ev.currentTarget.style.background='transparent')}>
                  {e==='__PMT__'
                    ? <img src="/pmt-logo.png" style={{width:22,height:22,borderRadius:'50%',objectFit:'cover'}}/>
                    : <Twemoji emoji={e} size={22}/>}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* GIF / Sticker tab */}
        {(tab==='gif'||tab==='sticker') && (
          <div ref={gridRef} onScroll={onScroll}
            style={{ height:'100%', overflowY:'auto', padding:6, display:'grid',
              gridTemplateColumns:'repeat(3,1fr)', gridAutoRows:'100px',
              gap:4, alignContent:'start', overscrollBehavior:'contain', pointerEvents:'auto' }}>
            {gifItems.map(item => (
              <div key={item.id}
                onClick={()=>{ onSelectGif(item, tab==='sticker'); onClose(); }}
                style={{ cursor:'pointer', borderRadius:8, overflow:'hidden',
                  background:'var(--surface2)', display:'flex',
                  alignItems:'center', justifyContent:'center', transition:'transform .1s' }}
                onMouseEnter={e=>(e.currentTarget as HTMLElement).style.transform='scale(1.04)'}
                onMouseLeave={e=>(e.currentTarget as HTMLElement).style.transform='scale(1)'}>
                <img src={item.preview||item.url} alt={item.title}
                  loading="lazy" style={{width:'100%',height:'100%',objectFit:'cover',display:'block'}}/>
              </div>
            ))}
            {loading && Array.from({length:6}).map((_,i)=>(
              <div key={'sk'+i} style={{ borderRadius:8,
                background:'linear-gradient(90deg,var(--surface) 25%,var(--surface2) 50%,var(--surface) 75%)',
                backgroundSize:'200% 100%', animation:'shimmer 1.2s infinite' }}/>
            ))}
            {!loading && gifItems.length===0 && (
              <div style={{gridColumn:'1/-1',textAlign:'center',padding:'30px 20px',
                color:'var(--muted)',fontFamily:'var(--sans)',fontSize:13}}>
                {query ? `No results for "${query}"` : 'Nothing to show'}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Footer */}
      {(tab==='gif'||tab==='sticker') && (
        <div style={{padding:'3px 10px',borderTop:'1px solid var(--border)',textAlign:'right',flexShrink:0}}>
          <span style={{fontFamily:'var(--sans)',fontSize:9,color:'var(--muted)',opacity:.6}}>Powered by GIPHY</span>
        </div>
      )}
    </div>
  );
}
