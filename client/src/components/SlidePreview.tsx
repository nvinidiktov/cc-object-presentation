import { Slide, Photo, Property } from 'shared';
import { photoUrl } from '../lib/api';
import { PDF, LINE_HEIGHT_MM, CHAR_WIDTH_MM, formatPrice } from 'shared';

const PREVIEW_WIDTH = 520;
const SCALE = PREVIEW_WIDTH / PDF.PAGE_WIDTH_MM;
function px(mm: number) { return Math.round(mm * SCALE); }
function pt(points: number) { return px(points * 0.353); }

// ─── Overflow detection & auto-shrink (same logic as server) ─────────────────

interface TextFitResult {
  fontSize: number;
  lineHeight: number;
  marginBottom: number; // mm
}

function fitTextToSlide(
  paragraphs: string[],
  colWidthMm: number,
  contentHeightMm: number = PDF.CONTENT_HEIGHT_MM,
): TextFitResult {
  const tiers: TextFitResult[] = [
    { fontSize: 20, lineHeight: 1.2,  marginBottom: 8 },      // Tier 1: стандарт (пустая строка)
    { fontSize: 19, lineHeight: 1.15, marginBottom: 7 },      // Tier 2: чуть меньше
    { fontSize: 18, lineHeight: 1.1,  marginBottom: 6 },      // Tier 3: минимум → дальше перенос
  ];

  for (const tier of tiers) {
    const adjustedCharWidth = CHAR_WIDTH_MM * (tier.fontSize / PDF.FONT_SIZE_BODY);
    const cpl = Math.floor(colWidthMm / adjustedCharWidth);
    const lineHeightMm = tier.fontSize * 0.353 * tier.lineHeight;
    let totalHeight = 0;
    for (let i = 0; i < paragraphs.length; i++) {
      const para = paragraphs[i];
      let paraLines = 0;
      for (const line of para.split('\n')) {
        paraLines += Math.max(1, Math.ceil(line.length / cpl));
      }
      // Контекстные отступы
      const nextP = paragraphs[i + 1];
      let mb = tier.marginBottom;
      if (!nextP) mb = 0;
      else if (isBulletHeader(para) && isBulletLine(nextP)) mb = 0;
      else if (isBulletLine(para) && isBulletLine(nextP)) mb = 0;
      else if (isSectionHeading(para)) mb = 2;
      totalHeight += paraLines * lineHeightMm + mb;
    }
    if (totalHeight <= contentHeightMm * 0.88) {
      return tier;
    }
  }
  return tiers[tiers.length - 1];
}

// ─── Styles ──────────────────────────────────────────────────────────────────

const S = {
  slide: {
    width: PREVIEW_WIDTH, height: px(PDF.PAGE_HEIGHT_MM),
    backgroundColor: '#fff',
    padding: `${px(PDF.MARGIN_TOP_MM)}px ${px(PDF.MARGIN_RIGHT_MM)}px ${px(PDF.MARGIN_BOTTOM_MM)}px ${px(PDF.MARGIN_LEFT_MM)}px`,
    fontFamily: "'Inter', Arial, Helvetica, sans-serif",
    overflow: 'hidden' as const, boxSizing: 'border-box' as const,
    display: 'flex', flexDirection: 'column' as const, flexShrink: 0,
  },
  body: { display: 'flex', flex: 1, gap: px(PDF.COLUMN_GAP_MM), overflow: 'hidden' },
  textCol: { width: px(PDF.TEXT_COLUMN_WIDTH_MM), overflow: 'hidden', flexShrink: 0 },
  textColFull: { width: px(PDF.CONTENT_WIDTH_MM), overflow: 'hidden' },
  photosCol: {
    width: px(PDF.PHOTO_COLUMN_WIDTH_MM), flexShrink: 0,
    display: 'flex', flexDirection: 'column' as const, gap: px(PDF.PHOTO_GAP_MM),
    alignItems: 'flex-end' as const, justifyContent: 'center' as const,
  },
  photoFrame: { width: px(PDF.PHOTO_WIDTH_MM), height: px(PDF.PHOTO_HEIGHT_MM), overflow: 'hidden', flexShrink: 0 },
  img: { width: '100%', height: '100%', objectFit: 'cover' as const, objectPosition: 'center', display: 'block' },
  noPhoto: { width: '100%', height: '100%', background: '#eee' } as React.CSSProperties,
};

import React from 'react';

// ─── Paragraph type helpers (mirror server logic) ────────────────────────────

const BULLET_RE = /^[\u2022\u2013\u2014\-–—]\s/;
const HEADER_COLON_RE = /:\s*$/;

