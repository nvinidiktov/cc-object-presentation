import { useState } from 'react';
import { Building2 } from 'lucide-react';
import { useAuthStore } from '../stores/authStore';

export default function LoginPage() {
  const [nick, setNick] = useState('');
  const [error, setError] = useState('');
  const login = useAuthStore((s) => s.login);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const clean = nick.trim().replace(/^@/, '');
    if (clean.length < 2) {
      setError('Минимум 2 символа');
      return;
    }
    if (!/^[a-zA-Z0-9_]+$/.test(clean)) {
      setError('Только латиница, цифры и _');
      return;
    }
    login(nick);
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
      <div className="w-full max-w-sm">
        <div className="flex flex-col items-center mb-8">
          <Building2 className="w-10 h-10 text-red-600 mb-3" />
          <h1 className="text-xl font-semibold text-gray-900">CC Презентации</h1>
          <p className="text-sm text-gray-500 mt-1">Введите ваш Telegram-никнейм</p>
        </div>

        <form onSubmit={handleSubmit} className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 space-y-4">
          <div>
            <input
              type="text"
              value={nick}
              onChange={(e) => { setNick(e.target.value); setError(''); }}
              placeholder="@your_nickname"
              autoFocus
              className="w-full px-4 py-2.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-red-500 focus:border-red-500 outline-none"
            />
            {error && <p className="text-red-500 text-xs mt-1.5">{error}</p>}
          </div>
          <button
            type="submit"
            className="w-full bg-red-600 text-white py-2.5 rounded-lg text-sm font-medium hover:bg-red-700 transition-colors"
          >
            Войти
          </button>
        </form>
      </div>
    </div>
  );
}
