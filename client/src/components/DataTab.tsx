import { PropertyCreate, Photo, Property } from 'shared';
import PropertyForm from './PropertyForm';
import PhotoLibrary from './PhotoLibrary';

interface Props {
  property: Property;
  propertyId: string;
  photos: Photo[];
  photosLoading: boolean;
  onSubmit: (values: PropertyCreate) => void | Promise<void>;
  isLoading: boolean;
}

export default function DataTab({
  property,
  propertyId,
  photos,
  photosLoading,
  onSubmit,
  isLoading,
}: Props) {
  return (
    <div className="space-y-8">
      {/* Форма свойств с автосохранением */}
      <PropertyForm
        defaultValues={property}
        onSubmit={values => onSubmit(values as PropertyCreate)}
        isLoading={isLoading}
        autoSave
      />

      {/* Фотографии */}
      <div className="card p-6">
        <h2 className="font-semibold text-gray-900 text-base border-b border-gray-100 pb-3 mb-5">
          Фотографии
        </h2>
        {photosLoading ? (
          <div className="text-gray-400 text-center py-8">Загрузка фото...</div>
        ) : (
          <PhotoLibrary propertyId={propertyId} photos={photos} property={property} />
        )}
      </div>
    </div>
  );
}
