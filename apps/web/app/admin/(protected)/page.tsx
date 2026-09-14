import { headers } from 'next/headers';
import Link from 'next/link';
import { adminBackend } from '../../../lib/admin/backend';
import { formatDate } from '../../../lib/admin/format';
import { requireAdmin } from '../../../lib/admin/session';
import '../admin.css';

export const dynamic = 'force-dynamic';

export const metadata = { title: 'Übersicht' };

export default async function AdminHomePage() {
  // Pages check again: the layout's check does not protect anything rendered or requested without it.
  const admin = await requireAdmin();
  const backend = await adminBackend<{ subject: string }>(admin, 'GET', '/api/admin/whoami', {
    forwardedFor: (await headers()).get('x-forwarded-for')
  });

  return (
    <section className="panel admin-section" aria-labelledby="admin-overview-title">
      <h1 id="admin-overview-title">Übersicht</h1>
      <form className="admin-filters" method="get" action="/admin/licenses">
        <label>
          Lizenz suchen
          <input name="q" maxLength={100} placeholder="FC-…, cus_…, sub_…, Lizenz-ID" />
        </label>
        <button className="button primary" type="submit">
          Suchen
        </button>
        <Link className="button" href="/admin/licenses">
          Alle Lizenzen
        </Link>
        <Link className="button" href="/admin/licenses/new">
          Manuelle Lizenz vergeben
        </Link>
      </form>
      <dl className="admin-facts">
        <div>
          <dt>Admin-Konto</dt>
          <dd>{admin.subject}</dd>
        </div>
        <div>
          <dt>Sitzung endet</dt>
          <dd>{formatDate(admin.expiresAt)}</dd>
        </div>
        <div>
          <dt>Lizenzdienst</dt>
          <dd>{backend.ok ? 'verbunden' : `nicht erreichbar (${backend.error})`}</dd>
        </div>
      </dl>
    </section>
  );
}
