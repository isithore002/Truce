import { Route, Routes } from 'react-router-dom';
import { AppProvider } from './app/AppContext';
import { AppShell } from './components/layout/AppShell';
import { NotFoundPage } from './pages/NotFoundPage';
import { PayPage } from './pages/PayPage';
import { VerifyPage } from './pages/VerifyPage';

export function App() {
  return (
    <AppProvider>
      <AppShell>
        <Routes>
          <Route path="/verify" element={<VerifyPage />} />
          <Route path="/pay" element={<PayPage />} />
          <Route path="/pay/:hash" element={<PayPage />} />
          <Route path="*" element={<NotFoundPage />} />
        </Routes>
      </AppShell>
    </AppProvider>
  );
}
