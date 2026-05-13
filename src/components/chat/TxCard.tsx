// @ts-nocheck
import React, { useState, useEffect } from 'react';

const RPC = 'https://node1-ipm.dweb3.wtf';
const EXPLORER = 'https://pmtscan.com';

async function rpc(method, params) {
  const r = await fetch(RPC, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', method, params, id: 1 }),
  });
  return (await r.json()).result;
}

function weiToEth(hex) {
  if (!hex) return '0';
  const wei = BigInt(hex);
  const eth = Number(wei) / 1e18;
  return eth.toFixed(eth < 0.001 ? 8 : 4);
}

// Full-screen in-app transaction detail modal
function TxDetail({ hash, onClose }) {
  const [tx, setTx] = useState(null);
  const [receipt, setReceipt] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    Promise.all([
      rpc('eth_getTransactionByHash', [hash]),
      rpc('eth_getTransactionReceipt', [hash]),
    ]).then(([txData, rcptData]) => {
      setTx(txData);
      setReceipt(rcptData);
      setLoading(false);
    }).catch(e => { setError(e.message); setLoading(false); });
  }, [hash]);

  const Row = ({ label, value, mono, accent }) => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 2, padding: '10px 0',
      borderBottom: '1px solid var(--border)' }}>
      <div style={{ fontSize: 10, color: 'var(--muted)', fontFamily: 'var(--mono)',
        letterSpacing: '1px', textTransform: 'uppercase' }}>{label}</div>
      <div style={{ fontSize: 12, color: accent ? 'var(--accent3)' : 'var(--text)',
        fontFamily: mono ? 'var(--mono)' : 'var(--sans)', wordBreak: 'break-all',
        lineHeight: 1.5 }}>{value}</div>
    </div>
  );

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.85)', zIndex: 300,
      display: 'flex', flexDirection: 'column' }} onClick={onClose}>
      <div style={{ display: 'flex', flexDirection: 'column', background: 'var(--panel)',
        flex: 1, overflow: 'hidden', maxHeight: '100vh' }} onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 16px',
          background: 'var(--surface)', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
          <button onClick={onClose}
            style={{ background: 'none', border: 'none', color: 'var(--muted)', fontSize: 20,
              cursor: 'pointer', lineHeight: 1, padding: '0 4px' }}>×</button>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 13, fontWeight: 600 }}>Transaction Details</div>
            <div style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--muted)' }}>PMTchain</div>
          </div>
          <a href={`${EXPLORER}/tx/${hash}`} target="_blank" rel="noopener noreferrer"
            onClick={e => e.stopPropagation()}
            style={{ fontSize: 11, color: 'var(--accent2)', textDecoration: 'none',
              padding: '4px 10px', background: 'var(--surface)', border: '1px solid var(--border)',
              borderRadius: 6 }}>↗ PMTscan</a>
        </div>

        {/* Content */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '0 16px 16px' }}>
          {loading && (
            <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--muted)', fontSize: 13 }}>
              ⏳ Loading transaction…
            </div>
          )}
          {error && (
            <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--danger)', fontSize: 13 }}>
              Could not load transaction: {error}
            </div>
          )}
          {tx && (
            <>
              {/* Status badge */}
              <div style={{ display: 'flex', justifyContent: 'center', padding: '16px 0 8px' }}>
                <div style={{ padding: '6px 20px', borderRadius: 20, fontSize: 12, fontWeight: 600,
                  background: receipt?.status === '0x1' ? 'rgba(74,222,128,.1)' : 'rgba(248,113,113,.1)',
                  border: `1px solid ${receipt?.status === '0x1' ? 'rgba(74,222,128,.3)' : 'rgba(248,113,113,.3)'}`,
                  color: receipt?.status === '0x1' ? 'var(--accent3)' : 'var(--danger)' }}>
                  {receipt?.status === '0x1' ? '✓ Success' : receipt ? '✗ Failed' : '⏳ Pending'}
                </div>
              </div>

              {/* Amount */}
              <div style={{ textAlign: 'center', padding: '8px 0 16px' }}>
                <div style={{ fontFamily: 'var(--mono)', fontSize: 32, fontWeight: 700,
                  color: 'var(--accent3)' }}>{weiToEth(tx.value)}</div>
                <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2 }}>PMT</div>
              </div>

              <Row label="Transaction Hash" value={hash} mono />
              <Row label="From" value={tx.from} mono />
              <Row label="To" value={tx.to} mono />
              <Row label="Block" value={tx.blockNumber ? parseInt(tx.blockNumber, 16).toLocaleString() : 'Pending'} />
              <Row label="Gas Used" value={receipt?.gasUsed ? parseInt(receipt.gasUsed, 16).toLocaleString() : '—'} />
              <Row label="Gas Price" value={tx.gasPrice ? (parseInt(tx.gasPrice, 16) / 1e9).toFixed(2) + ' Gwei' : '—'} />
              <Row label="Nonce" value={tx.nonce ? parseInt(tx.nonce, 16) : '—'} />
            </>
          )}
        </div>
      </div>
    </div>
  );
}

export default function TxCard({msg, isOut}) {
  const [showDetail, setShowDetail] = useState(false);
  const realHash = msg.hash && msg.hash.length > 20;

  return (
    <>
      <div style={{ animation: 'fadeIn .2s ease', background: 'var(--surface)',
        border: `1px solid ${isOut ? 'rgba(248,113,113,.25)' : 'rgba(74,222,128,.2)'}`,
        borderRadius: 12, padding: '12px 16px', maxWidth: 240, margin: '2px 0' }}>

        <div style={{ fontFamily: 'var(--mono)', fontSize: 9, letterSpacing: '1.5px', marginBottom: 6,
          color: isOut ? 'rgba(248,113,113,.8)' : 'rgba(74,222,128,.75)' }}>
          {isOut ? '↑ SENT' : '↓ RECEIVED'}
        </div>

        <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginBottom: 4 }}>
          <span style={{ fontFamily: 'var(--mono)', fontSize: 24, fontWeight: 700,
            color: isOut ? 'var(--danger)' : 'var(--accent3)' }}>{msg.amount}</span>
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
          {realHash && (
            <span onClick={e => { e.stopPropagation(); setShowDetail(true); }}
              style={{ color: 'var(--accent2)', cursor: 'pointer', textDecoration: 'underline' }}>
              {msg.hash.slice(0, 6)}…{msg.hash.slice(-4)}
            </span>
          )}
          {msg.confirms > 0 && <span style={{ color: 'var(--accent3)' }}>✓ {msg.confirms}</span>}
          {msg.pending && <span style={{ color: 'var(--muted)' }}>⏳ pending</span>}
        </div>
      </div>

      {showDetail && realHash && (
        <TxDetail hash={msg.hash} onClose={() => setShowDetail(false)} />
      )}
    </>
  );
}
