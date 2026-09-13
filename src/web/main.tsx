import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { LandingPage } from './LandingPage';
import { WebApp } from './WebApp';
import '../styles.css';

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error('Root element not found');
}

// The server serves this bundle for "/" (landing page) and "/dashboard" (login and dashboard).
const isDashboard = window.location.pathname.replace(/\/+$/, '') === '/dashboard';

createRoot(rootElement).render(<StrictMode>{isDashboard ? <WebApp /> : <LandingPage />}</StrictMode>);
