import { PageHeader } from '../app-shell/PageHeader';
import { Badge } from '../components/ui';
import { LicensePanel } from '../pro/LicensePanel';
import type { PageProps } from './types';

export function LicensePage({ model, pending, actions }: PageProps): React.JSX.Element {
  const { state, isPro } = model;
  return (
    <div className="page">
      <PageHeader
        title="Lizenz & Konto"
        badge={<Badge tone={isPro ? 'pro' : 'neutral'}>{isPro ? 'FlagCount Pro' : 'FlagCount Free'}</Badge>}
        description="Tarif, Aktivierung und Abo-Verwaltung."
      />
      <LicensePanel
        license={state.license}
        available={state.sidecarRunning}
        pending={pending}
        onActivate={(code, replaceInstallationId) => void actions.activateLicense(code, replaceInstallationId)}
        onRefresh={() => void actions.refreshLicense()}
        onDeactivate={() => void actions.deactivateLicense()}
        onOpenPortal={() => void actions.openCustomerPortal()}
        onOpenProPage={() => void actions.openProPage()}
      />
    </div>
  );
}
