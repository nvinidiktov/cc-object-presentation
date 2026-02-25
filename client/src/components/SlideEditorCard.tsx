import React, { useCallback } from 'react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Slide, Photo, Property } from 'shared';
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

// ─── Компонент карточки слайда ───────────────────────────────────────────────

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

  // Получаем фото для слотов
  const photos = slide.photoIds.map(id => photoMap.get(id)).filter(Boolean) as Photo[];
  const slots = maxPhotos(slide.type);

  // Обработчик изменения текста
  const handleTextChange = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      const text = e.target.value;
      // Разбиваем по двойным переносам на абзацы
      const paragraphs = text.split(/\n\s*\n/).filter(p => p.trim());
      onTextChange?.(slide.id, paragraphs);
    },
    [slide.id, onTextChange]
  );

  // Текст из абзацев для textarea
  const textValue = (slide.paragraphs ?? []).join('\n\n');

  // ─── Рендер контента в зависимости от типа ──────────────────────────────

  const renderContent = () => {
    switch (slide.type) {
      case 'title':
        return (
          <div className="flex gap-4 flex-1 min-h-0">
            {/* Инфо — только чтение */}
            <div className="flex-1 min-w-0 text-sm space-y-1">
              <div className="font-bold text-gray-900 uppercase truncate">
                {property.name || 'Название объекта'}
              </div>
              {property.address && (
                <div className="text-gray-500 text-xs truncate">{property.address}</div>
              )}
              {property.metro && (
                <div className="text-gray-500 text-xs truncate">{property.metro}</div>
              )}
              {property.price && (
                <div className="text-red-600 font-bold text-sm">
                  {formatPrice(property.price)}
                </div>
              )}
              <div className="text-gray-400 text-xs space-y-0.5 mt-2">
                {property.area && <div>Площадь: {property.area}</div>}
                {property.floor && <div>Этаж: {property.floor}</div>}
                {property.finish && <div>Отделка: {property.finish}</div>}
                {property.deliveryDate && <div>Сдача: {property.deliveryDate}</div>}
              </div>
            </div>
            {/* Фото слоты */}
            <div className="flex gap-2 flex-shrink-0" style={{ width: '40%' }}>
              {Array.from({ length: slots }).map((_, i) => (
                <div key={i} className="flex-1">
                  <PhotoDropSlot
                    slideId={slide.id}
                    slotIndex={i}
                    photo={photos[i]}
                  />
                </div>
              ))}
            </div>
          </div>
        );

      case 'advantages':
        return (
          <div className="flex gap-4 flex-1 min-h-0">
            {/* Буллеты — только чтение */}
            <div className="flex-1 min-w-0 text-sm">
              <div className="font-semibold text-gray-700 text-xs mb-1 uppercase tracking-wide">
                Преимущества
              </div>
              <ul className="list-disc pl-4 text-xs text-gray-600 space-y-0.5">
                {(property.advantages ?? []).map((a, i) => (
                  <li key={i} className="truncate">{a}</li>
                ))}
              </ul>
            </div>
            {/* Фото слоты */}
            <div className="flex gap-2 flex-shrink-0" style={{ width: '40%' }}>
              {Array.from({ length: slots }).map((_, i) => (
                <div key={i} className="flex-1">
                  <PhotoDropSlot
                    slideId={slide.id}
                    slotIndex={i}
                    photo={photos[i]}
                  />
                </div>
              ))}
            </div>
          </div>
        );

      case 'content':
      case 'full-text':
        return (
          <div className="flex gap-4 flex-1 min-h-0">
            {/* Редактируемый текст */}
            <div className={`min-w-0 ${slots > 0 ? 'flex-1' : 'w-full'}`}>
              <textarea
                className="w-full h-full min-h-[100px] text-xs text-gray-700 border border-gray-200 rounded p-2 resize-none focus:outline-none focus:ring-1 focus:ring-blue-400 focus:border-blue-400"
                value={textValue}
                onChange={handleTextChange}
                placeholder="Текст слайда..."
              />
            </div>
            {/* Фото слоты (только для content, не для full-text) */}
            {slots > 0 && (
              <div className="flex gap-2 flex-shrink-0" style={{ width: '40%' }}>
                {Array.from({ length: slots }).map((_, i) => (
                  <div key={i} className="flex-1">
                    <PhotoDropSlot
                      slideId={slide.id}
                      slotIndex={i}
                      photo={photos[i]}
                    />
                  </div>
                ))}
              </div>
            )}
          </div>
        );

      case 'photo-grid':
        return (
          <div className="grid grid-cols-4 gap-2">
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

      case 'fullscreen':
      case 'floorplan':
        return (
          <div className="w-48">
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

      {/* Карточка слайда */}
      <div className="flex-1 border border-gray-200 rounded-lg p-4 bg-white hover:shadow-sm transition-shadow">
        {/* Заголовок */}
        <div className="flex items-center gap-2 mb-3">
          <span className="bg-gray-200 text-gray-600 text-xs rounded px-1.5 py-0.5 font-mono">
            {index + 1}
          </span>
          <span className={`text-xs rounded px-1.5 py-0.5 font-medium ${TYPE_COLORS[slide.type] ?? 'bg-gray-100 text-gray-600'}`}>
            {TYPE_LABELS[slide.type] ?? slide.type}
          </span>
        </div>

        {/* Контент */}
        {renderContent()}
      </div>
    </div>
  );
});

export default SlideEditorCard;
