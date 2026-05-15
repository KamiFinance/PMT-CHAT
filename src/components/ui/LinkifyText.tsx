// @ts-nocheck
import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import InAppBrowser from './InAppBrowser';
import Twemoji from './Twemoji';

function normalizeUrl(raw) {
  if (/^https?:\/\//i.test(raw)) return raw;
  return 'https://' + raw;
}

// Match emoji characters (covers most common emoji ranges)
const EMOJI_RE = /\p{Emoji_Presentation}|\p{Emoji}\uFE0F/gu;

// Render a text string with emojis replaced by Apple emoji images
function renderTextWithEmoji(text: string, baseKey: string) {
  if (!text) return null;
  const result: React.ReactNode[] = [];
  let last = 0;
  let m: RegExpExecArray | null;
  const re = new RegExp(EMOJI_RE.source, 'gu');
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) result.push(<span key={`t${baseKey}${last}`}>{text.slice(last, m.index)}</span>);
    result.push(<Twemoji key={`e${baseKey}${m.index}`} emoji={m[0]} size={18} style={{margin:'0 0.5px',verticalAlign:'-3px'}}/>);
    last = m.index + m[0].length;
  }
  if (last < text.length) result.push(<span key={`t${baseKey}${last}`}>{text.slice(last)}</span>);
  return result.length === 1 && typeof result[0] === 'object' && (result[0] as any).type === 'span'
    ? text // only plain text — return as-is for highlight() to process
    : result;
}

