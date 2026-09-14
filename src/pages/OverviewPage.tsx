import { PageHeader } from '../app-shell/PageHeader';
import { Button, Card, IconCheck, IconChevronRight, IconLive, IconOverlays, IconPlus, IconProfiles } from '../components/ui';
import { ConnectionPanel } from '../dashboard/ConnectionPanel';
import { setupSteps, type SetupStep } from './setupSteps';
import type { PageProps } from './types';

const numberFormat = new Intl.NumberFormat('de-DE');

function SetupChecklist({ steps, onNavigate }: { steps: SetupStep[]; onNavigate: PageProps['navigate'] }): React.JSX.Element {
  const done = steps.filter((step) => step.done).length;
  return (
    <Card title="Einrichtung" description={`${done} von ${steps.length} Schritten erledigt`}>
      <ol className="setup-list">
        {steps.map((step, index) => (
          <li key={step.id} className="setup-step" data-done={step.done}>
            <span className="setup-step-marker" aria-hidden="true">
              {step.done ? <IconCheck size={14} /> : index + 1}
            </span>
            <div className="setup-step-text">
              <p className="setup-step-title">
                {step.title}
                <span className="visually-hidden">{step.done ? ' – erledigt' : ' – offen'}</span>
              </p>
              <p className="setup-step-detail">{step.detail}</p>
            </div>
            {!step.done && (
              <Button size="sm" variant="secondary" icon={IconChevronRight} onClick={() => onNavigate(step.action.route)}>
                {step.action.label}
              </Button>
            )}
          </li>
        ))}
      </ol>
    </Card>
  );
}

function LiveSummary({ model, navigate }: Pick<PageProps, 'model' | 'navigate'>): React.JSX.Element {
  return (
    <Card
      title="Laufende Runden"
      actions={
        <Button size="sm" icon={IconLive} onClick={() => navigate({ page: 'live' })}>
          Live-Steuerung
        </Button>
      }
    >
      <ul className="summary-list">
        {model.state.counters.map((counter) => {
          const leader =
            counter.mode === 'poll' && counter.totalCount > 0
              ? [...counter.options].sort((a, b) => b.count - a.count)[0]
              : undefined;
          return (
            <li key={counter.counterId} className="summary-item">
              <div>
                <p className="summary-name">{counter.name}</p>
                <p className="summary-detail">
                  {counter.mode === 'poll' ? (leader ? `Vorne: ${leader.label}` : 'Noch keine Stimmen') : 'Zähler'}
                  {counter.target !== null && ` · Ziel ${numberFormat.format(counter.target)}`}
                </p>
              </div>
              <p className="summary-count">{numberFormat.format(counter.totalCount)}</p>
            </li>
          );
        })}
      </ul>
    </Card>
  );
}

export function OverviewPage({ model, pending, actions, navigate }: PageProps): React.JSX.Element {
  const { state } = model;
  const steps = setupSteps(model);
  const openSteps = steps.filter((step) => !step.done);
  // Someone who connected before gets numbers and shortcuts instead of the onboarding list.
  const returning = state.settings.username !== '';

  return (
    <div className="page">
      <PageHeader title="Übersicht" description="Einrichtung, Verbindung und laufende Runden auf einen Blick." />
      <div className="page-grid">
        <ConnectionPanel
          connection={state.connection}
          savedUsername={state.settings.username}
          sidecarRunning={state.sidecarRunning}
          pending={pending}
          onConnect={(username) => void actions.connect(username)}
          onDisconnect={() => void actions.disconnect()}
        />
        {returning ? <LiveSummary model={model} navigate={navigate} /> : <SetupChecklist steps={steps} onNavigate={navigate} />}
        {returning && openSteps.length > 0 && <SetupChecklist steps={openSteps} onNavigate={navigate} />}
        <Card title="Schnellaktionen">
          <div className="quick-actions">
            <Button icon={IconPlus} onClick={() => navigate({ page: 'counters', create: true })}>
              Neues Element
            </Button>
            <Button icon={IconOverlays} onClick={() => navigate({ page: 'overlays' })}>
              Overlay einrichten
            </Button>
            <Button icon={IconProfiles} onClick={() => navigate({ page: 'profiles' })}>
              Profil wechseln
            </Button>
          </div>
        </Card>
      </div>
    </div>
  );
}
