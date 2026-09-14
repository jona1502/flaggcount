import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { requireAdmin } from '../../../lib/admin/session';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: { default: 'Admin', template: '%s · FlagCount Admin' },
  robots: { index: false, follow: false }
};

/** Every page below renders only for a signed-in administrator; everyone else is sent to the login. */
export default async function ProtectedAdminLayout({ children }: { children: ReactNode }) {
  const admin = await requireAdmin();

  return (
    <div className="app admin-app">
      <header className="app-header">
        <div className="app-brand">
          <div className="app-mark" aria-hidden="true">
            🚩
          </div>
          <p className="admin-brand-title">FlagCount Admin</p>
        </div>
        <div className="admin-account">
          <span>Angemeldet als {admin.login}</span>
          <form method="post" action="/admin/auth/logout">
            <input type="hidden" name="csrfToken" value={admin.csrfToken} />
            <button className="text-button" type="submit">
              Abmelden
            </button>
          </form>
        </div>
      </header>
      {children}
    </div>
  );
}
