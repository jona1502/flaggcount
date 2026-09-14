import { headers } from 'next/headers';
import { adminBackend } from '../../../lib/admin/backend';
import { requireAdmin } from '../../../lib/admin/session';

export const dynamic = 'force-dynamic';

export const metadata = { title: 'Übersicht' };

const dateTime = new Intl.DateTimeFormat('de-DE', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Europe/Berlin' });

export default async function AdminHomePage() {
  // Pages check again: the layout's check does not protect anything rendered or requested without it.
  const admin = await requireAdmin();
  const backend = await adminBackend<{ subject: string }>(admin, 'GET', '/api/admin/whoami', {
    forwardedFor: (await headers()).get('x-forwarded-for')
  });

  return (
    <section className="panel" aria-labelledby="admin-overview-title">
      <h1 id="admin-overview-title">Übersicht</h1>
      <dl className="admin-facts">
        <div>
          <dt>GitHub-Konto</dt>
          <dd>{admin.subject}</dd>
        </div>
        <div>
          <dt>Sitzung endet</dt>
          <dd>{dateTime.format(new Date(admin.expiresAt))}</dd>
        </div>
        <div>
          <dt>Lizenzdienst</dt>
          <dd>{backend.ok ? 'verbunden' : `nicht erreichbar (${backend.error})`}</dd>
        </div>
      </dl>
    </section>
  );
}
