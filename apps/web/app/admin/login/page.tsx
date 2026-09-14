import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { adminRuntime } from '../../../lib/admin/runtime';
import { currentAdmin } from '../../../lib/admin/session';
import '../admin.css';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Admin-Anmeldung',
  robots: { index: false, follow: false }
};

export default async function AdminLoginPage() {
  const runtime = adminRuntime();
  if (runtime && (await currentAdmin(runtime))) redirect('/admin');

  return (
    <main className="admin-login">
      <section className="panel admin-login-card" aria-labelledby="admin-login-title">
        <h1 id="admin-login-title">FlagCount Admin</h1>
        {runtime ? (
          <>
            <p>Die Sitzung endet nach 30 Minuten ohne Aktivität und spätestens nach 8 Stunden.</p>
            {runtime.config.email ? (
              <form method="post" action="/admin/auth/login" className="admin-login-form">
                <label htmlFor="admin-email">E-Mail-Adresse</label>
                <input id="admin-email" name="email" type="email" autoComplete="username" required />
                <label htmlFor="admin-password">Passwort</label>
                <input id="admin-password" name="password" type="password" autoComplete="current-password" required />
                <button className="button primary" type="submit">Anmelden</button>
              </form>
            ) : (
              <a className="button primary" href="/admin/auth/login">Mit GitHub anmelden</a>
            )}
          </>
        ) : (
          <p>Der Admin-Bereich ist auf diesem Server nicht eingerichtet.</p>
        )}
      </section>
    </main>
  );
}
