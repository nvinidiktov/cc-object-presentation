import { useDroppable } from '@dnd-kit/core';
import { Photo } from 'shared';
import DraggablePhoto from './DraggablePhoto';
import { ImageIcon } from 'lucide-react';

interface Props {
  slideId: string;
  slotIndex: number;
  photo?: Photo;
}

export default function PhotoDropSlot({ slideId, slotIndex, photo }: Props) {
  const { setNodeRef, isOver } = useDroppable({
    id: `slot-${slideId}-${slotIndex}`,
    data: { type: 'slot', slideId, slotIndex },
  });

  return (
    <div
      ref={setNodeRef}
      className={`
        aspect-[3/2] rounded border-2 overflow-hidden transition-colors
        ${isOver
          ? 'border-blue-400 bg-blue-50'
          : photo
            ? 'border-gray-200 bg-gray-100'
            : 'border-dashed border-gray-300 bg-gray-50'
        }
      `}
    >
      {photo ? (
        <DraggablePhoto
          photoId={photo.id}
          filename={photo.filename}
          slideId={slideId}
          slotIndex={slotIndex}
        />
      ) : (
        <div className="w-full h-full flex items-center justify-center">
          <ImageIcon className="w-6 h-6 text-gray-300" />
        </div>
      )}
    </div>
  );
}
