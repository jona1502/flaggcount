import type { CounterDefinition, CounterMode } from '../../shared/profiles';
import type { CounterSnapshot } from '../../shared/voting';
import { RED_FLAG } from '../../shared/voting/redFlag';
import { triggerKey } from '../../shared/voting/triggers';
import type { AppModel } from '../app-shell/appModel';

export type LiveOption = {
  optionId: string;
  label: string;
  count: number;
  /** Share of all votes of the counter, 0 to 1. */
  share: number;
  color: string;
  leading: boolean;
};

/** One running counter or poll as the live controls show it. */
export type LiveCounter = {
  counterId: string;
  name: string;
  mode: CounterMode;
  total: number;
  target: number | null;
  targetReached: boolean;
  /** Percent of the target, capped at 100; `null` without a target. */
  progress: number | null;
  options: LiveOption[];
  leaders: LiveOption[];
  definition: CounterDefinition | undefined;
  /** Snapshots in the format of 0.2 have no ids; their votes and resets address the first counter. */
  addressable: boolean;
  /** The first running counter; its target changes with the classic target action. */
  primary: boolean;
  /** Counts red flags like the Free counter, so the familiar flag wording fits. */
  redFlags: boolean;
};

const RED_FLAG_KEY = triggerKey({ kind: 'emoji', value: RED_FLAG, match: 'contains' });
const FALLBACK_COLOR = '#e82634';

function countsRedFlags(definition: CounterDefinition | undefined): boolean {
  const triggers = definition?.mode === 'single' ? definition.options[0]?.triggers : undefined;
  return triggers?.length === 1 && triggerKey(triggers[0] as NonNullable<(typeof triggers)[0]>) === RED_FLAG_KEY;
}

/** Until the counters snapshot arrives, the classic vote snapshot stands for the first counter. */
function snapshotFromVotes({ state, runningCounters }: AppModel): CounterSnapshot[] {
  const first = runningCounters[0];
  if (!first) return [];
  const option = first.options[0];
  return [
    {
      counterId: first.id,
      name: first.name,
      mode: 'single',
      options: [{ optionId: option?.id ?? first.id, label: option?.label ?? first.name, count: state.votes.count }],
      totalCount: state.votes.count,
      target: state.votes.target,
      targetReached: state.votes.targetReached,
      roundId: state.votes.roundId
    }
  ];
}

export function liveCounters(model: AppModel): LiveCounter[] {
  const addressable = model.state.counters.length > 0;
  const snapshots = addressable ? model.state.counters : snapshotFromVotes(model);

  return snapshots.map((snapshot, index) => {
    const definition = model.runningCounters.find((candidate) => candidate.id === snapshot.counterId);
    const most = Math.max(0, ...snapshot.options.map((option) => option.count));
    const options = snapshot.options.map((option) => ({
      optionId: option.optionId,
      label: option.label,
      count: option.count,
      share: snapshot.totalCount > 0 ? option.count / snapshot.totalCount : 0,
      color:
        definition?.options.find((candidate) => candidate.id === option.optionId)?.accentColor ?? definition?.overlay.accentColor ?? FALLBACK_COLOR,
      leading: most > 0 && option.count === most
    }));
    return {
      counterId: snapshot.counterId,
      name: snapshot.name,
      mode: snapshot.mode,
      total: snapshot.totalCount,
      target: snapshot.target,
      targetReached: snapshot.targetReached,
      progress: snapshot.target ? Math.min(100, Math.round((snapshot.totalCount / snapshot.target) * 100)) : null,
      options,
      leaders: options.filter((option) => option.leading),
      definition,
      addressable,
      primary: index === 0,
      redFlags: countsRedFlags(definition)
    };
  });
}
