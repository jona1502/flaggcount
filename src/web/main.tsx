import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { CheckoutSuccess } from './CheckoutSuccess';
import { LandingPage } from './LandingPage';
import { WebApp } from './WebApp';
import '../styles.css';

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error('Root element not found');
}

// The server serves this bundle for "/" and "/pro" (landing page), "/pro/erfolgreich" (after Stripe
// Checkout) and "/dashboard" (login and dashboard).
const path = window.location.pathname.replace(/\/+$/, '');
const page = path === '/dashboard' ? <WebApp /> : path === '/pro/erfolgreich' ? <CheckoutSuccess /> : <LandingPage />;

createRoot(rootElement).render(<StrictMode>{page}</StrictMode>);
