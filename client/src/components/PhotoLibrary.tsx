import { useState, useRef, useCallback, useMemo } from 'react';
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
  rectSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Photo, PhotoType, Property } from 'shared';
import { photosApi, photoUrl } from '../lib/api';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Trash2, Upload, GripVertical, ImageIcon, LayoutGrid, Maximize } from 'lucide-react';

// ─── Slide assignment colors ─────────────────────────────────────────────────

const SLIDE_COLORS = [
  { bg: '#EFF6FF', border: '#BFDBFE', badge: '#3B82F6', label: '#1E40AF' },  // blue
  { bg: '#F0FDF4', border: '#BBF7D0', badge: '#22C55E', label: '#166534' },  // green
  { bg: '#FFF7ED', border: '#FED7AA', badge: '#F97316', label: '#9A3412' },  // orange
  { bg: '#FAF5FF', border: '#E9D5FF', badge: '#A855F7', label: '#6B21A8' },  // purple
  { bg: '#FEF2F2', border: '#FECACA', badge: '#EF4444', label: '#991B1B' },  // red
  { bg: '#ECFDF5', border: '#A7F3D0', badge: '#10B981', label: '#065F46' },  // emerald
  { bg: '#FDF4FF', border: '#F5D0FE', badge: '#D946EF', label: '#86198F' },  // fuchsia
  { bg: '#FFFBEB', border: '#FDE68A', badge: '#F59E0B', label: '#92400E' },  // amber
  { bg: '#F0F9FF', border: '#BAE6FD', badge: '#0EA5E9', label: '#075985' },  // sky
  { bg: '#FDF2F8', border: '#FBCFE8', badge: '#EC4899', label: '#9D174D' },  // pink
];

interface SlideGroup {
  slideNum: number;
  slideLabel: string;
  photoIds: string[];
  color: typeof SLIDE_COLORS[0];
  textSnippet?: string; // превью текста для этого слайда
}

/**
 * Вычисляет, какие фотографии к какому слайду относятся.
 * Повторяет логику layoutEngine на клиенте (только для regular-фото).
 */
function computeSlideGroups(
  regularPhotos: Photo[],
  property?: Property,
): SlideGroup[] {
  const groups: SlideGroup[] = [];
  let photoIdx = 0;
  let slideNum = 1;
  let colorIdx = 0;

  const hasAdvantages = (property?.advantages?.length ?? 0) > 0;
  const nextColor = () => SLIDE_COLORS[colorIdx++ % SLIDE_COLORS.length];

  // Сниппет для титульного: основная информация
  const titleSnippet = property
    ? [property.name, property.address, property.metro, property.price].filter(Boolean).join(' · ')
    : '';

  // Титульный: 2 фото
  const titleIds = regularPhotos.slice(photoIdx, photoIdx + 2).map(p => p.id);
  groups.push({ slideNum, slideLabel: 'Титульный', photoIds: titleIds, color: nextColor(), textSnippet: titleSnippet });
  photoIdx += 2;
  slideNum++;

  // Преимущества: 2 фото
  if (hasAdvantages) {
    const advSnippet = (property?.advantages ?? []).slice(0, 4).map(a => `• ${a}`).join('\n');
    const advIds = regularPhotos.slice(photoIdx, photoIdx + 2).map(p => p.id);
    groups.push({ slideNum, slideLabel: 'Преимущества', photoIds: advIds, color: nextColor(), textSnippet: advSnippet });
    photoIdx += 2;
    slideNum++;
  }

  // Разбиваем описание на абзацы (упрощённо — по пустым строкам)
  const allParagraphs = (property?.description ?? '')
    .split(/\n\s*\n/)
    .map(p => p.trim())
    .filter(Boolean);

  let paraIdx = 0;

  // Контентные слайды: по 2 фото каждый (пока есть фото)
  while (photoIdx < regularPhotos.length) {
    const batch = regularPhotos.slice(photoIdx, photoIdx + 2).map(p => p.id);

    // Примерно берём 2-3 абзаца на слайд (упрощённо)
    const snippetParas: string[] = [];
    let charCount = 0;
    while (paraIdx < allParagraphs.length && charCount < 200) {
      snippetParas.push(allParagraphs[paraIdx]);
      charCount += allParagraphs[paraIdx].length;
      paraIdx++;
    }
    const textSnippet = snippetParas.join('\n').slice(0, 200) + (snippetParas.join('\n').length > 200 ? '...' : '');

    groups.push({
      slideNum,
      slideLabel: paraIdx <= allParagraphs.length && snippetParas.length > 0 ? 'Контент' : 'Фото-сетка',
      photoIds: batch,
      color: nextColor(),
      textSnippet: textSnippet || undefined,
    });
    photoIdx += 2;
    slideNum++;
  }

  return groups;
}

