// @ts-nocheck
import React, { useState, useRef, useEffect, useCallback } from 'react';
import { removeBackground } from '@imgly/background-removal';

interface CustomSticker { id:string; url:string; title:string; createdAt:number; }
const STORAGE_KEY = 'pmt_custom_stickers';
export function loadCustomStickers(): CustomSticker[] {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY)||'[]'); } catch { return []; }
}
function saveCustomSticker(s: CustomSticker) {
  const all = loadCustomStickers();
  localStorage.setItem(STORAGE_KEY, JSON.stringify([s,...all].slice(0,50)));
}
export function deleteCustomSticker(id:string) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(loadCustomStickers().filter(s=>s.id!==id)));
}

interface Props { onDone:(s:CustomSticker)=>void; onClose:()=>void; }

export default function CustomStickerCreator({ onDone, onClose }: Props) {
  const [stage, setStage] = useState<'upload'|'processing'|'edit'>('upload');
  const [processedBlob, setProcessedBlob] = useState<Blob|null>(null);
  const [caption, setCaption] = useState('');
  const [shape, setShape] = useState<'square'|'circle'>('square');
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
  const [progress, setProgress] = useState('');
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || !processedBlob) return;
    const img = new Image();
    img.onload = () => {
      const SIZE = 512;
      canvas.width = SIZE; canvas.height = SIZE;
      const ctx = canvas.getContext('2d')!;
      ctx.clearRect(0,0,SIZE,SIZE);
      ctx.save();
      if (shape==='circle') {
        ctx.beginPath(); ctx.arc(SIZE/2,SIZE/2,SIZE/2,0,Math.PI*2); ctx.clip();
      } else {
        ctx.beginPath(); ctx.roundRect(0,0,SIZE,SIZE,48); ctx.clip();
      }
      const s = Math.min(img.naturalWidth,img.naturalHeight);
      const sx = (img.naturalWidth-s)/2, sy = (img.naturalHeight-s)/2;
      ctx.drawImage(img,sx,sy,s,s,0,0,SIZE,SIZE);
      ctx.restore();
      if (caption.trim()) {
        const fSize = Math.max(28,Math.min(48,SIZE/(caption.length*0.6)));
        ctx.font = `bold ${fSize}px -apple-system,sans-serif`;
        ctx.textAlign = 'center';
        const tw = ctx.measureText(caption).width+32, th = fSize+20, ty = SIZE-28;
        ctx.fillStyle = 'rgba(0,0,0,0.55)';
        ctx.beginPath(); ctx.roundRect(SIZE/2-tw/2,ty-th+8,tw,th,th/2); ctx.fill();
        ctx.fillStyle = '#fff'; ctx.fillText(caption,SIZE/2,ty);
      }
      URL.revokeObjectURL(img.src);
    };
    img.src = URL.createObjectURL(processedBlob);
  }, [processedBlob, shape, caption]);

  useEffect(() => { if(stage==='edit') draw(); }, [draw, stage]);

  const onFile = async (e:React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setError(''); setStage('processing');
    setProgress('Removing background…');
    try {
      const blob = await removeBackground(file, {
        publicPath: 'https://staticimgly.com/@imgly/background-removal-data/1.7.0/dist/',
        progress: (key:string, cur:number, tot:number) => {
          if (key==='compute:inference') setProgress(`Processing… ${Math.round(cur/tot*100)}%`);
        },
      });
      setProcessedBlob(blob);
      setStage('edit');
    } catch(e:any) {
      setError('Background removal failed. Try a clearer image.');
      setStage('upload');
    }
  };

  const handleCreate = async () => {
    if (!canvasRef.current) return;
    setUploading(true); setError('');
    try {
      const blob:Blob = await new Promise((res,rej) =>
        canvasRef.current!.toBlob(b=>b?res(b):rej(),'image/png',0.92));
      const b64:string = await new Promise((res,rej)=>{
        const r=new FileReader();
        r.onload=()=>res((r.result as string).split(',')[1]);
        r.onerror=rej; r.readAsDataURL(blob);
      });
      const resp = await fetch('/api/pinata-upload',{
        method:'POST', headers:{'Content-Type':'application/json'},
        body:JSON.stringify({data:b64,name:`sticker-${Date.now()}.png`,mimeType:'image/png'}),
      });
      if(!resp.ok) throw new Error('Upload failed');
      const {url} = await resp.json();
      const sticker:CustomSticker={id:'cs-'+Date.now(),url,title:caption||'My Sticker',createdAt:Date.now()};
      saveCustomSticker(sticker);
      onDone(sticker);
    } catch(e:any) { setError(e?.message||'Failed.'); }
    finally { setUploading(false); }
  };

  return (
    <div style={{display:'flex',flexDirection:'column',height:'100%',padding:'12px 14px',gap:10,overflowY:'auto'}}>
      <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',flexShrink:0}}>
        <span style={{fontFamily:'var(--sans)',fontSize:14,fontWeight:700,color:'var(--text)'}}>Create Sticker</span>
        <button onClick={onClose} style={{background:'none',border:'none',cursor:'pointer',color:'var(--muted)',fontSize:18,padding:0}}>✕</button>
      </div>

      {stage==='upload' && (
        <div onClick={()=>fileRef.current?.click()}
          style={{flex:1,minHeight:160,borderRadius:16,border:'2px dashed var(--border)',
            background:'var(--surface2)',display:'flex',flexDirection:'column',
            alignItems:'center',justifyContent:'center',cursor:'pointer',gap:10}}>
          <div style={{fontSize:40}}>🖼</div>
          <div style={{fontFamily:'var(--sans)',fontSize:13,color:'var(--muted)',textAlign:'center',lineHeight:1.5}}>
            Tap to upload image<br/>
            <span style={{fontSize:11,opacity:.7}}>Background removed automatically</span>
          </div>
        </div>
      )}

      {stage==='processing' && (
        <div style={{flex:1,minHeight:160,borderRadius:16,background:'var(--surface2)',
          display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',gap:12}}>
          <div style={{width:36,height:36,border:'3px solid var(--accent)',borderTopColor:'transparent',
            borderRadius:'50%',animation:'spin 0.8s linear infinite'}}/>
          <div style={{fontFamily:'var(--sans)',fontSize:13,color:'var(--muted)'}}>{progress||'Processing…'}</div>
        </div>
      )}

      {stage==='edit' && (
        <>
          <div style={{flexShrink:0,display:'flex',justifyContent:'center'}}>
            <canvas ref={canvasRef}
              style={{width:180,height:180,borderRadius:shape==='circle'?'50%':14,
                border:'1px solid var(--border)',background:'repeating-conic-gradient(#808080 0% 25%,transparent 0% 50%) 0 0/10px 10px'}}/>
          </div>
          <div style={{display:'flex',gap:8,flexShrink:0}}>
            {(['square','circle'] as const).map(s=>(
              <button key={s} onClick={()=>setShape(s)}
                style={{flex:1,padding:'7px 0',borderRadius:20,border:'none',cursor:'pointer',
                  fontFamily:'var(--sans)',fontSize:12,fontWeight:600,transition:'all .15s',
                  background:shape===s?'var(--accent)':'var(--surface)',
                  color:shape===s?'#fff':'var(--muted)'}}>
                {s==='square'?'⬛ Square':'⬤ Circle'}
              </button>
            ))}
          </div>
          <input value={caption} onChange={e=>setCaption(e.target.value)}
            placeholder="Add caption (optional)" maxLength={30}
            style={{flexShrink:0,background:'var(--surface)',border:'1px solid var(--border)',
              borderRadius:20,padding:'8px 14px',color:'var(--text)',
              fontFamily:'var(--sans)',fontSize:13,outline:'none'}}/>
          <div style={{display:'flex',gap:8,flexShrink:0}}>
            <button onClick={()=>{setStage('upload');setProcessedBlob(null);if(fileRef.current)fileRef.current.value='';}}
              style={{flex:1,padding:'10px 0',background:'var(--surface)',border:'1px solid var(--border)',
                borderRadius:22,color:'var(--muted)',fontFamily:'var(--sans)',fontSize:13,fontWeight:600,cursor:'pointer'}}>
              ↩ Redo
            </button>
            <button onClick={handleCreate} disabled={uploading}
              style={{flex:2,padding:'10px 0',background:uploading?'var(--surface)':'var(--accent)',
                border:'none',borderRadius:22,color:uploading?'var(--muted)':'#fff',
                fontFamily:'var(--sans)',fontSize:13,fontWeight:700,cursor:uploading?'not-allowed':'pointer'}}>
              {uploading?'⏳ Creating…':'✨ Create Sticker'}
            </button>
          </div>
        </>
      )}

      <input ref={fileRef} type="file" accept="image/*" style={{display:'none'}} onChange={onFile}/>
      {error&&<span style={{color:'var(--danger)',fontFamily:'var(--sans)',fontSize:12,flexShrink:0}}>{error}</span>}
    </div>
  );
}
