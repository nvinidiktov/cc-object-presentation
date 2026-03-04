import { useState, useCallback } from 'react';
import {
  DndContext,
  closestCenter,
  pointerWithin,
  CollisionDetection,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
  DragStartEvent,
  DragOverlay,
} from '@dnd-kit/core';
import {
  SortableContext,
  sortableKeyboardCoordinates,
  arrayMove,
  rectSortingStrategy,
} from '@dnd-kit/sortable';
import { Slide, Photo, Property } from 'shared';
import { photoUrl } from '../lib/api';
import SlideEditorCard from './SlideEditorCard';
import { Layers, RefreshCw, FileDown } from 'lucide-react';

interface Props {
  slides: Slide[] | null;
  property: Property;
  photoMap: Map<string, Photo>;
  onSlidesChange: (slides: Slide[]) => void;
  onTextChange: (slideId: string, paragraphs: string[]) => void;
  onGenerate: () => void;
  onExportPdf: () => void;
  pdfLoading: boolean;
  layoutLoading: boolean;
  slidesEdited: boolean;
}

export default function SlideEditor({
  slides,
  property,
  photoMap,
  onSlidesChange,
  onTextChange,
  onGenerate,
  onExportPdf,
  pdfLoading,
  layoutLoading,
  slidesEdited,
}: Props) {
  const [activePhotoId, setActivePhotoId] = useState<string | null>(null);
  const [activeDragType, setActiveDragType] = useState<'slide' | 'photo' | null>(null);

  // Кастомная collision detection: для фото — pointerWithin (лучше для вложенных),
  // для слайдов — closestCenter (лучше для сортировки)
  const collisionDetection: CollisionDetection = useCallback(
    (args) => {
      if (activeDragType === 'photo') {
        // Для фото: pointerWithin находит вложенные droppable слоты
        const pointerCollisions = pointerWithin(args);
        // Отфильтровываем — предпочитаем slot над slide
        const slotCollisions = pointerCollisions.filter(
          c => c.data?.droppableContainer?.data?.current?.type === 'slot'
        );
        return slotCollisions.length > 0 ? slotCollisions : pointerCollisions;
      }
      return closestCenter(args);
    },
    [activeDragType]
  );

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const handleDragStart = useCallback((event: DragStartEvent) => {
    const type = event.active.data.current?.type as 'slide' | 'photo' | undefined;
    setActiveDragType(type ?? null);
    if (type === 'photo') {
      setActivePhotoId(event.active.data.current?.photoId ?? null);
    }
  }, []);

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      setActivePhotoId(null);
      setActiveDragType(null);
      const { active, over } = event;
      if (!over || !slides) return;

      const activeType = active.data.current?.type;
      const overType = over.data.current?.type;

      // ─── Перестановка слайдов ────────────────────────────────────────────
      if (activeType === 'slide' && overType === 'slide') {
        if (active.id === over.id) return;
        const oldIdx = slides.findIndex(s => s.id === active.data.current?.slideId);
        const newIdx = slides.findIndex(s => s.id === over.data.current?.slideId);
        if (oldIdx === -1 || newIdx === -1) return;

        const reordered = arrayMove(slides, oldIdx, newIdx);
        reordered.forEach((s, i) => {
          s.orderIndex = i;
        });
        onSlidesChange([...reordered]);
        return;
      }

      // ─── Перемещение фото между слотами ──────────────────────────────────
      if (activeType === 'photo' && overType === 'slot') {
        const fromSlideId = active.data.current?.slideId;
        const fromSlotIdx = active.data.current?.slotIndex;
        const toSlideId = over.data.current?.slideId;
        const toSlotIdx = over.data.current?.slotIndex;
        const photoId = active.data.current?.photoId;

        // Валидация всех значений
        if (!fromSlideId || !toSlideId || !photoId ||
            fromSlotIdx == null || toSlotIdx == null) return;

        // Не перемещаем в тот же слот
        if (fromSlideId === toSlideId && fromSlotIdx === toSlotIdx) return;

        const newSlides = slides.map(s => ({
          ...s,
          photoIds: [...s.photoIds],
        }));

        const fromSlide = newSlides.find(s => s.id === fromSlideId);
        const toSlide = newSlides.find(s => s.id === toSlideId);
        if (!fromSlide || !toSlide) return;

        // Проверяем что fromSlotIdx валидный
        if (fromSlotIdx >= fromSlide.photoIds.length) return;

        // Фото в целевом слоте (для обмена)
        const displacedPhotoId = toSlide.photoIds[toSlotIdx] || null;

        // Ставим фото в целевой слот
        while (toSlide.photoIds.length <= toSlotIdx) {
          toSlide.photoIds.push('');
        }
        toSlide.photoIds[toSlotIdx] = photoId;

        // Обмен: ставим вытесненное фото в исходный слот
        if (displacedPhotoId) {
          fromSlide.photoIds[fromSlotIdx] = displacedPhotoId;
        } else {
          fromSlide.photoIds.splice(fromSlotIdx, 1);
        }

        // Убираем пустые строки из конца массива
        for (const s of newSlides) {
          while (s.photoIds.length > 0 && !s.photoIds[s.photoIds.length - 1]) {
            s.photoIds.pop();
          }
        }

        onSlidesChange(newSlides);
        return;
      }
    },
    [slides, onSlidesChange]
  );

  const handleDragCancel = useCallback(() => {
    setActivePhotoId(null);
    setActiveDragType(null);
  }, []);

  // ─── Пустое состояние ─────────────────────────────────────────────────────

  if (!slides) {
    return (
      <div className="card p-12 text-center space-y-4">
        <Layers className="w-12 h-12 mx-auto text-gray-300" />
        <div>
          <p className="text-gray-600 font-medium">Слайды ещё не сгенерированы</p>
          <p className="text-gray-400 text-sm mt-1">
            Нажмите «Создать слайды» чтобы увидеть и отредактировать раскладку
          </p>
        </div>
        <button onClick={onGenerate} disabled={layoutLoading} className="btn-primary mx-auto">
          <RefreshCw className={`w-4 h-4 ${layoutLoading ? 'animate-spin' : ''}`} />
          Создать слайды
        </button>
      </div>
    );
  }

  // Фото для DragOverlay
  const activePhoto = activePhotoId ? photoMap.get(activePhotoId) : null;

  // ─── Редактор ─────────────────────────────────────────────────────────────

  return (
    <div className="space-y-4 pb-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-gray-500">
          {slides.length} слайдов · Перетаскивайте слайды и фото для изменения порядка
        </p>
        <div className="flex items-center gap-2">
          <button
            onClick={() => {
              if (slidesEdited && !window.confirm('Все ручные изменения будут потеряны. Пересоздать слайды?')) {
                return;
              }
              onGenerate();
            }}
            disabled={layoutLoading}
            className="btn-secondary text-xs"
          >
            <RefreshCw className={`w-4 h-4 ${layoutLoading ? 'animate-spin' : ''}`} />
            Пересоздать слайды
          </button>
          <button
            onClick={onExportPdf}
            disabled={pdfLoading}
            className="btn-primary text-xs"
          >
            <FileDown className="w-4 h-4" />
            {pdfLoading ? 'Генерация...' : 'Скачать PDF'}
          </button>
        </div>
      </div>

      <DndContext
        sensors={sensors}
        collisionDetection={collisionDetection}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
        onDragCancel={handleDragCancel}
      >
        <SortableContext
          items={slides.map(s => s.id)}
          strategy={rectSortingStrategy}
        >
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
            {slides.map((slide, i) => (
              <SlideEditorCard
                key={slide.id}
                slide={slide}
                property={property}
                photoMap={photoMap}
                index={i}
                onTextChange={onTextChange}
              />
            ))}
          </div>
        </SortableContext>

        <DragOverlay dropAnimation={null}>
          {activePhoto && (
            <div className="w-24 h-16 rounded shadow-lg overflow-hidden border-2 border-blue-400 opacity-90">
              <img
                src={photoUrl(activePhoto.filename)}
                alt=""
                className="w-full h-full object-cover"
              />
            </div>
          )}
        </DragOverlay>
      </DndContext>
    </div>
  );
}
