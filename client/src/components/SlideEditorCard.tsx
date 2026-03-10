import React, { useCallback, useRef, useEffect, useMemo, useState } from 'react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Slide, Photo, Property, PDF, CHAR_WIDTH_MM } from 'shared';
import { GripVertical } from 'lucide-react';
import PhotoDropSlot from './PhotoDropSlot';
import { formatPrice } from 'shared';

// ─── Оценка заполненности слайда текстом ────────────────────────────────────

// Только тиры 1-3: ввод блокируется если текст не помещается при 18pt
const TEXT_TIERS = [
  { fontSize: 20, lineHeight: 1.2,  marginBottom: 8 },
  { fontSize: 19, lineHeight: 1.15, marginBottom: 7 },
  { fontSize: 18, lineHeight: 1.1,  marginBottom: 6 },
];

// ─── Paragraph type helpers (mirror server/PDF logic) ────────────────────────

const BULLET_RE = /^[\u2022\u2013\u2014\-–—]\s/;
const HEADER_COLON_RE = /:\s*$/;

function isBulletLine(text: string): boolean { return BULLET_RE.test(text); }
function isSectionHeading(text: string): boolean {
  const trimmed = text.trim();
  if (!trimmed) return false;
  const letters = trimmed.replace(/[^a-zA-Zа-яА-ЯёЁ]/g, '');
  return letters.length >= 3 && letters === letters.toUpperCase() && letters !== letters.toLowerCase();
}
function isBulletHeader(text: string): boolean {
  const trimmed = text.trim();
  if (!trimmed) return false;
  if (HEADER_COLON_RE.test(trimmed)) return true;
  return !/[.!?]$/.test(trimmed);
}

/** Склейка абзацев для textarea: буллеты через \n, обычные абзацы через \n\n */
function smartJoinParagraphs(paragraphs: string[]): string {
  if (paragraphs.length === 0) return '';
  let result = paragraphs[0];
  for (let i = 1; i < paragraphs.length; i++) {
    const prev = paragraphs[i - 1];
    const curr = paragraphs[i];
    const singleNewline =
      (isBulletHeader(prev) && isBulletLine(curr)) ||
      (isBulletLine(prev) && isBulletLine(curr));
    result += (singleNewline ? '\n' : '\n\n') + curr;
  }
  return result;
}

/** Парсинг текста textarea в абзацы (для layout engine) */
function textToParagraphs(text: string): string[] {
  return text.split('\n').map(l => l.trim()).filter(l => l.length > 0);
}

interface TextCapacity {
  tier: number;       // 1-3 (какой тир нужен), 0 = не помещается
  fontSize: number;   // реальный размер шрифта: 20, 19 или 18
  fills: number[];    // % заполненности при каждом тире [20pt, 19pt, 18pt]
  fits: boolean;       // помещается ли в Tier 1-3 (до 18pt)
}

function estimateHeight(paragraphs: string[], colWidthMm: number, tier: typeof TEXT_TIERS[0]): number {
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
    // Контекстные отступы: буллеты без отступа, секции 2mm, остальное — полный
    const nextP = paragraphs[i + 1];
    let mb = tier.marginBottom;
    if (!nextP) mb = 0;
    else if (isBulletHeader(para) && isBulletLine(nextP)) mb = 0;
    else if (isBulletLine(para) && isBulletLine(nextP)) mb = 0;
    else if (isSectionHeading(para)) mb = 2;
    totalHeight += paraLines * lineHeightMm + mb;
  }
  return totalHeight;
}

function checkTextCapacity(paragraphs: string[], colWidthMm: number): TextCapacity {
  // Порог совпадает с layout engine (0.80) — запас на погрешность шрифта
  const maxH = PDF.CONTENT_HEIGHT_MM * 0.80;

  // Считаем заполненность при КАЖДОМ тире
  const fills = TEXT_TIERS.map(tier => {
    const h = estimateHeight(paragraphs, colWidthMm, tier);
    return maxH > 0 ? Math.round((h / maxH) * 100) : 0;
  });

  // Находим первый тир где помещается
  for (let i = 0; i < TEXT_TIERS.length; i++) {
    if (fills[i] <= 100) {
      return { tier: i + 1, fontSize: TEXT_TIERS[i].fontSize, fills, fits: true };
    }
  }

  return { tier: 0, fontSize: 18, fills, fits: false };
}

// ─── Метки типов слайдов ─────────────────────────────────────────────────────

