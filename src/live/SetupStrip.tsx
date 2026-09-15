import type { AppModel } from '../app-shell/appModel';
import type { Navigate } from '../app-shell/navigation';
import { Button, Card, IconCheck, IconChevronRight } from '../components/ui';
import { setupSteps, type SetupStepId } from '../pages/setupSteps';

/** Connecting has its own card on the overview and a profile always runs, so only these steps remain. */
const OVERVIEW_STEPS = new Set<SetupStepId>(['elements', 'overlay', 'license']);

/** Open setup steps on the overview; disappears once everything is ready. */
export function SetupStrip({ model, onNavigate }: { model: AppModel; onNavigate: Navigate }): React.JSX.Element | null {
  const steps = setupSteps(model).filter((step) => OVERVIEW_STEPS.has(step.id));
  const done = steps.filter((step) => step.done).length;
  if (done === steps.length) return null;

  return (
    <Card title="Einrichtung" description={`${done} von ${steps.length} Schritten erledigt`} className="setup-strip">
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
