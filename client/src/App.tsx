import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import Layout from './components/Layout';
import Dashboard from './pages/Dashboard';
import PropertyCreate from './pages/PropertyCreate';
import PropertyEdit from './pages/PropertyEdit';
import LoginPage from './pages/LoginPage';
import { useAuthStore } from './stores/authStore';

export default function App() {
  const userId = useAuthStore((s) => s.userId);

  if (!userId) return <LoginPage />;

  return (
    <BrowserRouter>
      <Routes>
        <Route element={<Layout />}>
          <Route path="/" element={<Dashboard />} />
          <Route path="/new" element={<PropertyCreate />} />
          <Route path="/property/:id" element={<PropertyEdit />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
