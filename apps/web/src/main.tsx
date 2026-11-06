import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { App } from './App';
import './styles/tokens.css';
import './styles/base.css';
import './styles/ui.css';
import './styles/app.css';
import './styles/motion.css';
import './styles/dashboard.css';
import './styles/accent.css';
import './styles/neon.css';
import './styles/premium.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </StrictMode>,
);
