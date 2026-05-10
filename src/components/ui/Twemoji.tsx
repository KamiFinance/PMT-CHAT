// @ts-nocheck
import React from 'react';

// Convert emoji character(s) to Twemoji CDN URL
// Twemoji uses hex codepoints joined by '-', stripping fe0f (variation selector)
function emojiToUrl(emoji: string): string {
  const codepoints = [...emoji]
    .map(c => c.codePointAt(0)!.toString(16))
    .filter(cp => cp !== 'fe0f'); // strip variation selector
  return `https://cdn.jsdelivr.net/gh/twitter/twemoji@14.0.2/assets/svg/${codepoints.join('-')}.svg`;
}

interface TwemojiProps {
  emoji: string;
  size?: number;
  style?: React.CSSProperties;
}

export default function Twemoji({ emoji, size = 22, style = {} }: TwemojiProps) {
  const url = emojiToUrl(emoji);
  return (
    <img
      src={url}
      alt={emoji}
      draggable={false}
      style={{
        width: size,
        height: size,
        display: 'inline-block',
        verticalAlign: 'middle',
        objectFit: 'contain',
        ...style,
      }}
      onError={(e) => {
        // Fallback to native emoji text if image fails to load
        const parent = (e.target as HTMLImageElement).parentElement;
        if (parent) {
          (e.target as HTMLImageElement).style.display = 'none';
          const span = document.createElement('span');
          span.textContent = emoji;
          parent.appendChild(span);
        }
      }}
    />
  );
}
