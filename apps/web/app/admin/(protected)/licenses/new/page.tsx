import Link from 'next/link';
import { ManualLicenseForm } from '../../../../../components/admin/ManualLicenseForm';
import { requireAdmin } from '../../../../../lib/admin/session';

export const dynamic = 'force-dynamic';

export const metadata = { title: 'Manuelle Lizenz' };

export default async function NewManualLicensePage() {
  await requireAdmin();

  return (
    <section className="panel admin-section" aria-labelledby="new-license-title">
      <p>
        <Link href="/admin/licenses">← Lizenzen</Link>
      </p>
      <h1 id="new-license-title">Manuelle Lizenz vergeben</h1>
      <p className="admin-hint">
        Für Support, Creator-Kooperationen, Tests oder Aktionen. Manuelle Lizenzen haben keine Stripe-Daten und sollten ein Ablaufdatum haben.
      </p>
      <ManualLicenseForm />
    </section>
  );
}
