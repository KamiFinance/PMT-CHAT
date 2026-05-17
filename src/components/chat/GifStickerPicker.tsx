// @ts-nocheck
import React, { useState, useEffect, useRef, useCallback } from 'react';

interface GifItem {
  id: string;
  url: string;
  width: number;
  height: number;
  preview: string;
  title: string;
}

interface Props {
  onSelect: (item: GifItem, isSticker: boolean) => void;
  onClose: () => void;
}

export default function GifStickerPicker({ onSelect, onClose }: Props) {
  const [tab, setTab] = useState<'gif' | 'sticker'>('gif');
  const [query, setQuery] = useState('');
  const [items, setItems] = useState<GifItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const containerRef = useRef<HTMLDivElement>(null);
  const searchTimer = useRef<any>(null);
  const abortRef = useRef<AbortController | null>(null);
  const LIMIT = 30;

  const fetch_gifs = useCallback(async (q: string, tabType: 'gif'|'sticker', pageNum: number, append = false) => {
    if (abortRef.current) abortRef.current.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    setLoading(true);
    try {
      const params = new URLSearchParams({
        type: tabType,
        limit: String(LIMIT),
        offset: String(pageNum * LIMIT),
        ...(q ? { q } : {}),
      });
      const r = await fetch(`/api/giphy?${params}`, { signal: ctrl.signal });
      const d = await r.json();
      const newItems: GifItem[] = d.items || [];
      setItems(prev => append ? [...prev, ...newItems] : newItems);
      setHasMore(newItems.length === LIMIT);
    } catch(e: any) {
      if (e?.name !== 'AbortError') setItems(prev => append ? prev : []);
    } finally {
      setLoading(false);
    }
  }, []);

  // Load on tab/query change
  useEffect(() => {
    setPage(0);
    setItems([]);
    clearTimeout(searchTimer.current);
    const delay = query ? 350 : 0;
    searchTimer.current = setTimeout(() => fetch_gifs(query, tab, 0, false), delay);
    return () => clearTimeout(searchTimer.current);
  }, [tab, query, fetch_gifs]);

  // Infinite scroll
  const onScroll = useCallback(() => {
    const el = containerRef.current;
    if (!el || loading || !hasMore) return;
    if (el.scrollTop + el.clientHeight >= el.scrollHeight - 80) {
      const nextPage = page + 1;
      setPage(nextPage);
      fetch_gifs(query, tab, nextPage, true);
    }
  }, [loading, hasMore, page, query, tab, fetch_gifs]);

  // Close on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (!(e.target as Element).closest('[data-gif-picker]') &&
          !(e.target as Element).closest('[data-gif-btn]')) {
        onClose();
      }
    };
    setTimeout(() => document.addEventListener('mousedown', handler), 50);
    return () => document.removeEventListener('mousedown', handler);
  }, [onClose]);

  return (
    <div data-gif-picker="1" style={{
      position: 'fixed',
      bottom: 'calc(env(safe-area-inset-bottom, 0px) + 70px)',
      left: '50%',
      transform: 'translateX(-50%)',
      width: 'min(320px, calc(100vw - 16px))',
      height: 400, borderRadius: 14,
      background: 'var(--panel)', border: '1px solid var(--border)',
      boxShadow: '0 8px 32px rgba(0,0,0,.5)',
      display: 'flex', flexDirection: 'column', overflow: 'hidden', zIndex: 400,
    }}>
      {/* Tab bar */}
      <div style={{ display: 'flex', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
        {(['gif', 'sticker'] as const).map(t => (
          <button key={t} onClick={() => { setTab(t); setQuery(''); }}
            style={{
              flex: 1, padding: '10px 0', background: 'none', border: 'none',
              borderBottom: tab === t ? '2px solid var(--accent)' : '2px solid transparent',
              color: tab === t ? 'var(--accent)' : 'var(--muted)',
              fontFamily: 'var(--sans)', fontSize: 12, fontWeight: 600,
              cursor: 'pointer', letterSpacing: '0.5px', textTransform: 'uppercase',
            }}>
            {t === 'gif' ? '🎞 GIF' : '✨ Stickers'}
          </button>
        ))}
      </div>

      {/* Search bar */}
      <div style={{ padding: '8px 10px', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
        <input
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder={tab === 'gif' ? 'Search GIFs…' : 'Search Stickers…'}
          style={{
            width: '100%', background: 'var(--surface)', border: '1px solid var(--border)',
            borderRadius: 20, padding: '6px 14px', color: 'var(--text)',
            fontFamily: 'var(--sans)', fontSize: 13, outline: 'none', boxSizing: 'border-box',
          }}
        />
      </div>

      {/* Grid */}
      <div
        ref={containerRef}
        onScroll={onScroll}
        style={{ flex: 1, overflowY: 'auto', padding: 6, display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 4, alignContent: 'start' }}
      >
        {items.map(item => (
          <div key={item.id}
            onClick={() => { onSelect(item, tab === 'sticker'); onClose(); }}
            style={{
              cursor: 'pointer', borderRadius: 8, overflow: 'hidden',
              aspectRatio: '1', background: 'var(--surface2)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              transition: 'transform .1s, opacity .1s',
            }}
            onMouseEnter={e => (e.currentTarget as HTMLElement).style.transform = 'scale(1.04)'}
            onMouseLeave={e => (e.currentTarget as HTMLElement).style.transform = 'scale(1)'}
          >
            <img
              src={item.preview || item.url}
              alt={item.title}
              loading="lazy"
              style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
            />
          </div>
        ))}
        {loading && Array.from({ length: 9 }).map((_, i) => (
          <div key={'sk-'+i} style={{
            aspectRatio: '1', borderRadius: 8,
            background: 'linear-gradient(90deg,var(--surface) 25%,var(--surface2) 50%,var(--surface) 75%)',
            backgroundSize: '200% 100%', animation: 'shimmer 1.2s infinite',
          }}/>
        ))}
        {!loading && items.length === 0 && (
          <div style={{ gridColumn: '1/-1', textAlign: 'center', padding: '40px 20px',
            color: 'var(--muted)', fontFamily: 'var(--sans)', fontSize: 13 }}>
            {query ? `No results for "${query}"` : 'Nothing to show'}
          </div>
        )}
      </div>

      {/* Powered by Giphy */}
      <div style={{ padding: '4px 10px', borderTop: '1px solid var(--border)',
        textAlign: 'right', flexShrink: 0 }}>
        <span style={{ fontFamily: 'var(--sans)', fontSize: 9, color: 'var(--muted)', opacity: .7 }}>
          Powered by GIPHY
        </span>
      </div>
    </div>
  );
}
