import { PageHeader } from '../app-shell/PageHeader';
import { CounterEditor } from '../profiles/CounterEditor';
import type { PageProps } from './types';

export function CountersPage({ model, pending, actions, navigate }: PageProps): React.JSX.Element {
  return (
    <div className="page">
      <PageHeader title="Zähler & Abstimmungen" description="Elemente des laufenden Profils erstellen und bearbeiten." />
      <CounterEditor
        counters={model.running.counters}
        license={model.state.license}
        disabled={pending}
        readOnly={false}
        onSave={(counters) => void actions.saveCounters(counters)}
        onShowPro={() => navigate({ page: 'license' })}
      />
    </div>
  );
}
