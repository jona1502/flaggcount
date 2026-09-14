import { canUse, limitFor } from '../../shared/entitlements';
import { primaryCounter } from '../../shared/profiles';
import { PageHeader } from '../app-shell/PageHeader';
import { OverlayPanel } from '../dashboard/OverlayPanel';
import type { PageProps } from './types';

export function OverlaysPage({ model, pending, actions, onCopyText }: PageProps): React.JSX.Element {
  const { state, entitlements, running } = model;
  const counter = running.counters[0] ?? primaryCounter(state.settings);
  return (
    <div className="page">
      <PageHeader title="Overlays" description="Overlay gestalten und die URL für OBS oder TikTok LIVE Studio kopieren." />
      <OverlayPanel
        overlayUrl={state.overlayUrl}
        publicOverlayUrl={state.publicOverlayUrl}
        settings={counter.overlay}
        disabled={pending}
        onCopy={onCopyText}
        onChangeSettings={(overlay) => void actions.setOverlaySettings(overlay)}
        premiumThemesAllowed={canUse(entitlements, 'premium-templates')}
        onImportAsset={canUse(entitlements, 'custom-branding') ? actions.importOverlayAsset : undefined}
        counterOverlays={{
          counters: state.counters.map(({ counterId, name }) => ({ counterId, name })),
          onlineUrls: state.counterOverlayUrls ?? {},
          allowedCounters: limitFor(entitlements, 'overlayUrls'),
          overviewAllowed: canUse(entitlements, 'parallel-counters')
        }}
      />
    </div>
  );
}
