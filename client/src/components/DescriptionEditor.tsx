import React, { useRef, useState, useEffect, useCallback } from 'react';
import { PDF, LINE_HEIGHT_MM, CHARS_PER_LINE_CONTENT } from 'shared';

// ─── Client-side paragraph height estimation (mirrors server layoutEngine) ────

const MAX_HEIGHT_MM = PDF.CONTENT_HEIGHT_MM * 0.90; // same safety margin as server

function estimateParaHeightMm(para: string): number {
  if (!para.trim()) return LINE_HEIGHT_MM * 0.5;
  let totalLines = 0;
  for (const line of para.split('\n')) {
    totalLines += Math.max(1, Math.ceil(line.length / CHARS_PER_LINE_CONTENT));
  }
  return (totalLines + 0.5) * LINE_HEIGHT_MM; // +0.5 for paragraph margin
}

// ─── Types ───────────────────────────────────────────────────────────────────

interface SlideBreak {
  y: number;       // pixel Y position (relative to textarea top)
  slideNum: number; // slide number label
}

interface Props {
  value: string;
  onChange: (value: string) => void;
  onPaste: (e: React.ClipboardEvent<HTMLTextAreaElement>) => void;
  startSlideNum: number;
}

// ─── Component ───────────────────────────────────────────────────────────────

export default function DescriptionEditor({ value, onChange, onPaste, startSlideNum }: Props) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const mirrorRef = useRef<HTMLDivElement>(null);
  const [breaks, setBreaks] = useState<SlideBreak[]>([]);
  const [scrollTop, setScrollTop] = useState(0);

  // ─── Calculate break positions (debounced) ─────────────────────────────────

  useEffect(() => {
    const timer = setTimeout(() => {
      const ta = textareaRef.current;
      const mirror = mirrorRef.current;
      if (!ta || !mirror) return;

      // Clone textarea's computed styles to the mirror div
      const cs = getComputedStyle(ta);
      mirror.style.cssText = [
        'position:absolute', 'left:-9999px', 'top:0', 'visibility:hidden',
        `width:${cs.width}`, `font:${cs.font}`, `padding:${cs.padding}`,
        `border:${cs.border}`, `box-sizing:${cs.boxSizing}`,
        `line-height:${cs.lineHeight}`,
        'white-space:pre-wrap', 'word-wrap:break-word', 'overflow-wrap:break-word',
      ].join(';');

      // Split into paragraphs (same logic as server layoutEngine)
      const paras = (value || '')
        .split(/\n\s*\n/)
        .map(p => p.trim())
        .filter(Boolean);

      if (paras.length === 0) {
        setBreaks([]);
        return;
      }

      // Greedy grouping: accumulate paragraphs until overflow
      const newBreaks: SlideBreak[] = [];
      let slideNum = startSlideNum + 1; // first divider leads to startSlideNum+1
      let heightMm = 0;
      let textBefore = '';

      for (const para of paras) {
        const paraH = estimateParaHeightMm(para);

        if (heightMm + paraH > MAX_HEIGHT_MM && heightMm > 0) {
          // Break before this paragraph — measure pixel Y via mirror
          mirror.textContent = textBefore;
          newBreaks.push({ y: mirror.scrollHeight, slideNum });
          slideNum++;
          heightMm = paraH;
        } else {
          heightMm += paraH;
        }

        textBefore += (textBefore ? '\n\n' : '') + para;
      }

      setBreaks(newBreaks);
    }, 250);

    return () => clearTimeout(timer);
  }, [value, startSlideNum]);

  // ─── Handlers ──────────────────────────────────────────────────────────────

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => onChange(e.target.value),
    [onChange],
  );

  const handleScroll = useCallback(
    (e: React.UIEvent<HTMLTextAreaElement>) => setScrollTop(e.currentTarget.scrollTop),
    [],
  );

  // ─── Render ────────────────────────────────────────────────────────────────

  const hasBreaks = breaks.length > 0;

  return (
    <div style={{ position: 'relative' }}>
      {/* Hidden mirror div for measuring text heights */}
      <div ref={mirrorRef} aria-hidden="true" />

      {/* The actual editable textarea (transparent bg so overlays show through) */}
      <textarea
        ref={textareaRef}
        value={value}
        onChange={handleChange}
        onScroll={handleScroll}
        onPaste={onPaste}
        className="input resize-none font-mono text-sm"
        rows={28}
        placeholder={
          'Район и расположение\n' +
          'Жилой комплекс расположен в престижном районе Москвы...\n\n' +
          'Инфраструктура\n' +
          'В шаговой доступности находятся торговые центры, школы...\n\n' +
          'Характеристики ЖК\n' +
          'Монолитный дом с панорамными окнами...'
        }
        style={{
          background: 'transparent',
          position: 'relative',
          zIndex: 1,
        }}
      />

      {/* ── Background: alternating colored sections ─────────────────────────── */}
      {hasBreaks && (
        <div
          style={{
            position: 'absolute',
            top: 0, left: 0, right: 0, bottom: 0,
            pointerEvents: 'none',
            overflow: 'hidden',
            zIndex: 0,
            borderRadius: '0.375rem', // match input border-radius
          }}
        >
          {/* First section: white (default) — no element needed */}

          {/* Subsequent sections alternate gray / white */}
          {breaks.map((bp, i) => {
            const nextY = breaks[i + 1]?.y ?? 99999;
            return (
              <div
                key={bp.slideNum}
                style={{
                  position: 'absolute',
                  top: bp.y - scrollTop,
                  left: 0,
                  right: 0,
                  height: nextY - bp.y,
                  background: i % 2 === 0 ? '#f5f6f8' : '#ffffff',
                  transition: 'top 0.1s ease',
                }}
              />
            );
          })}
        </div>
      )}

      {/* ── Slide number badge for first section ─────────────────────────────── */}
      {hasBreaks && (
        <div
          style={{
            position: 'absolute',
            top: 6,
            right: 14,
            zIndex: 3,
            pointerEvents: 'none',
          }}
        >
          <span
            style={{
              fontSize: 10,
              color: '#999',
              background: '#fff',
              padding: '1px 6px',
              borderRadius: 3,
              border: '1px solid #e0e0e0',
            }}
          >
            Слайд {startSlideNum}
          </span>
        </div>
      )}

      {/* ── Divider lines with slide labels ──────────────────────────────────── */}
      <div
        style={{
          position: 'absolute',
          top: 0, left: 0, right: 0, bottom: 0,
          pointerEvents: 'none',
          overflow: 'hidden',
          zIndex: 2,
        }}
      >
        {breaks.map(bp => {
          const top = bp.y - scrollTop;
          // Skip rendering if far off-screen
          if (top < -40 || top > 800) return null;
          return (
            <div
              key={bp.slideNum}
              style={{
                position: 'absolute',
                left: 12,
                right: 12,
                top,
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                transform: 'translateY(-50%)',
                transition: 'top 0.1s ease',
              }}
            >
              <div style={{ flex: 1, borderTop: '2px dashed #ccc' }} />
              <span
                style={{
                  fontSize: 11,
                  color: '#888',
                  background: '#fff',
                  padding: '1px 8px',
                  whiteSpace: 'nowrap',
                  borderRadius: 4,
                  border: '1px solid #e0e0e0',
                }}
              >
                ✂ Слайд {bp.slideNum}
              </span>
              <div style={{ flex: 1, borderTop: '2px dashed #ccc' }} />
            </div>
          );
        })}
      </div>
    </div>
  );
}
