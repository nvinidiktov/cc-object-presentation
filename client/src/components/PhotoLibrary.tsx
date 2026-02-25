import { useState, useRef, useCallback } from 'react';
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
import { Photo, PhotoType } from 'shared';
import { photosApi, photoUrl } from '../lib/api';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Trash2, Upload, GripVertical, ImageIcon, LayoutGrid, Maximize } from 'lucide-react';

// ─── Sortable photo card (simplified) ────────────────────────────────────────

function SortablePhoto({
  photo,
  index,
  onDelete,
}: {
  photo: Photo;
  index: number;
  onDelete: (id: string) => void;
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
      style={style}
      className="relative group rounded-lg overflow-hidden border border-gray-200 bg-gray-50"
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
        <GripVertical className="w-3 h-3" />
      </div>
      {/* Delete button */}
      <button
        onClick={() => onDelete(photo.id)}
        className="absolute top-1 right-1 p-1 bg-black/40 rounded text-white opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-600"
      >
        <Trash2 className="w-3 h-3" />
      </button>
      {/* Order number */}
      <div className="absolute bottom-1 left-1 bg-black/50 text-white text-[10px] px-1.5 py-0.5 rounded font-mono">
        #{index + 1}
      </div>
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
        border-2 border-dashed rounded-lg p-4 text-center cursor-pointer transition-colors
        ${dragging ? 'border-gray-900 bg-gray-50' : 'border-gray-300 hover:border-gray-400'}
      `}
    >
      <Upload className="w-6 h-6 mx-auto text-gray-400 mb-1" />
      <p className="text-sm font-medium text-gray-700">{label}</p>
      <p className="text-xs text-gray-400 mt-0.5">{hint}</p>
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

// ─── Upload progress ─────────────────────────────────────────────────────────

interface UploadingFile {
  name: string;
  progress: number;
}

// ─── Main component ──────────────────────────────────────────────────────────

interface Props {
  propertyId: string;
  photos: Photo[];
  property?: unknown;
}

export default function PhotoLibrary({ propertyId, photos }: Props) {
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

  // ─── Upload mutation ────────────────────────────────────────────────────────

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

  // ─── Delete ─────────────────────────────────────────────────────────────────

  const deleteMutation = useMutation({
    mutationFn: (photoId: string) => photosApi.delete(propertyId, photoId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['photos', propertyId] }),
  });

  // ─── Reorder ────────────────────────────────────────────────────────────────

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

  // ─── Render photo section (shared for all types) ────────────────────────────

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

      {/* Uploading progress */}
      {type === 'regular' && uploading.map(u => (
        <div key={u.name} className="text-xs text-gray-500 flex items-center gap-2">
          <div className="flex-1 bg-gray-200 rounded h-1">
            <div className="bg-gray-900 h-1 rounded transition-all" style={{ width: `${u.progress}%` }} />
          </div>
          <span className="truncate max-w-[200px]">{u.name}</span>
        </div>
      ))}

      {/* Simple flat grid */}
      {list.length > 0 && (
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={e => handleDragEnd(e, type, list)}
        >
          <SortableContext items={list.map(p => p.id)} strategy={rectSortingStrategy}>
            <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-6 gap-2">
              {list.map((photo, i) => (
                <SortablePhoto
                  key={photo.id}
                  photo={photo}
                  index={i}
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
      {renderPhotoSection(
        'Основные фото',
        '(появятся на слайдах с текстом и в сетке)',
        'Перетащите фотографии или нажмите для выбора',
        'regular',
        regularPhotos,
        ImageIcon,
        true
      )}

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
