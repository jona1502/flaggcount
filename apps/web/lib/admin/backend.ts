import 'server-only';
import { ADMIN_ASSERTION_HEADER, signAdminAssertion } from '../../../../sidecar/src/web/admin/adminAssertion';
import { backendUrl } from '../backend';
import { adminRuntime } from './runtime';

export type AdminBackendResult<T> = { ok: true; status: number; data: T } | { ok: false; status: number; error: string };

/**
 * Calls the backend admin API for an administrator this container has authenticated. Every request carries a
 * fresh proof signed for exactly its method and path; the backend checks it and the allowlist again.
 */
export async function adminBackend<T>(
  admin: { subject: string; login: string },
  method: 'GET' | 'POST',
  pathWithQuery: string,
  options: { body?: unknown; forwardedFor?: string | null; secret?: string } = {}
): Promise<AdminBackendResult<T>> {
  const secret = options.secret ?? adminRuntime()?.assertionSecret;
  if (!secret) return { ok: false, status: 503, error: 'admin-unavailable' };

  const url = new URL(pathWithQuery, `${backendUrl()}/`);
  const headers: Record<string, string> = {
    [ADMIN_ASSERTION_HEADER]: signAdminAssertion({ subject: admin.subject, login: admin.login, method, path: url.pathname, secret })
  };
  if (options.body !== undefined) headers['Content-Type'] = 'application/json';
  if (options.forwardedFor) headers['X-Forwarded-For'] = options.forwardedFor;

  let response: Response;
  try {
    response = await fetch(url, {
      method,
      headers,
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
      cache: 'no-store',
      signal: AbortSignal.timeout(10_000)
    });
  } catch {
    return { ok: false, status: 503, error: 'backend-unreachable' };
  }
  const data = (await response.json().catch(() => ({}))) as Record<string, unknown>;
  return response.ok
    ? { ok: true, status: response.status, data: data as T }
    : { ok: false, status: response.status, error: typeof data['error'] === 'string' ? data['error'] : 'unknown' };
}
