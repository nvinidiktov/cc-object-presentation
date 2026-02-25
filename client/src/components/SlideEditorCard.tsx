import React, { useCallback, useRef, useEffect } from 'react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Slide, Photo, Property, PDF } from 'shared';
import { GripVertical } from 'lucide-react';
import PhotoDropSlot from './PhotoDropSlot';
import { formatPrice } from 'shared';

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

  // Автоподстройка высоты textarea
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const textValue = (slide.paragraphs ?? []).join('\n\n');

  useEffect(() => {
    const el = textareaRef.current;
    if (el) {
      el.style.height = 'auto';
      el.style.height = `${el.scrollHeight}px`;
    }
  }, [textValue]);

  const handleTextChange = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      const text = e.target.value;
      const paragraphs = text.split(/\n\s*\n/).filter(p => p.trim());
      onTextChange?.(slide.id, paragraphs);
    },
    [slide.id, onTextChange]
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
                {property.name || 'Название объекта'}
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
              <div className="text-gray-500 space-y-0.5 mt-2" style={{ fontSize: '12px' }}>
                {property.area && <div>Площадь: {property.area}</div>}
                {property.floor && <div>Этаж: {property.floor}</div>}
                {property.finish && <div>Отделка: {property.finish}</div>}
                {property.deliveryDate && <div>Сдача: {property.deliveryDate}</div>}
              </div>
            </div>
            {/* 2 фото вертикально */}
            {renderPhotosColumn()}
          </div>
        );

      case 'advantages':
        return (
          <div className="flex gap-3">
            <div style={{ width: TEXT_COL_PCT, flexShrink: 0 }}>
              <div className="font-semibold text-gray-700 uppercase tracking-wide mb-1.5" style={{ fontSize: '14px' }}>
                Преимущества
              </div>
              <ul className="list-disc pl-4 text-gray-600 space-y-0.5" style={{ fontSize: '13px', lineHeight: 1.4 }}>
                {(property.advantages ?? []).map((a, i) => (
                  <li key={i}>{a}</li>
                ))}
              </ul>
            </div>
            {renderPhotosColumn()}
          </div>
        );

      case 'content':
        return (
          <div className="flex gap-3">
            {/* Редактируемый текст */}
            <div style={{ width: TEXT_COL_PCT, flexShrink: 0 }}>
              <textarea
                ref={textareaRef}
                className="w-full text-gray-700 border border-gray-200 rounded p-2 resize-none focus:outline-none focus:ring-1 focus:ring-blue-400 focus:border-blue-400"
                style={{ fontSize: '13px', lineHeight: '1.4', minHeight: 100 }}
                value={textValue}
                onChange={handleTextChange}
                placeholder="Текст слайда..."
              />
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
              className="w-full text-gray-700 border border-gray-200 rounded p-2 resize-none focus:outline-none focus:ring-1 focus:ring-blue-400 focus:border-blue-400"
              style={{ fontSize: '13px', lineHeight: '1.4', minHeight: 100 }}
              value={textValue}
              onChange={handleTextChange}
              placeholder="Текст слайда..."
            />
          </div>
        );

      case 'photo-grid': {
        // Адаптивная сетка: 1=fullscreen, 2=ряд, 3-4=grid 2×2
        const gridCols = photos.length <= 1 ? 'grid-cols-1' : 'grid-cols-2';
        return (
          <div className={`grid ${gridCols} gap-2`}>
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