// ─── Sortable photo card ──────────────────────────────────────────────────────

function SortablePhoto({
  photo,
  onDelete,
  slideColor,
  slideLabel,
  slideNum,
}: {
  photo: Photo;
  onDelete: (id: string) => void;
  slideColor?: typeof SLIDE_COLORS[0];
  slideLabel?: string;
  slideNum?: number;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: photo.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={{
        ...style,
        background: slideColor?.bg ?? '#f3f4f6',
        borderColor: slideColor?.border ?? '#e5e7eb',
      }}
      className="relative group rounded-lg overflow-hidden border-2"
    >
      <div className="aspect-[3/2]">
        <img
          src={photoUrl(photo.filename)}
          alt=""
          className="w-full h-full object-cover"
        />
      </div>
      {/* Drag handle */}
      <div
        {...attributes}
        {...listeners}
        className="absolute top-1 left-1 p-1 bg-black/40 rounded cursor-grab text-white opacity-0 group-hover:opacity-100 transition-opacity"
      >
        <GripVertical className="w-3.5 h-3.5" />
      </div>
      {/* Delete button */}
      <button
        onClick={() => onDelete(photo.id)}
        className="absolute top-1 right-1 p-1 bg-black/40 rounded text-white opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-600"
      >
        <Trash2 className="w-3.5 h-3.5" />
      </button>
      {/* Order badge */}
      <div className="absolute bottom-1 left-1 bg-black/50 text-white text-xs px-1.5 py-0.5 rounded">
        #{photo.orderIndex + 1}
      </div>
      {/* Slide assignment badge */}
      {slideLabel && slideNum != null && slideColor && (
        <div
          className="absolute bottom-1 right-1 text-xs px-1.5 py-0.5 rounded font-medium"
          style={{
            background: slideColor.badge,
            color: '#fff',
          }}
        >
          С{slideNum}
        </div>
      )}
    </div>
  );
}

// ─── Upload zone ──────────────────────────────────────────────────────────────

interface UploadZoneProps {
  label: string;
  hint: string;
  onFiles: (files: File[]) => void;
  accept?: string;
  multiple?: boolean;
}

function UploadZone({ label, hint, onFiles, accept = 'image/*', multiple = true }: UploadZoneProps) {
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragging(false);
      const files = Array.from(e.dataTransfer.files).filter(f => f.type.startsWith('image/'));
      if (files.length > 0) onFiles(files);
    },
    [onFiles]
  );

  return (
    <div
      onDragOver={e => { e.preventDefault(); setDragging(true); }}
      onDragLeave={() => setDragging(false)}
      onDrop={handleDrop}
      onClick={() => inputRef.current?.click()}
      className={`
        border-2 border-dashed rounded-lg p-6 text-center cursor-pointer transition-colors
        ${dragging ? 'border-gray-900 bg-gray-50' : 'border-gray-300 hover:border-gray-400'}
      `}
    >
      <Upload className="w-8 h-8 mx-auto text-gray-400 mb-2" />
      <p className="text-sm font-medium text-gray-700">{label}</p>
      <p className="text-xs text-gray-400 mt-1">{hint}</p>
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        multiple={multiple}
        className="hidden"
        onChange={e => {
          const files = Array.from(e.target.files ?? []);
          if (files.length > 0) onFiles(files);
          e.target.value = '';
        }}
      />
    </div>
  );
}

