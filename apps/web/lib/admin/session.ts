import 'server-only';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { ADMIN_SESSION_COOKIE } from '../../../../sidecar/src/web/admin/adminAuth';
import { emailAdminSubject } from '../../../../sidecar/src/web/admin/adminAuth';
import { adminRuntime, type AdminRuntime } from './runtime';

/** The signed-in administrator as pages may see it; no session token. */
export type AdminIdentity = {
  subject: string;
  login: string;
  csrfToken: string;
  expiresAt: string;
};

/** The administrator of this request, or `null`. Checks the allowlist again on every call. */
export async function currentAdmin(runtime: AdminRuntime | null = adminRuntime()): Promise<AdminIdentity | null> {
  if (!runtime) return null;
  const token = (await cookies()).get(ADMIN_SESSION_COOKIE)?.value;
  const session = runtime.sessions.verify(token);
  if (!session) return null;
  const allowed = runtime.config.email
    ? session.subject === emailAdminSubject(runtime.config.email)
    : runtime.config.allowedUserIds.has(session.subject.slice('github:'.length));
  if (!allowed) {
    // The account lost its admin right: end the session instead of waiting for it to expire.
    runtime.sessions.destroy(token);
    return null;
  }
  return {
    subject: session.subject,
    login: session.login,
    csrfToken: session.csrfToken,
    expiresAt: new Date(runtime.sessions.expiresAt(session)).toISOString()
  };
}

/** For every protected admin page and action: the administrator, or a redirect to the login. */
export async function requireAdmin(): Promise<AdminIdentity> {
  const admin = await currentAdmin();
  if (!admin) redirect('/admin/login');
  return admin;
}