const URL_RE = /(?:https?:\/\/|www\.)[^\s<>"')\]]+|(?<![/@\w])([a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?\.(?:com|org|net|io|app|co|ai|dev|xyz|info|me|gg|tv|us|uk|de|fr|nl|es|ca|au|club|online|store|shop|tech|site|web|link)(?:\/[^\s<>"')\]]*)?)/g;
const JOIN_RE = /[?&]join=([a-z0-9]+)/i;


// Small link preview card (like WhatsApp/Telegram)
function LinkPreview({ url, isOut = true }) {
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
      border: '1px solid var(--border)', borderRadius: 8, fontSize: 11, color: isOut ? 'rgba(0,0,0,0.45)' : 'rgba(250,255,99,0.6)' }}>
      Loading preview…
    </div>
  );
  if (!data || (!data.title && !data.image)) return null;

  return (
    <>
      <div onClick={e => { e.stopPropagation(); setOpen(true); }}
        style={{ marginTop: 6, borderRadius: 10, overflow: 'hidden',
          background: 'rgba(0,0,0,0.1)', border: 'none',
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
            <span style={{ fontSize: 10, color: isOut ? 'rgba(0,0,0,0.5)' : '#faff63', fontFamily: 'var(--mono)' }}>{data.domain}</span>
          </div>
          {data.title && <div style={{ fontSize: 13, fontWeight: 600, color: isOut ? 'rgba(0,0,0,0.85)' : '#faff63', marginBottom: 2, lineHeight: 1.3 }}>{data.title}</div>}
          {data.description && <div style={{ fontSize: 11, color: isOut ? 'rgba(0,0,0,0.6)' : 'rgba(250,255,99,0.75)', lineHeight: 1.4, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>{data.description}</div>}
        </div>
      </div>
      {open && createPortal(<InAppBrowser url={url} onClose={() => setOpen(false)} />, document.body)}
    </>
  );
}


// Group invite link preview card
function GroupLinkPreview({ linkId, onJoinGroup, isOut = true }) {
  const [data, setData] = React.useState(null);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    const controller = new AbortController();
    fetch(`/api/groups?link=${encodeURIComponent(linkId)}`, { signal: controller.signal })
      .then(r => r.json())
      .then(d => { setData(d); setLoading(false); })
      .catch(() => setLoading(false));
    return () => controller.abort();
  }, [linkId]);

  if (loading) return (
    <div style={{ marginTop: 6, padding: '8px 10px', background: 'rgba(0,0,0,0.1)',
      border: 'none', borderRadius: 10, fontSize: 11, color: isOut ? 'rgba(0,0,0,0.5)' : 'rgba(250,255,99,0.7)' }}>
      Loading group info…
    </div>
  );
  if (!data || data.error || !data.group) return null;

  const g = data.group;
  return (
    <div onClick={e => { e.stopPropagation(); onJoinGroup && onJoinGroup(linkId); }}
      style={{ marginTop: 8, borderRadius: 12, overflow: 'hidden',
        background: 'rgba(0,0,0,0.1)',
        border: 'none', cursor: 'pointer', transition: 'opacity .15s' }}
      onMouseEnter={e => e.currentTarget.style.opacity = '.85'}
      onMouseLeave={e => e.currentTarget.style.opacity = '1'}>
      {/* Group header with avatar */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px' }}>
        {g.avatarUrl ? (
          <img src={g.avatarUrl} alt={g.name}
            style={{ width: 48, height: 48, borderRadius: '50%', objectFit: 'cover', flexShrink: 0,
              border: '2px solid rgba(0,0,0,0.08)' }} />
        ) : (
          <div style={{ width: 48, height: 48, borderRadius: '50%', flexShrink: 0, display: 'flex',
            alignItems: 'center', justifyContent: 'center', fontSize: 20, fontWeight: 700,
            background: 'rgba(0,0,0,0.08)', border: '2px solid rgba(0,0,0,0.06)', color: 'rgba(0,0,0,0.5)' }}>
            {g.name?.slice(0, 1).toUpperCase() || '#'}
          </div>
        )}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: isOut ? '#000' : '#faff63', marginBottom: 2 }}>{g.name}</div>
          {g.bio && <div style={{ fontSize: 12, color: isOut ? 'rgba(0,0,0,0.55)' : 'rgba(250,255,99,0.75)', overflow: 'hidden',
            textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{g.bio}</div>}
        </div>
      </div>
      {/* Footer: member count + join CTA */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '8px 14px 12px', borderTop: '1px solid rgba(0,0,0,0.08)' }}>
        <div style={{ display: 'flex', gap: 12, fontSize: 11, color: isOut ? 'rgba(0,0,0,0.45)' : 'rgba(250,255,99,0.6)' }}>
          <span>👥 {g.memberCount} member{g.memberCount !== 1 ? 's' : ''}</span>
          {data.minPMT > 0 && <span>◈ {data.minPMT} PMT required</span>}
        </div>
        <div style={{ fontSize: 11, fontWeight: 600, color: '#faff63',
          background: 'rgba(0,0,0,0.75)', border: 'none',
          borderRadius: 6, padding: '3px 10px' }}>
          Join Group
        </div>
      </div>
    </div>
  );
}

export default function LinkifyText({ text, query, onJoinGroup, isOut = true }) {
  const [browserUrl, setBrowserUrl] = useState(null);
  if (!text) return null;

  const parts = [];
  const joinIds: string[] = [];
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
          if (part.type === 'text') {
            // Split out [PMT] logo tokens first
            const segments = part.value.split('[PMT]');
            const nodes: React.ReactNode[] = [];
            segments.forEach((seg, si) => {
              if (si > 0) nodes.push(<img key={`pmt${i}-${si}`} src="/pmt-logo.png" style={{width:18,height:18,borderRadius:'50%',objectFit:'cover',verticalAlign:'middle',margin:'0 1px',display:'inline'}}/>);
              if (seg) {
                // Render each text segment with Apple emoji images
                const withEmoji = renderTextWithEmoji(seg, `${i}-${si}`);
                if (Array.isArray(withEmoji)) {
                  nodes.push(...withEmoji);
                } else {
                  nodes.push(<span key={`s${i}-${si}`}>{highlight(seg)}</span>);
                }
              }
            });
            return <span key={i}>{nodes}</span>;
          }
          const full = normalizeUrl(part.value);
          const joinMatch = JOIN_RE.exec(full);
          if (joinMatch && onJoinGroup) {
            if (!joinIds.includes(joinMatch[1])) joinIds.push(joinMatch[1]);
            return (
              <span key={i} onClick={e => { e.stopPropagation(); onJoinGroup(joinMatch[1]); }}
                style={{ color: isOut ? 'rgba(0,0,0,0.7)' : 'var(--accent3)',textDecoration:'underline',cursor:'pointer',wordBreak:'break-all' }}>
                🔗 {part.value}
              </span>
            );
          }
          return (
            <span key={i} onClick={e => { e.stopPropagation(); setBrowserUrl(full); }}
              style={{ color: isOut ? 'rgba(0,0,0,0.7)' : 'var(--accent)', textDecoration:'underline',cursor:'pointer',wordBreak:'break-all' }}>
              {part.value}
            </span>
          );
        })}
      </span>
      {firstUrl.ref && <LinkPreview url={firstUrl.ref} isOut={isOut} />}
      {joinIds.map(id => <GroupLinkPreview key={id} linkId={id} onJoinGroup={onJoinGroup} isOut={isOut} />)}
      {browserUrl && createPortal(<InAppBrowser url={browserUrl} onClose={() => setBrowserUrl(null)} />, document.body)}
    </>
  );
}
