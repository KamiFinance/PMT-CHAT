// @ts-nocheck
import React, { useState } from 'react';

const URL_RE = /(https?:\/\/[^\s<>"']+|www\.[^\s<>"']+)/gi;
const JOIN_RE = /[?&]join=([a-z0-9]+)/i;

// In-app browser modal
function InAppBrowser({ url, onClose }) {
  const [loaded, setLoaded] = useState(false);
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.75)', zIndex: 300,
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}
      onClick={onClose}>
      <div style={{ background: 'var(--panel)', borderRadius: 16, overflow: 'hidden',
        width: '92vw', maxWidth: 680, height: '80vh', display: 'flex', flexDirection: 'column',
        border: '1px solid var(--border)', animation: 'slideUp .2s ease' }}
        onClick={e => e.stopPropagation()}>
        {/* Topbar */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 12px',
          background: 'var(--surface)', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
          <div style={{ flex: 1, fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--muted)',
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{url}</div>
          <a href={url} target="_blank" rel="noopener noreferrer"
            style={{ fontSize: 11, color: 'var(--accent2)', textDecoration: 'none', flexShrink: 0 }}
            onClick={e => e.stopPropagation()}>
            ↗ Open
          </a>
          <button onClick={onClose}
            style={{ background: 'none', border: 'none', color: 'var(--muted)', fontSize: 18,
              cursor: 'pointer', padding: '0 4px', lineHeight: 1, flexShrink: 0 }}>×</button>
        </div>
        {/* Content */}
        <div style={{ flex: 1, position: 'relative' }}>
          {!loaded && (
            <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center',
              justifyContent: 'center', color: 'var(--muted)', fontSize: 13 }}>Loading…</div>
          )}
          <iframe src={url} style={{ width: '100%', height: '100%', border: 'none' }}
            onLoad={() => setLoaded(true)} sandbox="allow-scripts allow-same-origin allow-forms allow-popups" />
        </div>
      </div>
    </div>
  );
}

export default function LinkifyText({ text, query, onJoinGroup }) {
  const [browserUrl, setBrowserUrl] = useState(null);

  if (!text) return null;

  // Split text into URL and non-URL parts
  const parts = [];
  let last = 0;
  let m;
  const re = new RegExp(URL_RE.source, 'gi');
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) parts.push({ type: 'text', value: text.slice(last, m.index) });
    parts.push({ type: 'url', value: m[0] });
    last = m.index + m[0].length;
  }
  if (last < text.length) parts.push({ type: 'text', value: text.slice(last) });

  const handleUrl = (url) => {
    const full = url.startsWith('http') ? url : 'https://' + url;
    // Group invite link — handle in-app
    const joinMatch = JOIN_RE.exec(full);
    if (joinMatch && onJoinGroup) {
      onJoinGroup(joinMatch[1]);
      return;
    }
    // All other links — open in in-app browser
    setBrowserUrl(full);
  };

  const highlightText = (str) => {
    if (!query || !str) return str;
    const hiParts = str.split(new RegExp(`(${query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi'));
    return hiParts.map((p, i) =>
      p.toLowerCase() === query?.toLowerCase()
        ? <mark key={i} style={{ background: 'var(--accent)', color: '#0a0c14', borderRadius: 2, padding: '0 1px' }}>{p}</mark>
        : p
    );
  };

  return (
    <>
      {parts.map((part, i) => {
        if (part.type === 'text') return <span key={i}>{highlightText(part.value)}</span>;
        const full = part.value.startsWith('http') ? part.value : 'https://' + part.value;
        const isJoin = JOIN_RE.test(full);
        return (
          <span key={i}
            onClick={() => handleUrl(part.value)}
            style={{ color: isJoin ? 'var(--accent3)' : 'var(--accent)', textDecoration: 'underline',
              cursor: 'pointer', wordBreak: 'break-all' }}>
            {isJoin ? '🔗 ' : ''}{part.value}
          </span>
        );
      })}
      {browserUrl && <InAppBrowser url={browserUrl} onClose={() => setBrowserUrl(null)} />}
    </>
  );
}
