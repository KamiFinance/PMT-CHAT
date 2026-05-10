// @ts-nocheck
import React from 'react';

// Apple emoji style (same as WhatsApp/Telegram on iOS) via emoji-datasource-apple CDN
// URL format: /img/apple/64/{codepoint}.png
// Codepoints: lowercase hex joined by '-', variation selectors (fe0f) kept for Apple
function emojiToAppleUrl(emoji: string): string {
  const codepoints = [...emoji]
    .map(c => c.codePointAt(0)!.toString(16))
    .filter(cp => cp !== '200d' || false); // keep fe0f for Apple style, strip ZWJ only when needed
  return `https://cdn.jsdelivr.net/npm/emoji-datasource-apple@15.1.2/img/apple/64/${codepoints.join('-')}.png`;
}

// Fallback: Twemoji CDN (Twitter style) if Apple fails
function emojiToTwemojiUrl(emoji: string): string {
  const codepoints = [...emoji]
    .map(c => c.codePointAt(0)!.toString(16))
    .filter(cp => cp !== 'fe0f');
  return `https://cdn.jsdelivr.net/gh/twitter/twemoji@14.0.2/assets/svg/${codepoints.join('-')}.svg`;
}

interface TwemojiProps {
  emoji: string;
  size?: number;
  style?: React.CSSProperties;
}

export default function Twemoji({ emoji, size = 22, style = {} }: TwemojiProps) {
  const [src, setSrc] = React.useState(() => emojiToAppleUrl(emoji));
  const [failed, setFailed] = React.useState(false);
  const [fallback2, setFallback2] = React.useState(false);

  const handleError = () => {
    if (!failed) {
      // Try without variation selector (fe0f stripped)
      const withoutVariant = [...emoji]
        .map(c => c.codePointAt(0)!.toString(16))
        .filter(cp => cp !== 'fe0f')
        .join('-');
      setSrc(`https://cdn.jsdelivr.net/npm/emoji-datasource-apple@15.1.2/img/apple/64/${withoutVariant}.png`);
      setFailed(true);
    } else if (!fallback2) {
      // Final fallback: Twemoji
      setSrc(emojiToTwemojiUrl(emoji));
      setFallback2(true);
    }
  };

  if (fallback2 && src.includes('failed')) {
    return <span style={{ fontSize: size * 0.85, lineHeight: 1 }}>{emoji}</span>;
  }

  return (
    <img
      src={src}
      alt={emoji}
      draggable={false}
      style={{
        width: size,
        height: size,
        display: 'inline-block',
        verticalAlign: 'middle',
        objectFit: 'contain',
        imageRendering: 'auto',
        ...style,
      }}
      onError={handleError}
    />
  );
}
