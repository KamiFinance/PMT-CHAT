// @ts-nocheck
import React, { useState, useEffect, useRef } from 'react';

export default function InAppBrowser({ url, onClose }) {
  const [currentUrl, setCurrentUrl] = useState(url);
  const [title, setTitle] = useState('');
  const [loading, setLoading] = useState(true);

  const proxyUrl = `/api/proxy?url=${encodeURIComponent(currentUrl)}`;

  useEffect(() => {
    const handler = (e) => {
      if (e.data?.type === 'proxy-navigate') { setCurrentUrl(e.data.url); setLoading(true); }
      if (e.data?.type === 'proxy-title') setTitle(e.data.title);
    };
    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, []);

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.85)', zIndex: 300,
      display: 'flex', flexDirection: 'column' }} onClick={onClose}>
      <div style={{ display: 'flex', flexDirection: 'column', background: 'var(--panel)',
        flex: 1, overflow: 'hidden' }} onClick={e => e.stopPropagation()}>
        {/* Browser chrome */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px',
          background: 'var(--surface)', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
          <button onClick={onClose}
            style={{ background: 'none', border: 'none', color: 'var(--muted)', fontSize: 20,
              cursor: 'pointer', padding: '0 6px', lineHeight: 1, flexShrink: 0 }}>×</button>
          <div style={{ flex: 1, background: 'var(--bg)', border: '1px solid var(--border)',
            borderRadius: 8, padding: '5px 10px', display: 'flex', alignItems: 'center',
            gap: 6, minWidth: 0 }}>
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
              border: '1px solid var(--border)', borderRadius: 6 }}>↗</a>
        </div>
        {/* Content */}
        <div style={{ flex: 1, position: 'relative' }}>
          {loading && (
            <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center',
              justifyContent: 'center', flexDirection: 'column', gap: 12, color: 'var(--muted)' }}>
              <div style={{ fontSize: 24 }}>⏳</div>
              <div style={{ fontSize: 13 }}>Loading…</div>
            </div>
          )}
          <iframe key={currentUrl} src={proxyUrl}
            style={{ width: '100%', height: '100%', border: 'none',
              opacity: loading ? 0 : 1, transition: 'opacity .2s' }}
            onLoad={() => setLoading(false)} onError={() => setLoading(false)} />
        </div>
      </div>
    </div>
  );
}
