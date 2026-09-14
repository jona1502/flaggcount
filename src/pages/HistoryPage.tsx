import { canUse } from '../../shared/entitlements';
import { PageHeader } from '../app-shell/PageHeader';
import { HistoryPanel } from '../history/HistoryPanel';
import type { PageProps } from './types';

export function HistoryPage({ model, pending, actions }: PageProps): React.JSX.Element {
  return (
    <div className="page">
      <PageHeader title="Historie" description="Abgeschlossene Runden, gespeichert nur auf diesem Computer." />
      <HistoryPanel
        records={model.state.history ?? []}
        available={canUse(model.entitlements, 'history')}
        exportAvailable={canUse(model.entitlements, 'csv-export')}
        disabled={pending}
        onClear={() => void actions.clearHistory()}
        onExport={actions.exportHistoryCsv}
      />
    </div>
  );
}
