import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { Toaster } from 'sonner';
import { App } from './App';
import { VaultProvider } from './state/vault';
import './index.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <VaultProvider>
        <App />
        <Toaster richColors position="bottom-right" />
      </VaultProvider>
    </BrowserRouter>
  </StrictMode>,
);
