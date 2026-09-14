import 'server-only';
import { backendUrl } from './backend';

/**
 * Whether the browser's dashboard session is valid, asked from the backend with the browser's cookie. The cookie is
 * signed with the dashboard password, which only the backend knows. `null` while the backend is unreachable.
 */
export async function fetchDashboardSession(cookie: string | null, forwardedFor: string | null): Promise<boolean | null> {
  if (!cookie?.includes('flagcount_session=')) return false;
  try {
    const response = await fetch(`${backendUrl()}/api/session`, {
      cache: 'no-store',
      headers: { cookie, ...(forwardedFor ? { 'X-Forwarded-For': forwardedFor } : {}) },
      signal: AbortSignal.timeout(3000)
    });
    if (!response.ok) return null;
    const body = (await response.json()) as { authenticated?: unknown };
    return body.authenticated === true;
  } catch {
    return null;
  }
}
