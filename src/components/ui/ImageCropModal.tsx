// @ts-nocheck
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';

const SIZE = 300; // preview circle diameter px

export default function ImageCropModal({ file, onDone, onCancel }) {
  const [imgUrl, setImgUrl]   = useState(null);
  const [imgNat, setImgNat]   = useState({ w: 1, h: 1 });
  const [scale, setScale]     = useState(1);
  const [offset, setOffset]   = useState({ x: 0, y: 0 });
  const dragging               = useRef(false);
  const lastPos                = useRef({ x: 0, y: 0 });
  const lastPinchDist          = useRef(null);
  const containerRef           = useRef(null);

  // ── Clamp offset so the image always fully covers the circle ──────────
  const clamp = useCallback((ox, oy, sc, nat) => {
    const imgW = nat.w * sc;
    const imgH = nat.h * sc;
    const maxX = Math.max(0, (imgW - SIZE) / 2);
    const maxY = Math.max(0, (imgH - SIZE) / 2);
    return {
      x: Math.max(-maxX, Math.min(maxX, ox)),
      y: Math.max(-maxY, Math.min(maxY, oy)),
    };
  }, []);

  // ── Load file ─────────────────────────────────────────────────────────
  useEffect(() => {
    if (!file) return;
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const nat = { w: img.naturalWidth, h: img.naturalHeight };
      setImgNat(nat);
      const initScale = SIZE / Math.min(nat.w, nat.h);
      setScale(initScale);
      setOffset({ x: 0, y: 0 });
      setImgUrl(url);
    };
    img.src = url;
    return () => URL.revokeObjectURL(url);
  }, [file]);

  // ── Export crop ───────────────────────────────────────────────────────
  const handleDone = useCallback(() => {
    if (!imgUrl) return;
    const img = new Image();
    img.onload = () => {
      const OUT = 256;
      const canvas = document.createElement('canvas');
      canvas.width = OUT; canvas.height = OUT;
      const ctx = canvas.getContext('2d');
      // What's visible in the circle → map to source image coords
      const srcR  = (SIZE / 2) / scale;
      const srcCX = imgNat.w / 2 - offset.x / scale;
      const srcCY = imgNat.h / 2 - offset.y / scale;
      ctx.drawImage(img, srcCX - srcR, srcCY - srcR, srcR * 2, srcR * 2, 0, 0, OUT, OUT);
      onDone(canvas.toDataURL('image/jpeg', 0.88));
    };
    img.src = imgUrl;
  }, [imgUrl, imgNat, scale, offset, onDone]);

  // ── Mouse ─────────────────────────────────────────────────────────────
  const onMouseDown = (e) => { dragging.current = true; lastPos.current = { x: e.clientX, y: e.clientY }; };
  const onMouseMove = (e) => {
    if (!dragging.current) return;
    const nx = offset.x + e.clientX - lastPos.current.x;
    const ny = offset.y + e.clientY - lastPos.current.y;
    setOffset(clamp(nx, ny, scale, imgNat));
    lastPos.current = { x: e.clientX, y: e.clientY };
  };
  const onMouseUp = () => { dragging.current = false; };

  const onWheel = (e) => {
    e.preventDefault();
    const factor = e.deltaY < 0 ? 1.1 : 0.9;
    setScale(s => {
      const minS = SIZE / Math.min(imgNat.w, imgNat.h);
      const newS = Math.max(minS, Math.min(s * factor, 12));
      setOffset(o => clamp(o.x, o.y, newS, imgNat));
      return newS;
    });
  };

  // ── Touch ─────────────────────────────────────────────────────────────
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
      const nx = offset.x + e.touches[0].clientX - lastPos.current.x;
      const ny = offset.y + e.touches[0].clientY - lastPos.current.y;
      setOffset(clamp(nx, ny, scale, imgNat));
      lastPos.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
    } else if (e.touches.length === 2 && lastPinchDist.current) {
      const dist = getTouchDist(e.touches);
      const factor = dist / lastPinchDist.current;
      setScale(s => {
        const minS = SIZE / Math.min(imgNat.w, imgNat.h);
        const newS = Math.max(minS, Math.min(s * factor, 12));
        setOffset(o => clamp(o.x, o.y, newS, imgNat));
        return newS;
      });
      lastPinchDist.current = dist;
    }
  };
  const onTouchEnd = () => { dragging.current = false; lastPinchDist.current = null; };

  // ── Non-passive wheel listener ────────────────────────────────────────
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  });

  const imgW = imgNat.w * scale;
  const imgH = imgNat.h * scale;
  const minScale = SIZE / Math.min(imgNat.w, imgNat.h);

  const setScaleAndClamp = (newS) => {
    const clamped = Math.max(minScale, Math.min(newS, 12));
    setScale(clamped);
    setOffset(o => clamp(o.x, o.y, clamped, imgNat));
  };

  return createPortal(
    <div style={{ position:'fixed', inset:0, zIndex:3000, background:'rgba(0,0,0,.92)',
      display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', gap:20,
      padding:16 }}>

      <div style={{ fontSize:16, fontWeight:600, color:'#fff' }}>Move and Scale</div>
      <div style={{ fontSize:12, color:'rgba(255,255,255,.45)', marginTop:-12 }}>
        Drag to reposition · Scroll or pinch to zoom
      </div>

      {/* Circle preview */}
      <div style={{ position:'relative' }}>
        {/* Shade outside the circle */}
        <div style={{ position:'absolute', inset:-60, borderRadius:'50%',
          boxShadow:'0 0 0 9999px rgba(0,0,0,.55)', pointerEvents:'none', zIndex:2 }}/>
        <div
          ref={containerRef}
          style={{ width:SIZE, height:SIZE, borderRadius:'50%', overflow:'hidden',
            position:'relative', cursor: dragging.current ? 'grabbing' : 'grab',
            border:'2.5px solid rgba(255,255,255,.6)', touchAction:'none', background:'#111' }}
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

      {/* Zoom controls */}
      <div style={{ display:'flex', alignItems:'center', gap:12 }}>
        <button onClick={() => setScaleAndClamp(scale * 0.85)}
          style={{ width:38, height:38, borderRadius:'50%', background:'rgba(255,255,255,.15)',
            border:'none', color:'#fff', fontSize:24, cursor:'pointer',
            display:'flex', alignItems:'center', justifyContent:'center' }}>−</button>
        <input type="range"
          min={Math.round(minScale * 100)} max={1200}
          value={Math.round(scale * 100)}
          onChange={e => setScaleAndClamp(Number(e.target.value) / 100)}
          style={{ width:140, accentColor:'var(--accent,#faff63)' }}/>
        <button onClick={() => setScaleAndClamp(scale * 1.15)}
          style={{ width:38, height:38, borderRadius:'50%', background:'rgba(255,255,255,.15)',
            border:'none', color:'#fff', fontSize:24, cursor:'pointer',
            display:'flex', alignItems:'center', justifyContent:'center' }}>+</button>
      </div>

      {/* Actions */}
      <div style={{ display:'flex', gap:12 }}>
        <button onClick={onCancel}
          style={{ padding:'11px 32px', background:'rgba(255,255,255,.1)',
            border:'1px solid rgba(255,255,255,.2)', borderRadius:10,
            color:'#fff', fontSize:14, cursor:'pointer' }}>
          Cancel
        </button>
        <button onClick={handleDone}
          style={{ padding:'11px 32px', background:'var(--accent,#faff63)',
            border:'none', borderRadius:10, color:'#000',
            fontSize:14, fontWeight:700, cursor:'pointer' }}>
          Use Photo
        </button>
      </div>
    </div>,
    document.body
  );
}
