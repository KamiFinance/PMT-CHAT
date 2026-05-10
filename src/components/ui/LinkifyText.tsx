// @ts-nocheck
import React, { useState, useEffect, useRef } from 'react';

function normalizeUrl(raw) {
  if (/^https?:\/\//i.test(raw)) return raw;
  return 'https://' + raw;
}

const URL_RE = /(?:https?:\/\/|www\.)[^\s<>"')\]]+|(?<![/@\w])([a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?\.(?:com|org|net|io|app|co|ai|dev|xyz|info|me|gg|tv|us|uk|de|fr|nl|es|ca|au|club|online|store|shop|tech|site|web|link)(?:\/[^\s<>"')\]]*)?)/g;
const JOIN_RE = /[?&]join=([a-z0-9]+)/i;

// In-app browser using server-side proxy
function InAppBrowser({ url, onClose }) {
  const [currentUrl, setCurrentUrl] = useState(url);
  const [title, setTitle] = useState('');
  const [loading, setLoading] = useState(true);
  const iframeRef = useRef(null);

  const proxyUrl = `/api/proxy?url=${encodeURIComponent(currentUrl)}`;

  useEffect(() => {
    const handler = (e) => {
      if (e.data?.type === 'proxy-navigate') setCurrentUrl(e.data.url);
      if (e.data?.type === 'proxy-title') setTitle(e.data.title);
    };
    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, []);

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.85)', zIndex: 300,
      display: 'flex', flexDirection: 'column' }} onClick={onClose}>
      <div style={{ display: 'flex', flexDirection: 'column', background: 'var(--panel)',
        borderRadius: '0 0 0 0', flex: 1, overflow: 'hidden', margin: '0',
        maxWidth: '100vw' }} onClick={e => e.stopPropagation()}>

        {/* Browser chrome */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px',
          background: 'var(--surface)', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
          <button onClick={onClose}
            style={{ background: 'none', border: 'none', color: 'var(--muted)', fontSize: 20,
              cursor: 'pointer', padding: '0 6px', lineHeight: 1, flexShrink: 0 }}>×</button>
          <div style={{ flex: 1, background: 'var(--bg)', border: '1px solid var(--border)',
            borderRadius: 8, padding: '5px 10px', display: 'flex', alignItems: 'center', gap: 6,
            minWidth: 0 }}>
            {loading && <span style={{ fontSize: 11, color: 'var(--muted)' }}>⏳</span>}
            <span style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--text2)',
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>
              {title || currentUrl}
            </span>
          </div>
          <a href={currentUrl} target="_blank" rel="noopener noreferrer"
            onClick={e => e.stopPropagation()}
            style={{ fontSize: 11, color: 'var(--accent2)', textDecoration: 'none',
              flexShrink: 0, padding: '4px 8px', background: 'var(--surface)',
              border: '1px solid var(--border)', borderRadius: 6 }}>
            ↗
          </a>
        </div>

        {/* Page content via proxy */}
        <div style={{ flex: 1, position: 'relative' }}>
          {loading && (
            <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center',
              justifyContent: 'center', flexDirection: 'column', gap: 12, color: 'var(--muted)' }}>
              <div style={{ fontSize: 24 }}>⏳</div>
              <div style={{ fontSize: 13 }}>Loading {currentUrl.replace(/^https?:\/\//, '').slice(0, 40)}…</div>
            </div>
          )}
          <iframe
            ref={iframeRef}
            key={currentUrl}
            src={proxyUrl}
            style={{ width: '100%', height: '100%', border: 'none',
              opacity: loading ? 0 : 1, transition: 'opacity .2s' }}
            onLoad={() => setLoading(false)}
            onError={() => setLoading(false)}
          />
        </div>
      </div>
    </div>
  );
}

