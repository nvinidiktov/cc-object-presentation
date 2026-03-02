import { useState, useCallback } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { propertiesApi, photosApi, pdfApi } from '../lib/api';
import { downloadBlob } from '../lib/utils';
import DataTab from '../components/DataTab';
import SlideEditor from '../components/SlideEditor';
import { PropertyCreate, Photo, Slide } from 'shared';
import {
  ChevronLeft,
  Layers,
  PencilLine,
  AlertTriangle,
} from 'lucide-react';

type Tab = 'data' | 'editor';

export default function PropertyEdit() {
  const { id } = useParams<{ id: string }>();
  const qc = useQueryClient();
  const [activeTab, setActiveTab] = useState<Tab>('data');
  const [pdfLoading, setPdfLoading] = useState(false);
  const [layoutLoading, setLayoutLoading] = useState(false);
  const [slides, setSlides] = useState<Slide[] | null>(null);
  const [slidesEdited, setSlidesEdited] = useState(false);
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
      // НЕ сбрасываем slides — пусть пользователь решает когда пересоздать
    },
  });

  // ─── Generate layout ───────────────────────────────────────────────────────
  const generateLayout = useCallback(async () => {
    setLayoutLoading(true);
    try {
      const result = await pdfApi.getLayout(id!);
      setSlides(result.slides);
      setLayoutWarnings(result.warnings);
      setSlidesEdited(false);
      setActiveTab('editor');
    } catch (err: any) {
      alert('Ошибка: ' + err.message);
    } finally {
      setLayoutLoading(false);
    }
  }, [id]);

  // ─── Generate PDF ─────────────────────────────────────────────────────────
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

  // ─── Slide editing callbacks ───────────────────────────────────────────────
  const handleSlidesChange = useCallback((newSlides: Slide[]) => {
    setSlides(newSlides);
    setSlidesEdited(true);
  }, []);

  const handleTextChange = useCallback((slideId: string, paragraphs: string[]) => {
    setSlides(prev => {
      if (!prev) return prev;
      return prev.map(s =>
        s.id === slideId ? { ...s, paragraphs } : s
      );
    });
    setSlidesEdited(true);
  }, []);

  // ─── Tab switch logic ─────────────────────────────────────────────────────
  const handleTabSwitch = useCallback((newTab: Tab) => {
    if (newTab === 'editor' && !slides) {
      // Первый вход в редактор — автогенерация
      generateLayout();
      return;
    }
    if (newTab === 'data' && slides && slidesEdited) {
      // Синхронизируем текст обратно в property description
      const reconstructed = slides
        .filter(s => s.type === 'content' || s.type === 'full-text')
        .flatMap(s => s.paragraphs ?? [])
        .join('\n\n');
      if (reconstructed && property) {
        updateMutation.mutate({
          ...property,
          description: reconstructed,
        } as PropertyCreate);
      }
    }
    setActiveTab(newTab);
  }, [slides, slidesEdited, generateLayout, property, updateMutation]);

  // ─── Loading / not found ──────────────────────────────────────────────────
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

  // ─── Tabs config ──────────────────────────────────────────────────────────
  const tabs: { id: Tab; label: string; icon: React.ElementType; badge?: number }[] = [
    { id: 'data', label: 'Данные', icon: PencilLine, badge: photos.length > 0 ? photos.length : undefined },
    { id: 'editor', label: 'Редактор слайдов', icon: Layers, badge: slides?.length },
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

        {/* Actions moved to SlideEditor */}
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
            onClick={() => handleTabSwitch(tab.id)}
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
      {activeTab === 'data' && (
        <DataTab
          property={property}
          propertyId={id!}
          photos={photos}
          photosLoading={photosLoading}
          onSubmit={async values => { await updateMutation.mutateAsync(values as PropertyCreate); }}
          isLoading={updateMutation.isPending}
        />
      )}

      {activeTab === 'editor' && (
        <SlideEditor
          slides={slides}
          property={property}
          photoMap={photoMap}
          onSlidesChange={handleSlidesChange}
          onTextChange={handleTextChange}
          onGenerate={generateLayout}
          onExportPdf={handleExportPdf}
          pdfLoading={pdfLoading}
          layoutLoading={layoutLoading}
          slidesEdited={slidesEdited}
        />
      )}
    </div>
  );
}
