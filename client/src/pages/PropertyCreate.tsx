import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { propertiesApi } from '../lib/api';
import PropertyForm from '../components/PropertyForm';
import { PropertyCreate as PC } from 'shared';
import { ChevronLeft } from 'lucide-react';
import { Link } from 'react-router-dom';

export default function PropertyCreate() {
  const navigate = useNavigate();
  const qc = useQueryClient();

  const mutation = useMutation({
    mutationFn: (values: PC) => propertiesApi.create(values),
    onSuccess: (property) => {
      qc.invalidateQueries({ queryKey: ['properties'] });
      navigate(`/property/${property.id}`);
    },
  });

  return (
    <div className="max-w-3xl mx-auto">
      <div className="mb-6">
        <Link to="/" className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-900 mb-3">
          <ChevronLeft className="w-4 h-4" />
          Все объекты
        </Link>
        <h1 className="text-2xl font-bold text-gray-900">Новый объект</h1>
        <p className="text-gray-500 text-sm mt-1">
          Заполните данные — фото и генерацию PDF сделаете на следующем шаге
        </p>
      </div>

      {mutation.error && (
        <div className="mb-4 p-3 rounded-md bg-red-50 text-red-700 text-sm">
          Ошибка: {(mutation.error as any).message}
        </div>
      )}

      <PropertyForm
        onSubmit={async values => { await mutation.mutateAsync(values as PC); }}
        isLoading={mutation.isPending}
        submitLabel="Создать объект →"
      />
    </div>
  );
}
