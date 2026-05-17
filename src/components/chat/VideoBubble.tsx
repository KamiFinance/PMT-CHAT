// @ts-nocheck
import React, { useRef, useState } from 'react';

export default function VideoBubble({ msg, isOut, contact }) {
  const videoRef = useRef(null);
  const [playing, setPlaying] = useState(false);
  const [errored, setErrored] = useState(false);

  // Prefer direct gateway URL (ipfsUrl) — avoids Vercel proxy hop for faster start
  // Fall back to proxy only if direct URL not available
  const ipfsSrc = msg.ipfsUrl || (msg.ipfsCid ? `/api/ipfs?cid=${msg.ipfsCid}` : null);
  const src = ipfsSrc || msg.localUrl || null;

  const togglePlay = () => {
    const v = videoRef.current;
    if (!v) return;
    if (v.paused) { v.play(); setPlaying(true); }
    else { v.pause(); setPlaying(false); }
  };

  const bubbleBg = isOut ? 'var(--bubble-out)' : 'var(--bubble-in)';

  return (
    <div style={{
      display: 'flex', alignItems: 'flex-end', gap: 8,
      flexDirection: isOut ? 'row-reverse' : 'row',
      marginBottom: 3, animation: 'fadeIn .2s ease',
    }}>
      <div style={{
        maxWidth: 280, borderRadius: 16,
        ...(isOut ? { borderBottomRightRadius: 4 } : { borderBottomLeftRadius: 4 }),
        background: bubbleBg, overflow: 'hidden', position: 'relative',
      }}>
        {src && !errored ? (
          <div style={{ position: 'relative', cursor: 'pointer' }} onClick={togglePlay}>
            <video
              ref={videoRef}
              src={src}
              preload="auto"
              playsInline
              style={{ display: 'block', width: '100%', maxWidth: 280, maxHeight: 200, objectFit: 'cover' }}
              onEnded={() => setPlaying(false)}
              onError={(e)=>{
                const t = e.target as HTMLVideoElement;
                if(ipfsSrc && !t.src.includes('ipfs')) return; // IPFS will handle it
                setErrored(true);
              }}
            />
            {/* Play/pause overlay */}
            {!playing && (
              <div style={{
                position: 'absolute', inset: 0, display: 'flex',
                alignItems: 'center', justifyContent: 'center',
                background: 'rgba(0,0,0,0.3)',
              }}>
                <div style={{
                  width: 48, height: 48, borderRadius: '50%',
                  background: 'rgba(255,255,255,0.9)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  <span style={{ fontSize: 20, marginLeft: 3 }}>▶</span>
                </div>
              </div>
            )}
          </div>
        ) : (
          <div style={{
            width: 220, height: 120, background: 'rgba(0,0,0,0.3)',
            display: 'flex', flexDirection: 'column', alignItems: 'center',
            justifyContent: 'center', gap: 6, padding: 12,
          }}>
            <span style={{ fontSize: 28 }}>🎬</span>
            {msg.ipfsCid && (
              <a href={`/api/ipfs?cid=${msg.ipfsCid}`} download={msg.fileName || 'video'}
                style={{ fontSize: 11, color: isOut ? '#0a0c14' : 'var(--accent)', textDecoration: 'underline' }}>
                Download
              </a>
            )}
          </div>
        )}
        {/* Meta row */}
        <div style={{
          padding: '4px 8px 6px',
          display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 6,
        }}>
          <span style={{ fontFamily: 'var(--mono)', fontSize: 9, color: isOut ? 'rgba(0,0,0,0.45)' : 'var(--muted)', flexShrink: 0 }}>
            {msg.time}
          </span>
        </div>
        {/* Upload progress */}
        {msg.uploading && (
          <div style={{ padding: '0 8px 6px' }}>
            <div style={{ height: 3, background: 'rgba(255,255,255,0.2)', borderRadius: 2 }}>
              <div style={{ height: '100%', width: `${msg.uploadProgress || 30}%`,
                background: isOut ? 'rgba(0,0,0,0.4)' : 'var(--accent)', borderRadius: 2,
                transition: 'width .3s' }}/>
            </div>
            <span style={{ fontSize: 10, color: isOut ? 'rgba(0,0,0,0.5)' : 'var(--muted)' }}>Uploading…</span>
          </div>
        )}
      </div>
    </div>
  );
}
