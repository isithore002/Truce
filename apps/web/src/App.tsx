import { Route, Routes } from 'react-router-dom';
import { AppProvider } from './app/AppContext';
import { AppShell } from './components/layout/AppShell';
import { LandingPage } from './pages/landing/LandingPage';
import { MerchantPage } from './pages/MerchantPage';
import { NotFoundPage } from './pages/NotFoundPage';
import { SetupPage } from './pages/SetupPage';
import { PayPage } from './pages/PayPage';
import { VerifyPage } from './pages/VerifyPage';

export function App() {
  return (
    <AppProvider>
      <AppShell>
        <Routes>
          <Route path="/" element={<LandingPage />} />
          <Route path="/verify" element={<VerifyPage />} />
          <Route path="/pay" element={<PayPage />} />
          <Route path="/pay/:hash" element={<PayPage />} />
          <Route path="/setup" element={<SetupPage />} />
          <Route path="/merchant" element={<MerchantPage />} />
          <Route path="*" element={<NotFoundPage />} />
        </Routes>
      </AppShell>
    </AppProvider>
  );
}
