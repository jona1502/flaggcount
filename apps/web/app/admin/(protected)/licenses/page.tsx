import { headers } from 'next/headers';
import Link from 'next/link';
import { adminBackend } from '../../../../lib/admin/backend';
import { SUBSCRIPTION_STATUSES, accessLabel, adminErrorMessage, formatDate, sourceLabel } from '../../../../lib/admin/format';
import { requireAdmin } from '../../../../lib/admin/session';
import type { AdminLicenseList } from '../../../../lib/admin/types';

export const dynamic = 'force-dynamic';

export const metadata = { title: 'Lizenzen' };

const FILTERS = ['q', 'source', 'status', 'support'] as const;

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default async function LicensesPage({ searchParams }: { searchParams: SearchParams }) {
  const admin = await requireAdmin();
  const params = await searchParams;
  const value = (key: string) => {
    const raw = params[key];
    return typeof raw === 'string' ? raw : '';
  };

  const query = new URLSearchParams();
  for (const key of [...FILTERS, 'page']) if (value(key)) query.set(key, value(key));
  const result = await adminBackend<AdminLicenseList>(admin, 'GET', `/api/admin/licenses?${query.toString()}`, {
    forwardedFor: (await headers()).get('x-forwarded-for')
  });

  const pageLink = (page: number) => {
    const link = new URLSearchParams();
    for (const key of FILTERS) if (value(key)) link.set(key, value(key));
    if (page > 1) link.set('page', String(page));
    const text = link.toString();
    return text ? `/admin/licenses?${text}` : '/admin/licenses';
  };

  return (
    <section className="panel admin-section" aria-labelledby="licenses-title">
      <div className="admin-toolbar">
        <h1 id="licenses-title">Lizenzen</h1>
        <Link className="button primary" href="/admin/licenses/new">
          Manuelle Lizenz vergeben
        </Link>
      </div>

      <form className="admin-filters" method="get" action="/admin/licenses">
        <label>
          Suche
          <input name="q" defaultValue={value('q')} maxLength={100} placeholder="FC-…, cus_…, sub_…, Lizenz-ID" />
        </label>
        <label>
          Quelle
          <select name="source" defaultValue={value('source')}>
            <option value="">alle</option>
            <option value="stripe">Stripe</option>
            <option value="manual">Manuell</option>
            <option value="paddle">Paddle (früher)</option>
          </select>
        </label>
        <label>
          Abo-Status
          <select name="status" defaultValue={value('status')}>
            <option value="">alle</option>
            {Object.entries(SUBSCRIPTION_STATUSES).map(([status, label]) => (
              <option key={status} value={status}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <label>
          Sperre
          <select name="support" defaultValue={value('support')}>
            <option value="">alle</option>
            <option value="blocked">gesperrt</option>
            <option value="none">nicht gesperrt</option>
          </select>
        </label>
        <button className="button" type="submit">
          Filtern
        </button>
      </form>

      {!result.ok ? (
        <p className="admin-message error" role="alert">
          {adminErrorMessage(result.error)}
        </p>
      ) : (
        <>
          <div className="admin-table-wrap">
            <table className="admin-table">
              <thead>
                <tr>
                  <th scope="col">Referenz</th>
                  <th scope="col">Quelle</th>
                  <th scope="col">Abo-Status</th>
                  <th scope="col">Pro-Zugriff</th>
                  <th scope="col">Geändert</th>
                </tr>
              </thead>
              <tbody>
                {result.data.items.map((license) => (
                  <tr key={license.id}>
                    <td>
                      <Link href={`/admin/licenses/${license.id}`}>{license.reference}</Link>
                      {license.supportStatus === 'blocked' && <span className="admin-badge blocked"> gesperrt</span>}
                    </td>
                    <td>
                      <span className={`admin-badge ${license.source === 'manual' ? 'manual' : ''}`}>{sourceLabel(license)}</span>
                    </td>
                    <td>{license.providerStatus ? (SUBSCRIPTION_STATUSES[license.providerStatus] ?? license.providerStatus) : '–'}</td>
                    <td>{accessLabel(license)}</td>
                    <td>{formatDate(license.updatedAt)}</td>
                  </tr>
                ))}
                {result.data.items.length === 0 && (
                  <tr>
                    <td colSpan={5} className="admin-empty">
                      Keine Lizenzen gefunden.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          <nav className="admin-pagination" aria-label="Seiten">
            <span>
              {result.data.total} Lizenzen · Seite {result.data.page} von {Math.max(1, Math.ceil(result.data.total / result.data.pageSize))}
            </span>
            <span className="admin-actions">
              {result.data.page > 1 && (
                <Link className="button" href={pageLink(result.data.page - 1)}>
                  Zurück
                </Link>
              )}
              {result.data.page * result.data.pageSize < result.data.total && (
                <Link className="button" href={pageLink(result.data.page + 1)}>
                  Weiter
                </Link>
              )}
            </span>
          </nav>
        </>
      )}
    </section>
  );
}