// ─── Upload progress ───────────────────────────────────────────────────────────

interface UploadingFile {
  name: string;
  progress: number;
}

// ─── Main component ───────────────────────────────────────────────────────────

interface Props {
  propertyId: string;
  photos: Photo[];
  property?: Property;
}

export default function PhotoLibrary({ propertyId, photos, property }: Props) {
  const qc = useQueryClient();
  const [uploading, setUploading] = useState<UploadingFile[]>([]);

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  // Group photos by type
  const regularPhotos = photos.filter(p => p.type === 'regular').sort((a, b) => a.orderIndex - b.orderIndex);
  const fullscreenPhotos = photos.filter(p => p.type === 'fullscreen').sort((a, b) => a.orderIndex - b.orderIndex);
  const floorplanPhotos = photos.filter(p => p.type === 'floorplan').sort((a, b) => a.orderIndex - b.orderIndex);

  // Compute slide assignment for regular photos
  const slideGroups = useMemo(() => {
    return computeSlideGroups(regularPhotos, property);
  }, [regularPhotos, property]);

  // Build lookup: photoId → { slideNum, slideLabel, color }
  const photoSlideMap = useMemo(() => {
    const map = new Map<string, { slideNum: number; slideLabel: string; color: typeof SLIDE_COLORS[0] }>();
    for (const g of slideGroups) {
      for (const id of g.photoIds) {
        map.set(id, { slideNum: g.slideNum, slideLabel: g.slideLabel, color: g.color });
      }
    }
    return map;
  }, [slideGroups]);

  // ─── Upload mutation ──────────────────────────────────────────────────────

  const uploadFiles = async (files: File[], type: PhotoType) => {
    for (const file of files) {
      const entry: UploadingFile = { name: file.name, progress: 0 };
      setUploading(prev => [...prev, entry]);
      try {
        await photosApi.upload(propertyId, file, type, pct => {
          setUploading(prev =>
            prev.map(u => (u.name === file.name ? { ...u, progress: pct } : u))
          );
        });
        await qc.invalidateQueries({ queryKey: ['photos', propertyId] });
      } catch (err) {
        console.error('Upload error:', err);
      } finally {
        setUploading(prev => prev.filter(u => u.name !== file.name));
      }
    }
  };

  // ─── Delete ───────────────────────────────────────────────────────────────

  const deleteMutation = useMutation({
    mutationFn: (photoId: string) => photosApi.delete(propertyId, photoId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['photos', propertyId] }),
  });

  // ─── Reorder ──────────────────────────────────────────────────────────────

  const handleDragEnd = async (event: DragEndEvent, type: PhotoType, list: Photo[]) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const oldIndex = list.findIndex(p => p.id === active.id);
    const newIndex = list.findIndex(p => p.id === over.id);
    const reordered = arrayMove(list, oldIndex, newIndex);

    const items = reordered.map((p, i) => ({ id: p.id, orderIndex: i }));
    await photosApi.reorder(propertyId, items);
    qc.invalidateQueries({ queryKey: ['photos', propertyId] });
  };

  // ─── Render: Regular photos with slide grouping ─────────────────────────

  const renderRegularSection = () => (
    <section className="space-y-3">
      <div className="flex items-center gap-2">
        <ImageIcon className="w-4 h-4 text-gray-500" />
        <h3 className="font-medium text-gray-800 text-sm">Основные фото</h3>
        <span className="text-xs text-gray-400">(появятся на слайдах с текстом и в сетке)</span>
      </div>

      <UploadZone
        label="Перетащите фотографии или нажмите для выбора"
        hint="JPG, PNG, WebP — до 20 МБ"
        onFiles={files => uploadFiles(files, 'regular')}
      />

      {/* Uploading progress */}
      {uploading.map(u => (
        <div key={u.name} className="text-xs text-gray-500 flex items-center gap-2">
          <div className="flex-1 bg-gray-200 rounded h-1">
            <div className="bg-gray-900 h-1 rounded transition-all" style={{ width: `${u.progress}%` }} />
          </div>
          <span className="truncate max-w-[200px]">{u.name}</span>
        </div>
      ))}

      {/* Slide-grouped grid */}
      {regularPhotos.length > 0 && (
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={e => handleDragEnd(e, 'regular', regularPhotos)}
        >
          <SortableContext items={regularPhotos.map(p => p.id)} strategy={rectSortingStrategy}>
            {/* Slide group headers + photos */}
            {slideGroups.length > 0 ? (
              <div className="space-y-4">
                {slideGroups.map(group => {
                  const groupPhotos = group.photoIds
                    .map(id => regularPhotos.find(p => p.id === id))
                    .filter(Boolean) as Photo[];
                  if (groupPhotos.length === 0) return null;
                  return (
                    <div key={group.slideNum} className="rounded-lg p-3" style={{ background: group.color.bg, border: `1px solid ${group.color.border}` }}>
                      {/* Group header */}
                      <div className="flex items-center gap-2 mb-2">
                        <div
                          className="w-2 h-2 rounded-full"
                          style={{ background: group.color.badge }}
                        />
                        <span
                          className="text-xs font-medium"
                          style={{ color: group.color.label }}
                        >
                          Слайд {group.slideNum}: {group.slideLabel}
                        </span>
                        <div className="flex-1 border-t" style={{ borderColor: group.color.border }} />
                      </div>
                      {/* Text snippet */}
                      {group.textSnippet && (
                        <div
                          className="text-xs text-gray-600 mb-2 whitespace-pre-wrap leading-relaxed px-1"
                          style={{ maxHeight: 60, overflow: 'hidden' }}
                        >
                          {group.textSnippet}
                        </div>
                      )}
                      {/* Photos in group */}
                      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
                        {groupPhotos.map(photo => {
                          const info = photoSlideMap.get(photo.id);
                          return (
                            <SortablePhoto
                              key={photo.id}
                              photo={photo}
                              onDelete={id => deleteMutation.mutate(id)}
                              slideColor={info?.color}
                              slideLabel={info?.slideLabel}
                              slideNum={info?.slideNum}
                            />
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
                {regularPhotos.map(photo => (
                  <SortablePhoto
                    key={photo.id}
                    photo={photo}
                    onDelete={id => deleteMutation.mutate(id)}
                  />
                ))}
              </div>
            )}
          </SortableContext>
        </DndContext>
      )}
    </section>
  );

  // ─── Render: Fullscreen & Floorplan sections (same as before) ────────────

  const renderPhotoSection = (
    title: string,
    hint: string,
    uploadLabel: string,
    type: PhotoType,
    list: Photo[],
    Icon: React.ElementType,
    multiple = true
  ) => (
    <section className="space-y-3">
      <div className="flex items-center gap-2">
        <Icon className="w-4 h-4 text-gray-500" />
        <h3 className="font-medium text-gray-800 text-sm">{title}</h3>
        <span className="text-xs text-gray-400">{hint}</span>
      </div>

      <UploadZone
        label={uploadLabel}
        hint="JPG, PNG, WebP — до 20 МБ"
        onFiles={files => uploadFiles(files, type)}
        multiple={multiple}
      />

      {list.length > 0 && (
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={e => handleDragEnd(e, type, list)}
        >
          <SortableContext items={list.map(p => p.id)} strategy={rectSortingStrategy}>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
              {list.map(photo => (
                <SortablePhoto
                  key={photo.id}
                  photo={photo}
                  onDelete={id => deleteMutation.mutate(id)}
                />
              ))}
            </div>
          </SortableContext>
        </DndContext>
      )}
    </section>
  );

  return (
    <div className="space-y-8">
      {renderRegularSection()}

      {renderPhotoSection(
        'Полноэкранные фото',
        '(вставляются между контентными слайдами)',
        'Перетащите или выберите несколько фото',
        'fullscreen',
        fullscreenPhotos,
        Maximize,
        true
      )}

      {renderPhotoSection(
        'Планировки',
        '(каждая планировка = последний слайд)',
        'Перетащите или выберите планировки',
        'floorplan',
        floorplanPhotos,
        LayoutGrid,
        true
      )}
    </div>
  );
}
