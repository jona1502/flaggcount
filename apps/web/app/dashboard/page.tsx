import type { Metadata } from 'next';
import { headers } from 'next/headers';
import { DashboardClient } from '../../components/dashboard/DashboardClient';
import { fetchDashboardSession } from '../../lib/dashboardSession';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Web-Dashboard',
  robots: { index: false, follow: false }
};

/**
 * The browser dashboard: the same components as the desktop app, talking to the backend. The session is checked
 * at this route boundary so the page starts with the login or the dashboard; if the backend cannot answer, the
 * browser checks again itself.
 */
export default async function DashboardPage() {
  const requestHeaders = await headers();
  const session = await fetchDashboardSession(requestHeaders.get('cookie'), requestHeaders.get('x-forwarded-for'));
  const initialAuth = session === null ? undefined : session ? 'signed-in' : 'signed-out';

  return <DashboardClient initialAuth={initialAuth} />;
}
