import { Outlet, Link, useLocation } from 'react-router-dom';
import { Plus, LogOut } from 'lucide-react';
import { useAuthStore } from '../stores/authStore';

export default function Layout() {
  const location = useLocation();
  const isNew = location.pathname === '/new';
  const userId = useAuthStore((s) => s.userId);
  const logout = useAuthStore((s) => s.logout);

  return (
    <div className="min-h-screen flex flex-col">
      {/* Header */}
      <header className="bg-brand-navy sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-3">
            <img src="/logo.svg" alt="Венедиктов и Партнёры" className="h-7" />
            <span className="text-white/50 text-sm hidden sm:inline">Сервис презентаций</span>
          </Link>
          <div className="flex items-center gap-3">
            {!isNew && (
              <Link to="/new" className="btn-primary text-sm">
                <Plus className="w-4 h-4" />
                Новый объект
              </Link>
            )}
            <span className="text-sm text-white/60">@{userId}</span>
            <button onClick={logout} className="text-white/40 hover:text-white/70 transition-colors" title="Выйти">
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
