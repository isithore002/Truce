import { Route, Routes } from 'react-router-dom';
import { AppProvider } from './app/AppContext';
import { AppShell } from './components/layout/AppShell';
import { NotFoundPage } from './pages/NotFoundPage';
import { VerifyPage } from './pages/VerifyPage';

export function App() {
  return (
    <AppProvider>
      <AppShell>
        <Routes>
          <Route path="/verify" element={<VerifyPage />} />
          <Route path="*" element={<NotFoundPage />} />
        </Routes>
      </AppShell>
    </AppProvider>
  );
}
