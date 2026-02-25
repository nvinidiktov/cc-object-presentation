import { useDraggable } from '@dnd-kit/core';
import { photoUrl } from '../lib/api';

interface Props {
  photoId: string;
  filename: string;
  slideId: string;
  slotIndex: number;
}

export default function DraggablePhoto({ photoId, filename, slideId, slotIndex }: Props) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `photo-${photoId}`,
    data: { type: 'photo', photoId, slideId, slotIndex },
  });

  return (
    <div
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      className="w-full h-full cursor-grab active:cursor-grabbing"
      style={{ opacity: isDragging ? 0.4 : 1 }}
    >
      <img
        src={photoUrl(filename)}
        alt=""
        className="w-full h-full object-cover rounded"
        draggable={false}
      />
    </div>
  );
}
