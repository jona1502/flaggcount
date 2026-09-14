import { headers } from 'next/headers';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { ReactNode } from 'react';
import { LicenseActions } from '../../../../../components/admin/LicenseActions';
import { adminBackend } from '../../../../../lib/admin/backend';
import { AUDIT_ACTIONS, SUBSCRIPTION_STATUSES, accessLabel, adminErrorMessage, formatDate, sourceLabel } from '../../../../../lib/admin/format';
import { requireAdmin } from '../../../../../lib/admin/session';
import type { AdminLicenseDetails } from '../../../../../lib/admin/types';

export const dynamic = 'force-dynamic';

export const metadata = { title: 'Lizenz' };

function ExternalLink({ href, children }: { href: string | null; children: ReactNode }) {
  return href ? (
    <a href={href} target="_blank" rel="noopener noreferrer">
      {children}
    </a>
  ) : (
    <>{children}</>
  );
}

export default async function LicenseDetailsPage({ params }: { params: Promise<{ id: string }> }) {
  const admin = await requireAdmin();
  const { id } = await params;
  const result = await adminBackend<AdminLicenseDetails>(admin, 'GET', `/api/admin/licenses/${encodeURIComponent(id)}`, {
    forwardedFor: (await headers()).get('x-forwarded-for')
  });
  if (!result.ok && result.status === 404) notFound();

  if (!result.ok) {
    return (
      <section className="panel admin-section">
        <p>
          <Link href="/admin/licenses">← Lizenzen</Link>
        </p>
        <p className="admin-message error" role="alert">
          {adminErrorMessage(result.error)}
        </p>
      </section>
    );
  }

  const license = result.data;
  const manual = license.source === 'manual';
  const facts: [string, ReactNode][] = [
    ['Quelle', <span key="source" className={`admin-badge ${manual ? 'manual' : ''}`}>{sourceLabel(license)}</span>],
    ['Pro-Zugriff', accessLabel(license)],
    ...(manual
      ? ([['Gültig bis', license.manualValidUntil ? formatDate(license.manualValidUntil) : 'unbegrenzt']] as [string, ReactNode][])
      : ([
          ['Abo-Status', license.providerStatus ? (SUBSCRIPTION_STATUSES[license.providerStatus] ?? license.providerStatus) : '–'],
          ['Bezahlt bis', formatDate(license.currentPeriodEndsAt)],
          ['Kündigung zum', formatDate(license.scheduledCancelAt)],
          ['Gekündigt am', formatDate(license.canceledAt)],
          ['Stripe-Kunde', <ExternalLink key="customer" href={license.links.customer}>{license.providerCustomerId ?? '–'}</ExternalLink>],
          ['Stripe-Abo', <ExternalLink key="subscription" href={license.links.subscription}>{license.providerSubscriptionId ?? '–'}</ExternalLink>]
        ] as [string, ReactNode][])),
    ['Erstattung/Chargeback', license.revokedAt ? formatDate(license.revokedAt) : 'nein'],
    ['Support-Sperre', license.supportStatus === 'blocked' ? 'gesperrt' : 'nein'],
    ['Aktivierungscode', license.hasActivationCode ? `ausgestellt ${formatDate(license.codeIssuedAt)}` : 'noch keiner'],
    ['Erstellt', formatDate(license.createdAt)]
  ];

  return (
    <>
      <section className="panel admin-section" aria-labelledby="license-title">
        <p>
          <Link href="/admin/licenses">← Lizenzen</Link>
        </p>
        <h1 id="license-title">{license.reference}</h1>
        {!manual && (
          <p className="admin-hint">
            Zahlungsstatus, Laufzeit, Preis, Kündigung und Erstattung werden im Stripe-Dashboard geändert und per Webhook übernommen.
          </p>
        )}
        <dl className="admin-facts">
          {facts.map(([label, value]) => (
            <div key={label}>
              <dt>{label}</dt>
              <dd>{value}</dd>
            </div>
          ))}
        </dl>
      </section>

      <LicenseActions
        licenseId={license.id}
        manual={manual}
        blocked={license.supportStatus === 'blocked'}
        canEmail={!manual && license.providerCustomerId !== null}
        note={license.supportNote}
        validUntil={license.manualValidUntil}
        installations={license.installations}
      />

      <section className="panel admin-section" aria-labelledby="history-title">
        <h2 id="history-title">Frühere Installationen</h2>
        <ul className="admin-list">
          {license.deactivatedInstallations.map((installation) => (
            <li key={installation.installationId}>
              <span>
                <code>{installation.installationId}</code>
                <small>
                  aktiviert {formatDate(installation.activatedAt)} · deaktiviert {formatDate(installation.deactivatedAt)}
                </small>
              </span>
            </li>
          ))}
          {license.deactivatedInstallations.length === 0 && <li className="admin-empty">Keine.</li>}
        </ul>
      </section>

      <section className="panel admin-section" aria-labelledby="audit-title">
        <h2 id="audit-title">Audit-Protokoll</h2>
        <ul className="admin-list">
          {license.audit.map((entry) => (
            <li key={entry.id}>
              <span>
                {AUDIT_ACTIONS[entry.action] ?? entry.action}
                <small>
                  {formatDate(entry.createdAt)} · {entry.adminSubject}
                </small>
              </span>
            </li>
          ))}
          {license.audit.length === 0 && <li className="admin-empty">Noch keine Änderungen.</li>}
        </ul>
      </section>
    </>
  );
}
