// @ts-nocheck
import React, { useState, useRef, useEffect, useCallback } from 'react';

interface CustomSticker {
  id: string;
  url: string;
  title: string;
  createdAt: number;
}

const STORAGE_KEY = 'pmt_custom_stickers';

export function loadCustomStickers(): CustomSticker[] {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]'); } catch { return []; }
}

function saveCustomSticker(s: CustomSticker) {
  const all = loadCustomStickers();
  const updated = [s, ...all].slice(0, 50); // max 50 custom stickers
  localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
}

export function deleteCustomSticker(id: string) {
  const all = loadCustomStickers().filter(s => s.id !== id);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(all));
}

interface Props {
  onDone: (sticker: CustomSticker) => void;
  onClose: () => void;
}

export default function CustomStickerCreator({ onDone, onClose }: Props) {
  const [img, setImg] = useState<HTMLImageElement | null>(null);
  const [caption, setCaption] = useState('');
  const [shape, setShape] = useState<'square' | 'circle'>('square');
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  // Draw image on canvas whenever img/shape/caption changes
  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || !img) return;
    const SIZE = 512;
    canvas.width = SIZE; canvas.height = SIZE;
    const ctx = canvas.getContext('2d')!;
    ctx.clearRect(0, 0, SIZE, SIZE);

    // Clip shape
    ctx.save();
    if (shape === 'circle') {
      ctx.beginPath();
      ctx.arc(SIZE/2, SIZE/2, SIZE/2, 0, Math.PI*2);
      ctx.clip();
    } else {
      ctx.beginPath();
      ctx.roundRect(0, 0, SIZE, SIZE, 48);
      ctx.clip();
    }

    // Center-crop image to square
    const s = Math.min(img.naturalWidth, img.naturalHeight);
    const sx = (img.naturalWidth - s) / 2;
    const sy = (img.naturalHeight - s) / 2;
    ctx.drawImage(img, sx, sy, s, s, 0, 0, SIZE, SIZE);
    ctx.restore();

    // Caption overlay
    if (caption.trim()) {
      const fSize = Math.max(28, Math.min(48, SIZE / (caption.length * 0.6)));
      ctx.font = `bold ${fSize}px -apple-system, sans-serif`;
      ctx.textAlign = 'center';
      const metrics = ctx.measureText(caption);
      const tw = metrics.width + 32;
      const th = fSize + 20;
      const ty = SIZE - 28;
      // Semi-transparent pill background
      ctx.fillStyle = 'rgba(0,0,0,0.55)';
      const rx = SIZE/2 - tw/2;
      ctx.beginPath();
      ctx.roundRect(rx, ty - th + 8, tw, th, th/2);
      ctx.fill();
      // Text
      ctx.fillStyle = '#fff';
      ctx.fillText(caption, SIZE/2, ty);
    }
  }, [img, shape, caption]);

  useEffect(() => { draw(); }, [draw]);

  const onFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setError('');
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => setImg(image);
    image.onerror = () => setError('Could not load image.');
    image.src = url;
  };

  const handleCreate = async () => {
    const canvas = canvasRef.current;
    if (!canvas || !img) return;
    setUploading(true); setError('');
    try {
      // Export canvas as blob
      const blob: Blob = await new Promise((res, rej) =>
        canvas.toBlob(b => b ? res(b) : rej(new Error('Canvas export failed')), 'image/png', 0.92)
      );
      // Read as base64
      const b64: string = await new Promise((res, rej) => {
        const reader = new FileReader();
        reader.onload = () => res((reader.result as string).split(',')[1]);
        reader.onerror = () => rej(new Error('Read failed'));
        reader.readAsDataURL(blob);
      });
      // Upload to Pinata
      const r = await fetch('/api/pinata-upload', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ data: b64, name: `sticker-${Date.now()}.png`, mimeType: 'image/png' }),
      });
      if (!r.ok) throw new Error('Upload failed');
      const { url } = await r.json();
      const sticker: CustomSticker = { id: 'cs-' + Date.now(), url, title: caption || 'My Sticker', createdAt: Date.now() };
      saveCustomSticker(sticker);
      onDone(sticker);
    } catch (e: any) {
      setError(e?.message || 'Failed to create sticker.');
    } finally {
      setUploading(false);
    }
  };

  return (
    <div style={{ display:'flex', flexDirection:'column', height:'100%', padding:'12px 14px', gap:10, overflowY:'auto' }}>
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', flexShrink:0 }}>
        <span style={{ fontFamily:'var(--sans)', fontSize:14, fontWeight:700, color:'var(--text)' }}>Create Sticker</span>
        <button onClick={onClose} style={{ background:'none', border:'none', cursor:'pointer',
          color:'var(--muted)', fontSize:18, padding:0, lineHeight:1 }}>✕</button>
      </div>

      {/* Upload / Preview area */}
      <div
        onClick={() => !img && fileRef.current?.click()}
        style={{ flexShrink:0, width:'100%', aspectRatio:'1', maxHeight:200, borderRadius:16,
          border: img ? 'none' : '2px dashed var(--border)', background:'var(--surface2)',
          display:'flex', alignItems:'center', justifyContent:'center',
          cursor: img ? 'default' : 'pointer', overflow:'hidden', position:'relative' }}>
        {img
          ? <canvas ref={canvasRef} style={{ width:'100%', height:'100%', display:'block', borderRadius:14 }}/>
          : <div style={{ textAlign:'center', color:'var(--muted)', fontFamily:'var(--sans)', fontSize:13 }}>
              <div style={{ fontSize:32, marginBottom:6 }}>🖼</div>
              Tap to upload image
            </div>
        }
        {img && (
          <button onClick={e=>{e.stopPropagation();fileRef.current?.click();}}
            style={{ position:'absolute', top:6, right:6, background:'rgba(0,0,0,.55)',
              border:'none', borderRadius:20, color:'#fff', fontSize:11, fontFamily:'var(--sans)',
              padding:'3px 10px', cursor:'pointer' }}>Change</button>
        )}
      </div>
      <input ref={fileRef} type="file" accept="image/*" style={{display:'none'}} onChange={onFile}/>

      {img && (<>
        {/* Shape toggle */}
        <div style={{ display:'flex', gap:8, flexShrink:0 }}>
          {(['square','circle'] as const).map(s=>(
            <button key={s} onClick={()=>setShape(s)}
              style={{ flex:1, padding:'7px 0', borderRadius:20, border:'none', cursor:'pointer',
                fontFamily:'var(--sans)', fontSize:12, fontWeight:600, transition:'all .15s',
                background: shape===s ? 'var(--accent)' : 'var(--surface)',
                color: shape===s ? '#fff' : 'var(--muted)' }}>
              {s==='square' ? '⬛ Square' : '⬤ Circle'}
            </button>
          ))}
        </div>

        {/* Caption */}
        <input value={caption} onChange={e=>setCaption(e.target.value)}
          placeholder="Add caption (optional)"
          maxLength={30}
          style={{ flexShrink:0, background:'var(--surface)', border:'1px solid var(--border)',
            borderRadius:20, padding:'8px 14px', color:'var(--text)',
            fontFamily:'var(--sans)', fontSize:13, outline:'none' }}/>

        {/* Create button */}
        <button onClick={handleCreate} disabled={uploading}
          style={{ flexShrink:0, padding:'10px 0', background: uploading?'var(--surface)':'var(--accent)',
            border:'none', borderRadius:22, color: uploading?'var(--muted)':'#fff',
            fontFamily:'var(--sans)', fontSize:13, fontWeight:700, cursor: uploading?'not-allowed':'pointer',
            transition:'all .15s' }}>
          {uploading ? '⏳ Creating…' : '✨ Create Sticker'}
        </button>
      </>)}

      {error && <span style={{ color:'var(--danger)', fontFamily:'var(--sans)', fontSize:12, flexShrink:0 }}>{error}</span>}
    </div>
  );
}
