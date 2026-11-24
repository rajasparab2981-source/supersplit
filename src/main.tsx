import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import './styles.css';

const el = document.getElementById('root');
if (!el) throw new Error('Missing #root element');

createRoot(el).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

// Offline shell + "Add to Home Screen". Production only, so dev reloads stay fresh.
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch((e) => console.warn('Service worker registration failed', e));
  });
}