const TYPE_LABELS: Record<string, string> = {
  title: 'Титульный',
  advantages: 'Преимущества',
  content: 'Контент',
  fullscreen: 'Полный экран',
  floorplan: 'Планировка',
  'photo-grid': 'Фото-сетка',
  'full-text': 'Только текст',
};

const TYPE_COLORS: Record<string, string> = {
  title: 'bg-blue-100 text-blue-700',
  advantages: 'bg-green-100 text-green-700',
  content: 'bg-gray-100 text-gray-700',
  fullscreen: 'bg-purple-100 text-purple-700',
  floorplan: 'bg-amber-100 text-amber-700',
  'photo-grid': 'bg-pink-100 text-pink-700',
  'full-text': 'bg-orange-100 text-orange-700',
};

// ─── Пропорции колонок как в PDF ─────────────────────────────────────────────

const TEXT_COL_PCT = `${(PDF.TEXT_COLUMN_WIDTH_MM / PDF.CONTENT_WIDTH_MM * 100).toFixed(1)}%`;   // ≈48%
const PHOTO_COL_PCT = `${(PDF.PHOTO_COLUMN_WIDTH_MM / PDF.CONTENT_WIDTH_MM * 100).toFixed(1)}%`; // ≈49.1%

// ─── Максимальное кол-во фото для каждого типа слайда ───────────────────────

function maxPhotos(type: string): number {
  switch (type) {
    case 'title':
    case 'advantages':
    case 'content':
      return 2;
    case 'photo-grid':
      return 4;
    case 'fullscreen':
    case 'floorplan':
      return 1;
    default:
      return 0;
  }
}

// ─── Индикатор заполненности ─────────────────────────────────────────────────

