// @ts-nocheck
import React, { useRef, useEffect, useCallback, forwardRef, useImperativeHandle } from 'react';

// Same Apple emoji URL function as Twemoji.tsx
function emojiToAppleUrl(emoji: string): string {
  const codepoints = [...emoji].map(c => c.codePointAt(0)!.toString(16));
  return `https://cdn.jsdelivr.net/npm/emoji-datasource-apple@15.1.2/img/apple/64/${codepoints.join('-')}.png`;
}

const EMOJI_RE = /\p{Emoji_Presentation}|\p{Emoji}\uFE0F/gu;

function escapeHTML(s: string) {
  return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

// Convert plain text (with emoji chars) to innerHTML with <img> for emojis
function textToHTML(text: string): string {
  if (!text) return '';
  let result = '';
  let last = 0;
  const re = new RegExp(EMOJI_RE.source, 'gu');
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) result += escapeHTML(text.slice(last, m.index));
    const url = emojiToAppleUrl(m[0]);
    result += `<img src="${url}" alt="${m[0]}" title="${m[0]}" draggable="false" style="width:20px;height:20px;vertical-align:-4px;margin:0 1px;display:inline;pointer-events:none">`;
    last = m.index + m[0].length;
  }
  if (last < text.length) result += escapeHTML(text.slice(last));
  return result;
}

// Extract plain text from contenteditable (img.alt → emoji char)
function getPlainText(el: HTMLElement): string {
  let text = '';
  for (const node of el.childNodes) {
    if (node.nodeType === Node.TEXT_NODE) {
      text += node.textContent;
    } else if ((node as Element).nodeName === 'IMG') {
      text += (node as HTMLImageElement).getAttribute('alt') || '';
    } else if ((node as Element).nodeName === 'BR') {
      text += '\n';
    } else if ((node as Element).nodeName === 'DIV' || (node as Element).nodeName === 'P') {
      text += '\n' + getPlainText(node as HTMLElement);
    }
  }
  return text;
}

// Get cursor offset (in plain text units, treating each img as 1 char)
function getCursorOffset(el: HTMLElement): number {
  const sel = window.getSelection();
  if (!sel || !sel.rangeCount) return -1;
  const range = sel.getRangeAt(0);
  let offset = 0;
  let found = false;
  function walk(node: Node) {
    if (found) return;
    if (node === range.endContainer) {
      offset += range.endOffset;
      found = true;
      return;
    }
    if (node.nodeType === Node.TEXT_NODE) {
      if (range.endContainer === node) {
        offset += range.endOffset;
        found = true;
      } else {
        offset += node.textContent!.length;
      }
    } else if ((node as Element).nodeName === 'IMG') {
      offset += 1;
    } else {
      for (const child of node.childNodes) walk(child);
    }
  }
  walk(el);
  return found ? offset : -1;
}

// Restore cursor to offset in new DOM
function setCursorOffset(el: HTMLElement, targetOffset: number) {
  const sel = window.getSelection();
  if (!sel) return;
  let offset = 0;
  let found = false;
  function walk(node: Node): void {
    if (found) return;
    if (node.nodeType === Node.TEXT_NODE) {
      const len = node.textContent!.length;
      if (offset + len >= targetOffset) {
        const range = document.createRange();
        range.setStart(node, targetOffset - offset);
        range.collapse(true);
        sel.removeAllRanges();
        sel.addRange(range);
        found = true;
        return;
      }
      offset += len;
    } else if ((node as Element).nodeName === 'IMG') {
      if (offset + 1 >= targetOffset) {
        const range = document.createRange();
        const parent = node.parentNode!;
        const idx = Array.from(parent.childNodes).indexOf(node as ChildNode);
        range.setStart(parent, idx + 1);
        range.collapse(true);
        sel.removeAllRanges();
        sel.addRange(range);
        found = true;
        return;
      }
      offset += 1;
    } else {
      for (const child of node.childNodes) walk(child);
    }
  }
  walk(el);
  // If not found, set at end
  if (!found) {
    const range = document.createRange();
    range.selectNodeContents(el);
    range.collapse(false);
    sel.removeAllRanges();
    sel.addRange(range);
  }
}

