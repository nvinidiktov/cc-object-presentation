import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { propertiesApi } from '../lib/api';
import { formatDate } from '../lib/utils';
import { Pencil, Trash2, FileText, Plus } from 'lucide-react';
import { Property } from 'shared';

export default function Dashboard() {
  const qc = useQueryClient();
  const { data: properties = [], isLoading } = useQuery({
    queryKey: ['properties'],
    queryFn: propertiesApi.list,
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => propertiesApi.delete(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['properties'] }),
  });

  const handleDelete = (p: Property) => {
    if (confirm(`Удалить объект «${p.name || 'Без названия'}»?`)) {
      deleteMutation.mutate(p.id);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64 text-gray-400">
        Загрузка...
      </div>
    );
  }

  if (properties.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-4 text-center">
        <FileText className="w-12 h-12 text-gray-300" />
        <div>
          <p className="text-gray-500 text-lg font-medium">Нет объектов</p>
          <p className="text-gray-400 text-sm mt-1">Создайте первый объект для презентации</p>
        </div>
        <Link to="/new" className="btn-primary">
          <Plus className="w-4 h-4" />
          Создать объект
        </Link>
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-xl font-semibold text-gray-900">
          Объекты ({properties.length})
        </h1>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {properties.map(p => (
          <div key={p.id} className="card p-5 flex flex-col gap-3">
            <div className="flex items-start justify-between gap-2">
              <div className="flex-1 min-w-0">
                <h2 className="font-semibold text-gray-900 truncate">
                  {p.name || 'Без названия'}
                </h2>
                {p.address && (
                  <p className="text-sm text-gray-500 truncate mt-0.5">{p.address}</p>
                )}
              </div>
              {p.price && (
                <span className="flex-shrink-0 bg-red-600 text-white text-xs font-bold px-2 py-1 rounded">
                  {p.price}
                </span>
              )}
            </div>

            <div className="flex flex-wrap gap-2 text-xs text-gray-500">
              {p.area && <span>📐 {p.area}</span>}
              {p.floor && <span>🏢 {p.floor}</span>}
              {p.metro && <span>🚇 {p.metro}</span>}
            </div>

            <p className="text-xs text-gray-400">
              Изменён {formatDate(p.updatedAt)}
            </p>

            <div className="flex gap-2 pt-1 border-t border-gray-100">
              <Link
                to={`/property/${p.id}`}
                className="btn-secondary text-sm flex-1 justify-center"
              >
                <Pencil className="w-3.5 h-3.5" />
                Редактировать
              </Link>
              <button
                onClick={() => handleDelete(p)}
                className="btn-secondary text-sm text-red-600 hover:bg-red-50"
                disabled={deleteMutation.isPending}
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
