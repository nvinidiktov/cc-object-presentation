import { Outlet, Link, useLocation } from 'react-router-dom';
import { Building2, Plus, LogOut } from 'lucide-react';
import { useAuthStore } from '../stores/authStore';

export default function Layout() {
  const location = useLocation();
  const isNew = location.pathname === '/new';
  const userId = useAuthStore((s) => s.userId);
  const logout = useAuthStore((s) => s.logout);

  return (
    <div className="min-h-screen flex flex-col">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2 font-semibold text-gray-900">
            <Building2 className="w-5 h-5 text-red-600" />
            <span>CC Презентации</span>
          </Link>
          <div className="flex items-center gap-3">
            {!isNew && (
              <Link to="/new" className="btn-primary text-sm">
                <Plus className="w-4 h-4" />
                Новый объект
              </Link>
            )}
            <span className="text-sm text-gray-500">@{userId}</span>
            <button onClick={logout} className="text-gray-400 hover:text-gray-600 transition-colors" title="Выйти">
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>
      </header>

      {/* Main */}
      <main className="flex-1 max-w-7xl mx-auto w-full px-4 sm:px-6 py-8">
        <Outlet />
      </main>
    </div>
  );
}
