import { Route, Routes } from 'react-router-dom';
import { AppProvider } from './app/AppContext';
import { AppShell } from './components/layout/AppShell';
import { NotFoundPage } from './pages/NotFoundPage';

export function App() {
  return (
    <AppProvider>
      <AppShell>
        <Routes>
          <Route path="*" element={<NotFoundPage />} />
        </Routes>
      </AppShell>
    </AppProvider>
  );
}
