import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { AdminApp } from './AdminApp';
import '../styles.css';

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error('Root element not found');
}

// Served for "/admin" only while the admin area is configured; all data comes from /api/admin after login.
createRoot(rootElement).render(
  <StrictMode>
    <AdminApp />
  </StrictMode>
);
