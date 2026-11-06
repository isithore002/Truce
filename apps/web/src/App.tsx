import { Route, Routes, useLocation } from 'react-router-dom';
import { AppProvider } from './app/AppContext';
import { ErrorBoundary } from './app/ErrorBoundary';
import { AppShell } from './components/layout/AppShell';
import { DemoPage } from './pages/DemoPage';
import { LandingPage } from './pages/landing/LandingPage';
import { MerchantPage } from './pages/MerchantPage';
import { NotFoundPage } from './pages/NotFoundPage';
import { SetupPage } from './pages/SetupPage';
import { PayPage } from './pages/PayPage';
import { VerifyPage } from './pages/VerifyPage';

export function App() {
  const { pathname } = useLocation();
  return (
    <AppProvider>
      <AppShell>
        <ErrorBoundary>
        {/* keyed by path so every page plays its entrance once (styles/motion.css) */}
        <div key={pathname} className="route-enter">
        <Routes>
          <Route path="/" element={<LandingPage />} />
          <Route path="/verify" element={<VerifyPage />} />
          <Route path="/pay" element={<PayPage />} />
          <Route path="/pay/:hash" element={<PayPage />} />
          <Route path="/setup" element={<SetupPage />} />
          <Route path="/merchant" element={<MerchantPage />} />
          <Route path="/demo" element={<DemoPage />} />
          <Route path="*" element={<NotFoundPage />} />
        </Routes>
        </div>
        </ErrorBoundary>
      </AppShell>
    </AppProvider>
  );
}