interface EmojiInputProps {
  value: string;
  onChange: (v: string) => void;
  onKeyDown?: (e: React.KeyboardEvent) => void;
  placeholder?: string;
  style?: React.CSSProperties;
}

const EmojiInput = forwardRef<any, EmojiInputProps>(
  ({ value, onChange, onKeyDown, placeholder, style = {} }, ref) => {
    const divRef = useRef<HTMLDivElement>(null);
    const composing = useRef(false);
    const lastText = useRef('');

    useImperativeHandle(ref, () => ({
      focus: () => divRef.current?.focus(),
      blur: () => divRef.current?.blur(),
      get selectionStart() {
        return getCursorOffset(divRef.current!) || 0;
      },
      get selectionEnd() {
        return getCursorOffset(divRef.current!) || 0;
      },
      // Allow insertEmoji to insert at current cursor
      insertAtCursor: (text: string) => {
        const el = divRef.current;
        if (!el) return;
        el.focus();
        const sel = window.getSelection();
        if (sel && sel.rangeCount) {
          sel.deleteFromDocument();
          // Insert text as a temporary text node, then re-render
          const node = document.createTextNode(text);
          sel.getRangeAt(0).insertNode(node);
          sel.collapseToEnd();
        }
        const plain = getPlainText(el);
        rerender(plain);
        onChange(plain);
      },
    }), []);

    const rerender = useCallback((plain: string) => {
      const el = divRef.current;
      if (!el) return;
      const cursorOffset = getCursorOffset(el);
      const html = textToHTML(plain);
      el.innerHTML = html;
      if (cursorOffset >= 0) setCursorOffset(el, cursorOffset);
      lastText.current = plain;
    }, []);

    // On value change from parent (e.g., cleared after send)
    useEffect(() => {
      const el = divRef.current;
      if (!el) return;
      if (value === '' && lastText.current !== '') {
        el.innerHTML = '';
        lastText.current = '';
      } else if (value !== lastText.current && document.activeElement !== el) {
        // Sync when not focused (e.g., programmatic insert)
        el.innerHTML = textToHTML(value);
        lastText.current = value;
      }
    }, [value]);

    const handleInput = useCallback((e: React.FormEvent<HTMLDivElement>) => {
      if (composing.current) return;
      const el = e.currentTarget;
      const plain = getPlainText(el);
      if (plain === lastText.current) return;
      rerender(plain);
      onChange(plain);
    }, [onChange, rerender]);

    const handlePaste = useCallback((e: React.ClipboardEvent) => {
      e.preventDefault();
      const text = e.clipboardData.getData('text/plain');
      document.execCommand('insertText', false, text);
    }, []);

    return (
      <div
        ref={divRef}
        contentEditable
        suppressContentEditableWarning
        onInput={handleInput}
        onKeyDown={onKeyDown}
        onPaste={handlePaste}
        onCompositionStart={() => { composing.current = true; }}
        onCompositionEnd={(e) => {
          composing.current = false;
          const plain = getPlainText(e.currentTarget);
          rerender(plain);
          onChange(plain);
        }}
        data-placeholder={placeholder}
        style={{
          flex: 1,
          background: 'transparent',
          border: 'none',
          outline: 'none',
          color: 'var(--text)',
          fontFamily: 'var(--sans)',
          fontSize: 13.5,
          padding: '10px 0',
          lineHeight: 1.5,
          maxHeight: 120,
          overflowY: 'auto',
          wordBreak: 'break-word',
          whiteSpace: 'pre-wrap',
          cursor: 'text',
          ...style,
        }}
      />
    );
  }
);

export default EmojiInput;
