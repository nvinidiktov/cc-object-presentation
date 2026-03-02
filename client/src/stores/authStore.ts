import { create } from 'zustand';

function normalize(nick: string): string {
  return nick.trim().replace(/^@/, '').toLowerCase();
}

interface AuthState {
  userId: string;
  login: (nick: string) => void;
  logout: () => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  userId: localStorage.getItem('userId') || '',
  login: (nick: string) => {
    const id = normalize(nick);
    localStorage.setItem('userId', id);
    set({ userId: id });
  },
  logout: () => {
    localStorage.removeItem('userId');
    set({ userId: '' });
  },
}));
