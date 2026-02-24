import { useState, useCallback } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { propertiesApi, photosApi, pdfApi } from '../lib/api';
import { downloadBlob } from '../lib/utils';
import PropertyForm from '../components/PropertyForm';
import PhotoLibrary from '../components/PhotoLibrary';
import SlidePreview from '../components/SlidePreview';
import { PropertyCreate, Photo, Slide } from 'shared';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  arrayMove,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import {
  ChevronLeft,
  FileDown,
  Layers,
  ImageIcon,
  PencilLine,
  RefreshCw,
  AlertTriangle,
  GripVertical,
} from 'lucide-react';

type Tab = 'details' | 'photos' | 'preview';

// ─── Sortable slide wrapper ──────────────────────────────────────────────────

function SortableSlide({
  slide,
  property,
  photoMap,
  index,
}: {
  slide: Slide;
  property: any;
  photoMap: Map<string, Photo>;
  index: number;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: slide.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div ref={setNodeRef} style={style} className="flex items-start gap-2 group">
      <div
        {...attributes}
        {...listeners}
        className="flex-shrink-0 mt-6 p-1.5 rounded cursor-grab text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
        title="Перетащите для изменения порядка"
      >
        <GripVertical className="w-4 h-4" />
      </div>
      <div className="flex-1">
        <SlidePreview
          slide={slide}
          property={property}
          photoMap={photoMap}
          index={index}
        />
      </div>
    </div>
  );
}

// ─── Main component ──────────────────────────────────────────────────────────

