'use client';

import dynamic from 'next/dynamic';

// The dashboard is interactive client code: its live state stream (EventSource) opens only in the browser.
const WebApp = dynamic(() => import('../../../../src/web/WebApp').then((module) => module.WebApp), {
  ssr: false,
  loading: () => <div className="login-page" aria-busy="true" />
});

export function DashboardClient({ initialAuth }: { initialAuth?: 'signed-in' | 'signed-out' }) {
  return <WebApp initialAuth={initialAuth} />;
}