function isBulletLine(text: string): boolean { return BULLET_RE.test(text); }
function isSectionHeading(text: string): boolean {
  const trimmed = text.trim();
  if (!trimmed) return false;
  const letters = trimmed.replace(/[^a-zA-Zа-яА-ЯёЁ]/g, '');
  return letters.length >= 3 && letters === letters.toUpperCase() && letters !== letters.toLowerCase();
}
function isBulletHeader(text: string): boolean { return HEADER_COLON_RE.test(text.trim()); }

/** Умный отступ между абзацами с учётом контекста */
function computeMarginMm(current: string, next: string | undefined, defaultMb: number): number {
  if (!next) return 0;
  const curBullet = isBulletLine(current);
  const nextBullet = isBulletLine(next);
  const curBulletHdr = isBulletHeader(current);
  const curSection = isSectionHeading(current);
  if (curBulletHdr && nextBullet) return 0;
  if (curBullet && nextBullet) return 0;
  if (curBullet && !nextBullet) return defaultMb;
  if (curBulletHdr) return 2;
  if (curSection) return 2;
  return defaultMb;
}

function PhotosColumn({ photos }: { photos: Photo[] }) {
  // Если только 1 фото — одно крупное по центру
  if (photos.length === 1 && photos[0]) {
    return (
      <div style={{ ...S.photosCol, justifyContent: 'center' }}>
        <div style={S.photoFrame}>
          <img src={photoUrl(photos[0].filename)} alt="" style={S.img} />
        </div>
      </div>
    );
  }
  return (
    <div style={S.photosCol}>
      {[0, 1].map(i => (
        <div key={i} style={S.photoFrame}>
          {photos[i] ? <img src={photoUrl(photos[i].filename)} alt="" style={S.img} /> : <div style={S.noPhoto} />}
        </div>
      ))}
    </div>
  );
}

// ─── Title name auto-shrink ──────────────────────────────────────────────────

function fitTitleName(name: string, maxWidthMm: number): number {
  const maxFontSize = PDF.FONT_SIZE_NAME; // 36pt
  const minFontSize = 22;
  // CSS text-transform: uppercase → всегда CAPS
  const widthFactor = 1.15;
  for (let fs = maxFontSize; fs >= minFontSize; fs -= 2) {
    const charW = CHAR_WIDTH_MM * (fs / PDF.FONT_SIZE_BODY) * widthFactor;
    const charsPerLine = Math.floor(maxWidthMm / charW);
    if (name.length <= charsPerLine) return fs;
  }
  return minFontSize;
}

// ─── Title slide ──────────────────────────────────────────────────────────────