export default function PropertyEdit() {
  const { id } = useParams<{ id: string }>();
  const qc = useQueryClient();
  const [activeTab, setActiveTab] = useState<Tab>('details');
  const [pdfLoading, setPdfLoading] = useState(false);
  const [layoutLoading, setLayoutLoading] = useState(false);
  const [slides, setSlides] = useState<Slide[] | null>(null);
  const [layoutWarnings, setLayoutWarnings] = useState<string[]>([]);

  // ─── Queries ────────────────────────────────────────────────────────────────
  const { data: property, isLoading: propLoading } = useQuery({
    queryKey: ['property', id],
    queryFn: () => propertiesApi.get(id!),
    enabled: !!id,
  });

  const { data: photos = [], isLoading: photosLoading } = useQuery({
    queryKey: ['photos', id],
    queryFn: () => photosApi.list(id!),
    enabled: !!id,
  });

  const photoMap = new Map(photos.map((p: Photo) => [p.id, p]));

  // ─── Update mutation ──────────────────────────────────────────────────────
  const updateMutation = useMutation({
    mutationFn: (values: PropertyCreate) => propertiesApi.update(id!, values),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['property', id] });
      qc.invalidateQueries({ queryKey: ['properties'] });
      setSlides(null);
    },
  });

  // ─── Generate layout ───────────────────────────────────────────────────────
  const generateLayout = async () => {
    setLayoutLoading(true);
    try {
      const result = await pdfApi.getLayout(id!);
      setSlides(result.slides);
      setLayoutWarnings(result.warnings);
      setActiveTab('preview');
    } catch (err: any) {
      alert('Ошибка: ' + err.message);
    } finally {
      setLayoutLoading(false);
    }
  };

  // ─── Generate PDF ──────────────────────────────────────────────────────────
  const handleExportPdf = async () => {
    setPdfLoading(true);
    try {
      const blob = await pdfApi.generatePdf(id!, slides ?? undefined);
      const name = `${property?.name || 'Презентация'}.pdf`;
      downloadBlob(blob, name);
    } catch (err: any) {
      alert('Ошибка генерации PDF: ' + err.message);
    } finally {
      setPdfLoading(false);
    }
  };

  // ─── Slide reordering ──────────────────────────────────────────────────────
  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const handleSlideDragEnd = useCallback((event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id || !slides) return;

    const oldIndex = slides.findIndex(s => s.id === active.id);
    const newIndex = slides.findIndex(s => s.id === over.id);
    if (oldIndex === -1 || newIndex === -1) return;

    const reordered = arrayMove(slides, oldIndex, newIndex);
    reordered.forEach((s, i) => { s.orderIndex = i; });
    setSlides([...reordered]);
  }, [slides]);

  if (propLoading) {
    return (
      <div className="flex items-center justify-center h-64 text-gray-400">
        Загрузка...
      </div>
    );
  }

  if (!property) {
    return (
      <div className="text-center py-20 text-gray-500">
        Объект не найден
      </div>
    );
  }

  // ─── Tab content ───────────────────────────────────────────────────────────

  const tabs: { id: Tab; label: string; icon: React.ElementType; badge?: number }[] = [
    { id: 'details', label: 'Данные', icon: PencilLine },
    { id: 'photos', label: 'Фото', icon: ImageIcon, badge: photos.length },
    { id: 'preview', label: 'Слайды', icon: Layers, badge: slides?.length },
  ];

  return (
    <div className="max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex items-start justify-between mb-6 gap-4">
        <div>
          <Link to="/" className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-900 mb-2">
            <ChevronLeft className="w-4 h-4" />
            Все объекты
          </Link>
          <h1 className="text-2xl font-bold text-gray-900 truncate">
            {property.name || 'Без названия'}
          </h1>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2 flex-shrink-0">
          <button
            onClick={generateLayout}
            disabled={layoutLoading}
            className="btn-secondary text-sm"
          >
            <RefreshCw className={`w-4 h-4 ${layoutLoading ? 'animate-spin' : ''}`} />
            {slides ? 'Обновить слайды' : 'Создать слайды'}
          </button>
          <button
            onClick={handleExportPdf}
            disabled={pdfLoading}
            className="btn-primary text-sm"
          >
            <FileDown className="w-4 h-4" />
            {pdfLoading ? 'Генерация...' : 'Скачать PDF'}
          </button>
        </div>
      </div>

      {/* Warnings */}
      {layoutWarnings.length > 0 && (
        <div className="mb-4 p-3 rounded-md bg-amber-50 border border-amber-200 flex items-start gap-2">
          <AlertTriangle className="w-4 h-4 text-amber-500 flex-shrink-0 mt-0.5" />
          <div className="text-sm text-amber-700 space-y-1">
            {layoutWarnings.map((w, i) => <p key={i}>{w}</p>)}
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="flex border-b border-gray-200 mb-6">
        {tabs.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`
              flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors
              ${activeTab === tab.id
                ? 'border-gray-900 text-gray-900'
                : 'border-transparent text-gray-500 hover:text-gray-700'
              }
            `}
          >
            <tab.icon className="w-4 h-4" />
            {tab.label}
            {tab.badge != null && tab.badge > 0 && (
              <span className="bg-gray-200 text-gray-600 text-xs rounded-full px-1.5 py-0.5 font-mono">
                {tab.badge}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      {activeTab === 'details' && (
        <PropertyForm
          defaultValues={property}
          onSubmit={values => updateMutation.mutateAsync(values as PropertyCreate)}
          isLoading={updateMutation.isPending}
          autoSave
        />
      )}

      {activeTab === 'photos' && (
        <div className="card p-6">
          {photosLoading ? (
            <div className="text-gray-400 text-center py-8">Загрузка фото...</div>
          ) : (
            <PhotoLibrary propertyId={id!} photos={photos} property={property} />
          )}
        </div>
      )}

      {activeTab === 'preview' && (
        <div>
          {!slides ? (
            <div className="card p-12 text-center space-y-4">
              <Layers className="w-12 h-12 mx-auto text-gray-300" />
              <div>
                <p className="text-gray-600 font-medium">Слайды ещё не сгенерированы</p>
                <p className="text-gray-400 text-sm mt-1">
                  Нажмите «Создать слайды» чтобы увидеть предпросмотр
                </p>
              </div>
              <button onClick={generateLayout} disabled={layoutLoading} className="btn-primary mx-auto">
                <RefreshCw className={`w-4 h-4 ${layoutLoading ? 'animate-spin' : ''}`} />
                Создать слайды
              </button>
            </div>
          ) : (
            <div className="space-y-4 pb-4">
              <p className="text-sm text-gray-500">
                {slides.length} слайдов · Перетаскивайте слайды для изменения порядка
              </p>
              <DndContext
                sensors={sensors}
                collisionDetection={closestCenter}
                onDragEnd={handleSlideDragEnd}
              >
                <SortableContext items={slides.map(s => s.id)} strategy={verticalListSortingStrategy}>
                  <div className="space-y-4">
                    {slides.map((slide, i) => (
                      <SortableSlide
                        key={slide.id}
                        slide={slide}
                        property={property}
                        photoMap={photoMap}
                        index={i}
                      />
                    ))}
                  </div>
                </SortableContext>
              </DndContext>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