function FillIndicator({ capacity }: { capacity: TextCapacity }) {
  const { tier, fills, fits } = capacity;
  const [f20, f19, f18] = fills;

  // Цвет полоски по текущему тиру
  let barColor: string;
  let barPercent: number;
  if (!fits) {
    barColor = 'bg-red-500';
    barPercent = 100;
  } else if (tier === 3) {
    barColor = 'bg-orange-400';
    barPercent = Math.min(f18, 100);
  } else if (tier === 2) {
    barColor = 'bg-yellow-400';
    barPercent = Math.min(f19, 100);
  } else {
    barColor = 'bg-green-400';
    barPercent = Math.min(f20, 100);
  }

  // Цвет каждой метки: зелёный/жёлтый/оранжевый если влезает, красный если нет
  const c20 = f20 <= 100 ? 'text-green-600' : 'text-gray-400';
  const c19 = f19 <= 100 ? (f20 > 100 ? 'text-yellow-600' : 'text-gray-400') : 'text-gray-400';
  const c18 = f18 <= 100 ? (f19 > 100 ? 'text-orange-600' : 'text-gray-400') : 'text-red-600';

  // Подчёркиваем активный тир
  const bold20 = tier === 1 ? 'font-bold' : '';
  const bold19 = tier === 2 ? 'font-bold' : '';
  const bold18 = tier === 3 || !fits ? 'font-bold' : '';

  return (
    <div className="mt-1.5 space-y-0.5">
      {/* Прогресс-бар */}
      <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-200 ${barColor}`}
          style={{ width: `${barPercent}%` }}
        />
      </div>
      {/* Три тира */}
      <div className="flex gap-3 text-[10px]">
        <span className={`${c20} ${bold20}`}>20pt: {f20}%</span>
        <span className={`${c19} ${bold19}`}>19pt: {f19}%</span>
        <span className={`${c18} ${bold18}`}>18pt: {f18}%</span>
        {!fits && <span className="text-red-600 font-bold ml-auto">⚠ Не помещается!</span>}
      </div>
    </div>
  );
}

// ─── Props ───────────────────────────────────────────────────────────────────

interface Props {
  slide: Slide;
  property: Property;
  photoMap: Map<string, Photo>;
  index: number;
  onTextChange?: (slideId: string, paragraphs: string[]) => void;
}

// ─── Компонент карточки-слайда ───────────────────────────────────────────────

const SlideEditorCard = React.memo(function SlideEditorCard({
  slide,
  property,
  photoMap,
  index,
  onTextChange,
}: Props) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: slide.id,
    data: { type: 'slide', slideId: slide.id },
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  const photos = slide.photoIds.map(id => photoMap.get(id)).filter(Boolean) as Photo[];
  const slots = maxPhotos(slide.type);

  // ─── Локальный текст textarea (не round-trip через paragraphs) ──────────
  const initialText = useMemo(
    () => smartJoinParagraphs(slide.paragraphs ?? []),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [slide.id] // Только при смене слайда (регенерация), не при каждом изменении
  );
  const [localText, setLocalText] = useState(initialText);
  const localTextRef = useRef(initialText);
  const lastValidText = useRef(initialText);

  // Сброс при регенерации слайдов (новый slide.id)
  useEffect(() => {
    const newText = smartJoinParagraphs(slide.paragraphs ?? []);
    setLocalText(newText);
    localTextRef.current = newText;
    lastValidText.current = newText;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slide.id]);

  // Автоподстройка высоты textarea
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    const el = textareaRef.current;
    if (el) {
      el.style.height = 'auto';
      el.style.height = `${el.scrollHeight}px`;
    }
  }, [localText]);

  // Определяем ширину колонки для текущего типа слайда
  const colWidthMm = slide.type === 'full-text' ? PDF.CONTENT_WIDTH_MM : PDF.TEXT_COLUMN_WIDTH_MM;

  // Оценка заполненности (по локальному тексту)
  const capacity = useMemo(() => {
    const paras = textToParagraphs(localText);
    return checkTextCapacity(paras, colWidthMm);
  }, [localText, colWidthMm]);

  const handleTextChange = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      const text = e.target.value;
      const paras = textToParagraphs(text);
      const cap = checkTextCapacity(paras, colWidthMm);

      if (!cap.fits) {
        // Блокируем если добавились НЕ-пробельные символы (разрешаем Enter, пробел, удаление)
        const prevNonWs = localTextRef.current.replace(/\s/g, '').length;
        const newNonWs = text.replace(/\s/g, '').length;
        if (newNonWs > prevNonWs) {
          return;
        }
      }

      setLocalText(text);
      localTextRef.current = text;
      if (cap.fits) {
        lastValidText.current = text;
      }
      onTextChange?.(slide.id, paras);
    },
    [slide.id, onTextChange, colWidthMm]
  );

  // ─── Фото-колонка (2 слота вертикально) ─────────────────────────────────

  const renderPhotosColumn = () => (
    <div style={{ width: PHOTO_COL_PCT, flexShrink: 0 }} className="flex flex-col gap-2">
      {Array.from({ length: slots }).map((_, i) => (
        <PhotoDropSlot
          key={i}
          slideId={slide.id}
          slotIndex={i}
          photo={photos[i]}
        />
      ))}
    </div>
  );

  // ─── Рендер контента в зависимости от типа ──────────────────────────────

  const renderContent = () => {
    switch (slide.type) {
      case 'title':
        return (
          <div className="flex gap-3">
            {/* Инфо — только чтение */}
            <div style={{ width: TEXT_COL_PCT, flexShrink: 0 }} className="space-y-1.5">
              <div className="font-bold text-gray-900 uppercase" style={{ fontSize: '15px', lineHeight: 1.3 }}>
                {property.name || 'Презентация объекта'}
              </div>
              {property.address && (
                <div className="text-gray-500" style={{ fontSize: '13px' }}>{property.address}</div>
              )}
              {property.metro && (
                <div className="text-gray-500" style={{ fontSize: '13px' }}>{property.metro}</div>
              )}
              {property.price && (
                <div
                  className="text-white font-bold text-center py-1 px-2 rounded"
                  style={{ backgroundColor: PDF.COLOR_PRICE_BADGE, fontSize: '14px' }}
                >
                  {formatPrice(property.price)}
                </div>
              )}
              <div className="text-gray-700 space-y-0.5 mt-2" style={{ fontSize: '12px' }}>
                {property.area && <div><span className="font-semibold">Площадь:</span> {property.area}</div>}
                {property.floor && <div><span className="font-semibold">Этаж:</span> {property.floor}</div>}
                {property.finish && <div><span className="font-semibold">Отделка:</span> {property.finish}</div>}
                {property.deliveryDate && <div><span className="font-semibold">Сдача:</span> {property.deliveryDate}</div>}
                {(property.extraFields ?? [])
                  .filter(f => f.label.trim() && f.value.trim())
                  .map((f, i) => <div key={`ef-${i}`}><span className="font-semibold">{f.label}:</span> {f.value}</div>)}
              </div>
            </div>
            {/* 2 фото вертикально */}
            {renderPhotosColumn()}
          </div>
        );

      case 'advantages': {
        const advParagraphs = (property.advantages ?? []).map(a => `• ${a}`);
        const advCapacity = checkTextCapacity(advParagraphs, PDF.TEXT_COLUMN_WIDTH_MM);
        return (
          <div className="flex gap-3">
            <div style={{ width: TEXT_COL_PCT, flexShrink: 0 }}>
              <div className="font-semibold text-gray-700 uppercase tracking-wide mb-1.5" style={{ fontSize: '14px' }}>
                Преимущества
              </div>
              <ul className={`list-disc pl-4 text-gray-600 space-y-0.5 ${!advCapacity.fits ? 'text-red-600' : ''}`} style={{ fontSize: '13px', lineHeight: 1.4 }}>
                {(property.advantages ?? []).map((a, i) => (
                  <li key={i}>{a}</li>
                ))}
              </ul>
              {advParagraphs.length > 0 && <FillIndicator capacity={advCapacity} />}
            </div>
            {renderPhotosColumn()}
          </div>
        );
      }

      case 'content':
        return (
          <div className="flex gap-3">
            {/* Редактируемый текст */}
            <div style={{ width: TEXT_COL_PCT, flexShrink: 0 }}>
              <textarea
                ref={textareaRef}
                className={`w-full text-gray-700 border rounded p-2 resize-none focus:outline-none focus:ring-1 focus:ring-blue-400 focus:border-blue-400 ${
                  !capacity.fits ? 'border-red-300 bg-red-50' : 'border-gray-200'
                }`}
                style={{ fontSize: '13px', lineHeight: '1.4', minHeight: 100, overflowWrap: 'break-word', wordBreak: 'break-all' }}
                value={localText}
                onChange={handleTextChange}
                placeholder="Текст слайда..."
              />
              {localText.trim() && <FillIndicator capacity={capacity} />}
            </div>
            {/* 2 фото вертикально */}
            {renderPhotosColumn()}
          </div>
        );

      case 'full-text':
        return (
          <div>
            <textarea
              ref={textareaRef}
              className={`w-full text-gray-700 border rounded p-2 resize-none focus:outline-none focus:ring-1 focus:ring-blue-400 focus:border-blue-400 ${
                !capacity.fits ? 'border-red-300 bg-red-50' : 'border-gray-200'
              }`}
              style={{ fontSize: '13px', lineHeight: '1.4', minHeight: 100, overflowWrap: 'break-word', wordBreak: 'break-all' }}
              value={localText}
              onChange={handleTextChange}
              placeholder="Текст слайда..."
            />
            {localText.trim() && <FillIndicator capacity={capacity} />}
          </div>
        );

      case 'photo-grid': {
        // Адаптивная сетка: показываем столько слотов, сколько реально фото (мин 1)
        const actualSlots = Math.max(1, photos.length);
        const gridCols = actualSlots <= 1 ? 'grid-cols-1' : 'grid-cols-2';
        return (
          <div className={`grid ${gridCols} gap-2`}>
            {Array.from({ length: actualSlots }).map((_, i) => (
              <PhotoDropSlot
                key={i}
                slideId={slide.id}
                slotIndex={i}
                photo={photos[i]}
              />
            ))}
          </div>
        );
      }

      case 'fullscreen':
      case 'floorplan':
        return (
          <div style={{ aspectRatio: `${PDF.PAGE_WIDTH_MM}/${PDF.PAGE_HEIGHT_MM}` }}>
            <PhotoDropSlot
              slideId={slide.id}
              slotIndex={0}
              photo={photos[0]}
            />
          </div>
        );

      default:
        return null;
    }
  };

  return (
    <div ref={setNodeRef} style={style} className="flex items-start gap-2 group">
      {/* Ручка перетаскивания */}
      <div
        {...attributes}
        {...listeners}
        className="flex-shrink-0 mt-3 p-1.5 rounded cursor-grab text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
        title="Перетащите для изменения порядка"
      >
        <GripVertical className="w-4 h-4" />
      </div>

      {/* Карточка-слайд */}
      <div
        className="border border-gray-200 rounded-lg bg-white hover:shadow-md transition-shadow overflow-hidden w-full"
      >
        {/* Заголовок — тонкая полоска */}
        <div className="flex items-center gap-2 px-3 py-1.5 bg-gray-50 border-b border-gray-100">
          <span className="bg-gray-200 text-gray-600 text-xs rounded px-1.5 py-0.5 font-mono">
            {index + 1}
          </span>
          <span className={`text-xs rounded px-1.5 py-0.5 font-medium ${TYPE_COLORS[slide.type] ?? 'bg-gray-100 text-gray-600'}`}>
            {TYPE_LABELS[slide.type] ?? slide.type}
          </span>
        </div>

        {/* Контент */}
        <div className="p-3">
          {renderContent()}
        </div>
      </div>
    </div>
  );
});

export default SlideEditorCard;