// Small link preview card (like WhatsApp/Telegram)
function LinkPreview({ url }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    fetch(`/api/preview?url=${encodeURIComponent(url)}`, { signal: controller.signal })
      .then(r => r.json())
      .then(d => { setData(d); setLoading(false); })
      .catch(() => setLoading(false));
    return () => controller.abort();
  }, [url]);

  if (loading) return (
    <div style={{ marginTop: 6, padding: '8px 10px', background: 'rgba(255,255,255,.03)',
      border: '1px solid var(--border)', borderRadius: 8, fontSize: 11, color: 'var(--muted)' }}>
      Loading preview…
    </div>
  );
  if (!data || (!data.title && !data.image)) return null;

  return (
    <>
      <div onClick={e => { e.stopPropagation(); setOpen(true); }}
        style={{ marginTop: 6, borderRadius: 10, overflow: 'hidden',
          background: 'rgba(255,255,255,.04)', border: '1px solid var(--border)',
          cursor: 'pointer', transition: 'opacity .15s' }}
        onMouseEnter={e => e.currentTarget.style.opacity = '.8'}
        onMouseLeave={e => e.currentTarget.style.opacity = '1'}>
        {data.image && (
          <img src={data.image} alt="" onError={e => { e.target.style.display='none'; }}
            style={{ width: '100%', maxHeight: 140, objectFit: 'cover', display: 'block' }} />
        )}
        <div style={{ padding: '8px 10px 10px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 3 }}>
            {data.favicon && <img src={data.favicon} alt="" style={{ width: 13, height: 13, borderRadius: 2 }} onError={e => e.target.style.display='none'} />}
            <span style={{ fontSize: 10, color: 'var(--muted)', fontFamily: 'var(--mono)' }}>{data.domain}</span>
          </div>
          {data.title && <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', marginBottom: 2, lineHeight: 1.3 }}>{data.title}</div>}
          {data.description && <div style={{ fontSize: 11, color: 'var(--text2)', lineHeight: 1.4, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>{data.description}</div>}
        </div>
      </div>
      {open && <InAppBrowser url={url} onClose={() => setOpen(false)} />}
    </>
  );
}

export default function LinkifyText({ text, query, onJoinGroup }) {
  const [browserUrl, setBrowserUrl] = useState(null);
  if (!text) return null;

  const parts = [];
  let last = 0, m;
  const re = new RegExp(URL_RE.source, 'gi');
  const firstUrl = { ref: null };

  while ((m = re.exec(text)) !== null) {
    if (m.index > last) parts.push({ type: 'text', value: text.slice(last, m.index) });
    parts.push({ type: 'url', value: m[0] });
    if (!firstUrl.ref && !JOIN_RE.test(normalizeUrl(m[0]))) firstUrl.ref = normalizeUrl(m[0]);
    last = m.index + m[0].length;
  }
  if (last < text.length) parts.push({ type: 'text', value: text.slice(last) });

  const highlight = (str) => {
    if (!query || !str) return str;
    return str.split(new RegExp(`(${query.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')})`, 'gi'))
      .map((p, i) => p.toLowerCase() === query?.toLowerCase()
        ? <mark key={i} style={{ background:'var(--accent)',color:'#0a0c14',borderRadius:2,padding:'0 1px' }}>{p}</mark>
        : p);
  };

  return (
    <>
      <span>
        {parts.map((part, i) => {
          if (part.type === 'text') return <span key={i}>{highlight(part.value)}</span>;
          const full = normalizeUrl(part.value);
          const joinMatch = JOIN_RE.exec(full);
          if (joinMatch && onJoinGroup) return (
            <span key={i} onClick={e => { e.stopPropagation(); onJoinGroup(joinMatch[1]); }}
              style={{ color:'var(--accent3)',textDecoration:'underline',cursor:'pointer',wordBreak:'break-all' }}>
              🔗 {part.value}
            </span>
          );
          return (
            <span key={i} onClick={e => { e.stopPropagation(); setBrowserUrl(full); }}
              style={{ color:'var(--accent)',textDecoration:'underline',cursor:'pointer',wordBreak:'break-all' }}>
              {part.value}
            </span>
          );
        })}
      </span>
      {firstUrl.ref && <LinkPreview url={firstUrl.ref} />}
      {browserUrl && <InAppBrowser url={browserUrl} onClose={() => setBrowserUrl(null)} />}
    </>
  );
}
