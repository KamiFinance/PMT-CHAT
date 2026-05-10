// @ts-nocheck
import React, { useState } from 'react';
import InAppBrowser from '../ui/InAppBrowser';

export default function TxCard({msg, isOut}) {
  const [showBrowser, setShowBrowser] = useState(false);
  const explorerUrl = msg.hash && msg.hash.length > 20
    ? `https://pmtscan.com/tx/${msg.hash}`
    : null;

  return (
    <>
      <div style={{ animation: 'fadeIn .2s ease', background: 'var(--surface)',
        border: `1px solid ${isOut ? 'rgba(74,222,128,.2)' : 'rgba(167,139,250,.3)'}`,
        borderRadius: 12, padding: '12px 16px', maxWidth: 240, margin: '2px 0' }}>

        <div style={{ fontFamily: 'var(--mono)', fontSize: 9, letterSpacing: '1.5px', marginBottom: 6,
          color: isOut ? 'rgba(74,222,128,.7)' : 'rgba(167,139,250,.8)' }}>
          {isOut ? '↑ SENT' : '↓ RECEIVED'}
        </div>

        <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginBottom: 4 }}>
          <span style={{ fontFamily: 'var(--mono)', fontSize: 24, fontWeight: 700,
            color: isOut ? 'var(--accent3)' : 'var(--accent2)' }}>{msg.amount}</span>
          <span style={{ fontSize: 12, color: 'var(--muted)' }}>{msg.coin || 'PMT'}</span>
        </div>

        {!isOut && msg.senderName && (
          <div style={{ fontSize: 11, color: 'var(--text2)', marginBottom: 4 }}>
            from <span style={{ color: 'var(--accent)', fontWeight: 500 }}>{msg.senderName}</span>
          </div>
        )}

        <div style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--muted)',
          marginTop: 4, display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <span>{msg.time}</span>
          {explorerUrl && (
            <span
              onClick={e => { e.stopPropagation(); setShowBrowser(true); }}
              style={{ color: 'var(--accent2)', cursor: 'pointer', textDecoration: 'underline' }}>
              {msg.hash.slice(0, 6)}…{msg.hash.slice(-4)}
            </span>
          )}
          {msg.confirms > 0 && <span style={{ color: 'var(--accent3)' }}>✓ {msg.confirms}</span>}
          {msg.pending && <span style={{ color: 'var(--muted)' }}>⏳ pending</span>}
        </div>
      </div>

      {showBrowser && explorerUrl && (
        <InAppBrowser url={explorerUrl} onClose={() => setShowBrowser(false)} />
      )}
    </>
  );
}