function TitleSlide({ property, photos }: { property: Property; photos: Photo[] }) {
  const tableRows = [
    { label: 'Площадь',    value: property.area },
    { label: 'Этаж',       value: property.floor },
    { label: 'Отделка',    value: property.finish },
    { label: 'Срок сдачи', value: property.deliveryDate },
    ...(property.extraFields ?? []).filter(f => f.label.trim() && f.value.trim()),
  ].filter(r => r.value?.trim());

  const priceFormatted = property.price ? formatPrice(property.price) : '';
  const titleName = property.name || 'Презентация объекта';
  const titleFontSize = fitTitleName(titleName, PDF.TITLE_TEXT_WIDTH_MM);

  return (
    <div style={S.slide}>
      <div style={{ display: 'flex', flex: 1, gap: px(PDF.COLUMN_GAP_MM), overflow: 'hidden' }}>

        {/* LEFT */}
        <div style={{ width: px(PDF.TITLE_TEXT_WIDTH_MM), flexShrink: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          <div style={{ fontWeight: 'bold', fontSize: pt(titleFontSize), color: PDF.COLOR_TEXT, lineHeight: 1.2, marginBottom: px(3), textTransform: 'uppercase' }}>
            {titleName}
          </div>
          {property.address && (
            <div style={{ fontSize: pt(PDF.FONT_SIZE_SUB), color: PDF.COLOR_TEXT, lineHeight: 1.2, marginBottom: px(1.5), fontWeight: 'bold' }}>{property.address}</div>
          )}
          {property.metro && (
            <div style={{ fontSize: pt(PDF.FONT_SIZE_SUB), color: PDF.COLOR_TEXT, lineHeight: 1.2, marginBottom: px(1.5) }}>{property.metro}</div>
          )}
          {priceFormatted && (
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              background: PDF.COLOR_PRICE_BADGE, color: '#fff',
              fontSize: pt(PDF.FONT_SIZE_PRICE), fontWeight: 'bold',
              padding: `${px(3)}px ${px(4)}px`,
              marginTop: px(2), marginBottom: px(3), textAlign: 'center',
            }}>
              {priceFormatted}
            </div>
          )}
          {tableRows.length > 0 && (
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <tbody>
                {tableRows.map((r, i) => (
                  <tr key={i} style={{ background: i % 2 === 0 ? PDF.COLOR_TABLE_BG : '#fff' }}>
                    <td style={{ padding: `${px(2.5)}px ${px(4)}px`, color: PDF.COLOR_TEXT, fontWeight: 'bold', fontSize: pt(PDF.FONT_SIZE_TABLE_LABEL), width: '44%', verticalAlign: 'middle' }}>{r.label}</td>
                    <td style={{ padding: `${px(2.5)}px ${px(4)}px`, fontSize: pt(PDF.FONT_SIZE_TABLE_VALUE), verticalAlign: 'middle' }}>{r.value}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* RIGHT: 2 photos */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: px(PDF.PHOTO_GAP_MM), alignItems: 'flex-end', justifyContent: 'center' }}>
          {[0, 1].map(i => (
            <div key={i} style={{ width: '100%', height: px(PDF.PHOTO_HEIGHT_MM), overflow: 'hidden', flexShrink: 0 }}>
              {photos[i] ? <img src={photoUrl(photos[i].filename)} alt="" style={S.img} /> : <div style={S.noPhoto} />}
            </div>
          ))}
        </div>

      </div>
    </div>
  );
}

// ─── Advantages slide ─────────────────────────────────────────────────────────

function AdvantagesSlide({ advantages, photos }: { advantages: string[]; photos: Photo[] }) {
  const totalLines = advantages.length * 1.8;
  const availableHeight = PDF.CONTENT_HEIGHT_MM * 0.85;
  const lhMm1 = PDF.FONT_SIZE_BULLET * 0.353 * PDF.LINE_HEIGHT;
  const lhMm2 = (PDF.FONT_SIZE_BULLET - 1) * 0.353 * PDF.LINE_HEIGHT;
  const lhMm3 = PDF.FONT_SIZE_BODY_MIN * 0.353 * PDF.LINE_HEIGHT_COMPACT;

  let fontSize: number = PDF.FONT_SIZE_BULLET;
  let lh: number = PDF.LINE_HEIGHT;
  if (totalLines * lhMm1 > availableHeight) {
    fontSize = PDF.FONT_SIZE_BULLET - 1;
    if (totalLines * lhMm2 > availableHeight) {
      fontSize = PDF.FONT_SIZE_BODY_MIN;
      lh = PDF.LINE_HEIGHT_COMPACT;
    }
  }

  return (
    <div style={S.slide}>
      <div style={S.body}>
        <div style={S.textCol}>
          <div style={{ fontWeight: 'bold', fontSize: pt(PDF.FONT_SIZE_HEADING), color: PDF.COLOR_TEXT, marginBottom: px(4), letterSpacing: '0.3px' }}>
            ПРЕИМУЩЕСТВА
          </div>
          <ul style={{ listStyle: 'disc', paddingLeft: px(8), fontSize: pt(fontSize), lineHeight: lh }}>
            {advantages.map((a, i) => (
              <li key={i} style={{ marginBottom: px(2.5) }}>{a}</li>
            ))}
          </ul>
        </div>
        <PhotosColumn photos={photos} />
      </div>
    </div>
  );
}

// ─── Content slide ────────────────────────────────────────────────────────────

function ContentSlide({ paragraphs, photos }: { paragraphs: string[]; photos: Photo[] }) {
  const fit = fitTextToSlide(paragraphs, PDF.TEXT_COLUMN_WIDTH_MM);

  return (
    <div style={S.slide}>
      <div style={S.body}>
        <div style={S.textCol}>
          {paragraphs.map((p, i) => {
            const mb = computeMarginMm(p, paragraphs[i + 1], fit.marginBottom);
            const isHeader = isSectionHeading(p);
            return (
              <p key={i} style={{ fontSize: pt(fit.fontSize), margin: 0, marginBottom: px(mb), lineHeight: fit.lineHeight, textAlign: 'left', whiteSpace: 'pre-wrap', fontWeight: isHeader ? 'bold' : undefined }}>{p}</p>
            );
          })}
        </div>
        <PhotosColumn photos={photos} />
      </div>
    </div>
  );
}

// ─── Fullscreen / floor plan ──────────────────────────────────────────────────

function FullscreenSlide({ photo }: { photo?: Photo }) {
  const pad = px(PDF.FULLSCREEN_PADDING_MM);
  return (
    <div style={{ ...S.slide, padding: pad }}>
      {photo ? <img src={photoUrl(photo.filename)} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <div style={{ width: '100%', height: '100%', background: '#ddd' }} />}
    </div>
  );
}

// ─── Full-text slide (font чуть крупнее) ─────────────────────────────────────

function FullTextSlide({ paragraphs }: { paragraphs: string[] }) {
  const fit = fitTextToSlide(paragraphs, PDF.CONTENT_WIDTH_MM);
  const fontSize = (fit.fontSize === PDF.FONT_SIZE_BODY) ? PDF.FONT_SIZE_BODY_FULL : fit.fontSize;

  return (
    <div style={S.slide}>
      <div style={S.textColFull}>
        {paragraphs.map((p, i) => {
          const mb = computeMarginMm(p, paragraphs[i + 1], fit.marginBottom);
          const isHeader = isSectionHeading(p);
          return (
            <p key={i} style={{ fontSize: pt(fontSize), margin: 0, marginBottom: px(mb), lineHeight: fit.lineHeight, textAlign: 'left', whiteSpace: 'pre-wrap', fontWeight: isHeader ? 'bold' : undefined }}>{p}</p>
          );
        })}
      </div>
    </div>
  );
}

// ─── Photo grid 2×2 ──────────────────────────────────────────────────────────

function PhotoGridSlide({ photos }: { photos: Photo[] }) {
  // 1 фото → fullscreen
  if (photos.length === 1 && photos[0]) {
    const pad = px(PDF.FULLSCREEN_PADDING_MM);
    return (
      <div style={{ ...S.slide, padding: pad }}>
        <img src={photoUrl(photos[0].filename)} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
      </div>
    );
  }

  // 2 фото → один ряд на всю высоту
  if (photos.length === 2) {
    return (
      <div style={S.slide}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gridTemplateRows: '1fr', gap: px(PDF.GRID_GAP_MM), width: '100%', flex: 1 }}>
          <div style={{ overflow: 'hidden' }}>
            <img src={photoUrl(photos[0].filename)} alt="" style={S.img} />
          </div>
          <div style={{ overflow: 'hidden' }}>
            <img src={photoUrl(photos[1].filename)} alt="" style={S.img} />
          </div>
        </div>
      </div>
    );
  }

  // 3 фото → 2 сверху + 1 по центру снизу
  if (photos.length === 3) {
    return (
      <div style={S.slide}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gridTemplateRows: '1fr 1fr', gap: px(PDF.GRID_GAP_MM), width: '100%', flex: 1 }}>
          <div style={{ overflow: 'hidden' }}>
            <img src={photoUrl(photos[0].filename)} alt="" style={S.img} />
          </div>
          <div style={{ overflow: 'hidden' }}>
            <img src={photoUrl(photos[1].filename)} alt="" style={S.img} />
          </div>
          <div style={{ overflow: 'hidden', gridColumn: '1 / -1', maxWidth: '50%', justifySelf: 'center' }}>
            <img src={photoUrl(photos[2].filename)} alt="" style={S.img} />
          </div>
        </div>
      </div>
    );
  }

  // 4 фото → стандартная 2×2
  return (
    <div style={S.slide}>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gridTemplateRows: '1fr 1fr', gap: px(PDF.GRID_GAP_MM), width: '100%', flex: 1 }}>
        {photos.slice(0, 4).map((p, i) => (
          <div key={i} style={{ overflow: 'hidden' }}>
            <img src={photoUrl(p.filename)} alt="" style={S.img} />
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Main export ──────────────────────────────────────────────────────────────

const LABELS: Record<string, string> = {
  title: 'Титульный', advantages: 'Преимущества', content: 'Контент',
  fullscreen: 'Полный экран', floorplan: 'Планировка',
  'photo-grid': 'Фото-сетка', 'full-text': 'Только текст',
};

interface Props { slide: Slide; property: Property; photoMap: Map<string, Photo>; index: number; }

export default function SlidePreview({ slide, property, photoMap, index }: Props) {
  const photos = slide.photoIds.map(id => photoMap.get(id)).filter(Boolean) as Photo[];

  const inner = () => {
    switch (slide.type) {
      case 'title':      return <TitleSlide property={property} photos={photos} />;
      case 'advantages': return <AdvantagesSlide advantages={property.advantages} photos={photos} />;
      case 'content':    return <ContentSlide paragraphs={slide.paragraphs ?? []} photos={photos} />;
      case 'fullscreen': return <FullscreenSlide photo={photos[0]} />;
      case 'floorplan':  return <FullscreenSlide photo={photos[0]} />;
      case 'full-text':  return <FullTextSlide paragraphs={slide.paragraphs ?? []} />;
      case 'photo-grid': return <PhotoGridSlide photos={photos} />;
      default: return null;
    }
  };

  return (
    <div className="flex flex-col gap-1">
      <div className="text-xs text-gray-400 flex items-center gap-1.5">
        <span className="bg-gray-200 text-gray-600 rounded px-1.5 py-0.5 font-mono">{index + 1}</span>
        <span>{LABELS[slide.type] ?? slide.type}</span>
      </div>
      <div className="border border-gray-200 rounded-lg overflow-hidden shadow-sm" style={{ width: PREVIEW_WIDTH }}>
        {inner()}
      </div>
    </div>
  );
}
