// @ts-nocheck
import React, { useState, useEffect } from 'react';

// Normalize URL — add https:// if missing
function normalizeUrl(raw: string): string {
  if (/^https?:\/\//i.test(raw)) return raw;
  return 'https://' + raw;
}

// Detect URLs including bare domains like publicmasterpiece.com
const URL_RE = /(?:https?:\/\/|www\.)[^\s<>"')\]]+|(?<![/@\w])([a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?\.(?:com|org|net|io|app|co|ai|dev|xyz|info|me|gg|tv|us|uk|de|fr|nl|es|ca|au|club|online|store|shop|tech|site|web|link)(?:\/[^\s<>"')\]]*)?)/g;
const JOIN_RE = /[?&]join=([a-z0-9]+)/i;

// Link preview card
function LinkPreview({ url, isOut }) {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const controller = new AbortController();
    fetch(`/api/preview?url=${encodeURIComponent(url)}`, { signal: controller.signal })
      .then(r => r.json())
      .then(d => { setData(d); setLoading(false); })
      .catch(() => setLoading(false));
    return () => controller.abort();
  }, [url]);

  if (loading) return (
    <div style={{ marginTop: 8, borderRadius: 10, overflow: 'hidden',
      background: 'rgba(255,255,255,.04)', border: '1px solid var(--border)',
      padding: '10px 12px', fontSize: 11, color: 'var(--muted)', fontStyle: 'italic' }}>
      Loading preview…
    </div>
  );
  if (!data || (!data.title && !data.image)) return null;

  return (
    <a href={url} target="_blank" rel="noopener noreferrer"
      style={{ display: 'block', marginTop: 8, borderRadius: 10, overflow: 'hidden',
        background: 'rgba(255,255,255,.04)', border: '1px solid var(--border)',
        textDecoration: 'none', cursor: 'pointer' }}
      onClick={e => e.stopPropagation()}>
      {data.image && (
        <img src={data.image} alt="" onError={e => { (e.target as any).style.display = 'none'; }}
          style={{ width: '100%', maxHeight: 160, objectFit: 'cover', display: 'block' }}/>
      )}
      <div style={{ padding: '8px 12px 10px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 4 }}>
          {data.favicon && <img src={data.favicon} alt="" style={{ width: 14, height: 14, borderRadius: 2 }} onError={e => { (e.target as any).style.display = 'none'; }}/>}
          <span style={{ fontSize: 10, color: 'var(--muted)', fontFamily: 'var(--mono)' }}>{data.domain}</span>
        </div>
        {data.title && <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', marginBottom: 3, lineHeight: 1.3 }}>{data.title}</div>}
        {data.description && <div style={{ fontSize: 11, color: 'var(--text2)', lineHeight: 1.4, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>{data.description}</div>}
      </div>
    </a>
  );
}

export default function LinkifyText({ text, query, onJoinGroup, isOut }) {
  if (!text) return null;

  // Split text into URL and non-URL parts
  const parts: {type: string, value: string}[] = [];
  let last = 0;
  let m;
  const re = new RegExp(URL_RE.source, 'gi');
  const urls: string[] = [];

  while ((m = re.exec(text)) !== null) {
    if (m.index > last) parts.push({ type: 'text', value: text.slice(last, m.index) });
    parts.push({ type: 'url', value: m[0] });
    urls.push(normalizeUrl(m[0]));
    last = m.index + m[0].length;
  }
  if (last < text.length) parts.push({ type: 'text', value: text.slice(last) });

  const highlightText = (str: string) => {
    if (!query || !str) return str;
    const hParts = str.split(new RegExp(`(${query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi'));
    return hParts.map((p, i) =>
      p.toLowerCase() === query?.toLowerCase()
        ? <mark key={i} style={{ background: 'var(--accent)', color: '#0a0c14', borderRadius: 2, padding: '0 1px' }}>{p}</mark>
        : p
    );
  };

  return (
    <>
      <span>
        {parts.map((part, i) => {
          if (part.type === 'text') return <span key={i}>{highlightText(part.value)}</span>;
          const full = normalizeUrl(part.value);
          const joinMatch = JOIN_RE.exec(full);
          const isJoin = !!joinMatch;

          if (isJoin && onJoinGroup) {
            return (
              <span key={i}
                onClick={(e) => { e.stopPropagation(); onJoinGroup(joinMatch![1]); }}
                style={{ color: 'var(--accent3)', textDecoration: 'underline', cursor: 'pointer', wordBreak: 'break-all' }}>
                🔗 {part.value}
              </span>
            );
          }

          return (
            <a key={i} href={full} target="_blank" rel="noopener noreferrer"
              onClick={e => e.stopPropagation()}
              style={{ color: 'var(--accent)', textDecoration: 'underline', cursor: 'pointer', wordBreak: 'break-all' }}>
              {part.value}
            </a>
          );
        })}
      </span>
      {/* Show preview card for the first non-join URL */}
      {urls.filter(u => !JOIN_RE.test(u)).slice(0, 1).map((url, i) => (
        <LinkPreview key={i} url={url} isOut={isOut} />
      ))}
    </>
  );
}
