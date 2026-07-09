// @ts-nocheck
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';

const SIZE = 300; // preview circle diameter px

export default function ImageCropModal({ file, onDone, onCancel }) {
  const [imgUrl, setImgUrl]           = useState(null);
  const [imgNat, setImgNat]           = useState({ w: 1, h: 1 });
  const [scale, setScale]             = useState(1);
  const [offset, setOffset]           = useState({ x: 0, y: 0 });
  const dragging                      = useRef(false);
  const lastPos                       = useRef({ x: 0, y: 0 });
  const lastPinchDist                 = useRef(null);
  const containerRef                  = useRef(null);

  // Load file → object URL
  useEffect(() => {
    if (!file) return;
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      setImgNat({ w: img.naturalWidth, h: img.naturalHeight });
      // Initial scale: cover the circle
      const initScale = SIZE / Math.min(img.naturalWidth, img.naturalHeight);
      setScale(initScale);
      setOffset({ x: 0, y: 0 });
      setImgUrl(url);
    };
    img.src = url;
    return () => URL.revokeObjectURL(url);
  }, [file]);

  // Export cropped circle as JPEG base64
  const handleDone = useCallback(() => {
    if (!imgUrl) return;
    const img = new Image();
    img.onload = () => {
      const OUT = 256;
      const canvas = document.createElement('canvas');
      canvas.width = OUT; canvas.height = OUT;
      const ctx = canvas.getContext('2d');
      // Map circle center back to source image coords
      const srcR  = (SIZE / 2) / scale;          // radius in source px
      const srcCX = imgNat.w / 2 - offset.x / scale;
      const srcCY = imgNat.h / 2 - offset.y / scale;
      ctx.drawImage(img, srcCX - srcR, srcCY - srcR, srcR * 2, srcR * 2, 0, 0, OUT, OUT);
      onDone(canvas.toDataURL('image/jpeg', 0.88));
    };
    img.src = imgUrl;
  }, [imgUrl, imgNat, scale, offset, onDone]);

  // ── Mouse ──────────────────────────────────────────────────────────────
  const onMouseDown = (e) => { dragging.current = true; lastPos.current = { x: e.clientX, y: e.clientY }; };
  const onMouseMove = (e) => {
    if (!dragging.current) return;
    setOffset(o => ({ x: o.x + e.clientX - lastPos.current.x, y: o.y + e.clientY - lastPos.current.y }));
    lastPos.current = { x: e.clientX, y: e.clientY };
  };
  const onMouseUp = () => { dragging.current = false; };

  const onWheel = (e) => {
    e.preventDefault();
    const factor = e.deltaY < 0 ? 1.1 : 0.9;
    setScale(s => Math.max(SIZE / Math.max(imgNat.w, imgNat.h), Math.min(s * factor, 12)));
  };

  // ── Touch ──────────────────────────────────────────────────────────────
  const getTouchDist = (t) => {
    const dx = t[0].clientX - t[1].clientX, dy = t[0].clientY - t[1].clientY;
    return Math.sqrt(dx * dx + dy * dy);
  };
  const onTouchStart = (e) => {
    e.preventDefault();
    if (e.touches.length === 1) {
      dragging.current = true;
      lastPos.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
    } else if (e.touches.length === 2) {
      dragging.current = false;
      lastPinchDist.current = getTouchDist(e.touches);
    }
  };
  const onTouchMove = (e) => {
    e.preventDefault();
    if (e.touches.length === 1 && dragging.current) {
      setOffset(o => ({ x: o.x + e.touches[0].clientX - lastPos.current.x, y: o.y + e.touches[0].clientY - lastPos.current.y }));
      lastPos.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
    } else if (e.touches.length === 2 && lastPinchDist.current) {
      const dist = getTouchDist(e.touches);
      const factor = dist / lastPinchDist.current;
      setScale(s => Math.max(SIZE / Math.max(imgNat.w, imgNat.h), Math.min(s * factor, 12)));
      lastPinchDist.current = dist;
    }
  };
  const onTouchEnd = () => { dragging.current = false; lastPinchDist.current = null; };

  // ── Attach non-passive wheel listener ─────────────────────────────────
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  });

  const imgW = imgNat.w * scale;
  const imgH = imgNat.h * scale;

  return createPortal(
    <div style={{ position:'fixed', inset:0, zIndex:3000, background:'rgba(0,0,0,.88)',
      display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', gap:20 }}>

      {/* Title */}
      <div style={{ fontSize:16, fontWeight:600, color:'#fff', letterSpacing:'-0.01em' }}>
        Move and Scale
      </div>

      {/* Grid lines to help positioning */}
      <div style={{ position:'relative' }}>
        {/* Outer dim ring */}
        <div style={{ position:'absolute', inset: -40, borderRadius:'50%',
          boxShadow:'0 0 0 9999px rgba(0,0,0,.6)', pointerEvents:'none', zIndex:2 }}/>
        {/* Circle crop area */}
        <div
          ref={containerRef}
          style={{ width:SIZE, height:SIZE, borderRadius:'50%', overflow:'hidden',
            position:'relative', cursor: dragging.current ? 'grabbing' : 'grab',
            border:'2.5px solid rgba(255,255,255,.5)', touchAction:'none',
            background:'#111' }}
          onMouseDown={onMouseDown} onMouseMove={onMouseMove}
          onMouseUp={onMouseUp} onMouseLeave={onMouseUp}
          onTouchStart={onTouchStart} onTouchMove={onTouchMove} onTouchEnd={onTouchEnd}
        >
          {imgUrl && (
            <img src={imgUrl} draggable={false}
              style={{ position:'absolute', width:imgW, height:imgH,
                left:'50%', top:'50%',
                transform:`translate(calc(-50% + ${offset.x}px), calc(-50% + ${offset.y}px))`,
                pointerEvents:'none', userSelect:'none', WebkitUserSelect:'none' }}
            />
          )}
        </div>
      </div>

      {/* Zoom slider */}
      <div style={{ display:'flex', alignItems:'center', gap:12 }}>
        <button onClick={() => setScale(s => Math.max(SIZE/Math.max(imgNat.w,imgNat.h), s * 0.85))}
          style={{ width:38, height:38, borderRadius:'50%', background:'rgba(255,255,255,.15)',
            border:'none', color:'#fff', fontSize:24, cursor:'pointer', display:'flex',
            alignItems:'center', justifyContent:'center', lineHeight:1 }}>−</button>
        <input type="range" min={SIZE/Math.max(imgNat.w,imgNat.h)*100} max={1200}
          value={Math.round(scale*100)}
          onChange={e => setScale(Number(e.target.value)/100)}
          style={{ width:140, accentColor:'var(--accent)' }}/>
        <button onClick={() => setScale(s => Math.min(s * 1.15, 12))}
          style={{ width:38, height:38, borderRadius:'50%', background:'rgba(255,255,255,.15)',
            border:'none', color:'#fff', fontSize:24, cursor:'pointer', display:'flex',
            alignItems:'center', justifyContent:'center', lineHeight:1 }}>+</button>
      </div>

      {/* Actions */}
      <div style={{ display:'flex', gap:12 }}>
        <button onClick={onCancel}
          style={{ padding:'11px 32px', background:'rgba(255,255,255,.1)', border:'1px solid rgba(255,255,255,.2)',
            borderRadius:10, color:'#fff', fontSize:14, cursor:'pointer' }}>
          Cancel
        </button>
        <button onClick={handleDone}
          style={{ padding:'11px 32px', background:'var(--accent)', border:'none',
            borderRadius:10, color:'#000', fontSize:14, fontWeight:700, cursor:'pointer' }}>
          Use Photo
        </button>
      </div>
    </div>,
    document.body
  );
}
