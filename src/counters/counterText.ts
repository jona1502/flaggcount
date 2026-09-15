import type { CounterProblem, TriggerOwner } from '../../shared/counterValidation';
import type { EntitlementViolation, LimitName } from '../../shared/entitlements';
import { MAX_NAME_LENGTH, type CounterMode } from '../../shared/profiles';
import type { Trigger } from '../../shared/voting/triggers';
import { describeFeature } from '../pro/proFeatures';

export const LIMIT_NAMES: Record<LimitName, string> = {
  profiles: 'Profile',
  counters: 'Zähler gleichzeitig',
  pollOptions: 'Optionen pro Abstimmung',
  optionTriggers: 'Auslöser pro Option',
  withdrawalTriggers: 'Rücknahme-Auslöser',
  overlayUrls: 'Overlay-Adressen',
  historyRecords: 'gespeicherte Runden',
  logoBytes: 'Bytes für das Logo',
  backgroundBytes: 'Bytes für den Hintergrund'
};

export const COUNTER_TYPE_LABELS: Record<CounterMode, string> = {
  single: 'Einfacher Zähler',
  poll: 'Abstimmung'
};

function ownerName(owner: TriggerOwner): string {
  return owner.kind === 'withdrawal' ? 'Zurücknehmen' : `Option „${owner.label || '?'}“`;
}

export function describeProblem(problem: CounterProblem): string {
  switch (problem.code) {
    case 'invalid-name':
      return `Der Name braucht 1 bis ${MAX_NAME_LENGTH} Zeichen.`;
    case 'invalid-target':
      return 'Das Stimmenziel muss eine ganze Zahl zwischen 1 und 100.000 sein.';
    case 'option-count':
      return `Eine Abstimmung braucht ${problem.min} bis ${problem.max} Optionen.`;
    case 'invalid-label':
      return `Jede Option braucht eine Bezeichnung mit 1 bis ${MAX_NAME_LENGTH} Zeichen.`;
    case 'invalid-color':
      return 'Eine Optionsfarbe ist ungültig.';
    case 'missing-trigger':
      return `Option „${problem.label || '?'}“ braucht mindestens einen Auslöser.`;
    case 'too-many-triggers':
      return `${ownerName(problem.owner)} hat mehr als ${problem.max} Auslöser.`;
    case 'invalid-trigger':
      return `„${problem.value}“ ist kein gültiger Auslöser.`;
    case 'duplicate-trigger':
      return `„${problem.value}“ gehört zu mehreren Stellen (${problem.owners.map(ownerName).join(', ')}). Ein Auslöser darf pro Zähler nur einmal vorkommen, sonst wäre eine Stimme mehrdeutig.`;
  }
}

export function describeViolation(violation: EntitlementViolation): string {
  return violation.kind === 'feature'
    ? `${describeFeature(violation.feature).title} gibt es mit Audience Live Pro.`
    : `Dein Tarif erlaubt höchstens ${violation.allowed} ${LIMIT_NAMES[violation.limit]}.`;
}

export function describeTrigger(trigger: Trigger): string {
  if (trigger.kind === 'emoji') return 'Emoji';
  return trigger.match === 'word' ? 'ganzes Wort' : 'enthält';
}

export type TriggerTarget = { kind: 'option'; optionId: string } | { kind: 'withdrawal' };

const concerns = (owner: TriggerOwner, target: TriggerTarget): boolean =>
  target.kind === 'withdrawal' ? owner.kind === 'withdrawal' : owner.kind === 'option' && owner.optionId === target.optionId;

/** Problems of the triggers of one option or of the withdrawal triggers, shown right at that trigger list. */
export function triggerProblems(problems: readonly CounterProblem[], target: TriggerTarget): string[] {
  return problems
    .filter((problem) => {
      switch (problem.code) {
        case 'missing-trigger':
          return target.kind === 'option' && problem.optionId === target.optionId;
        case 'too-many-triggers':
        case 'invalid-trigger':
          return concerns(problem.owner, target);
        case 'duplicate-trigger':
          return problem.owners.some((owner) => concerns(owner, target));
        default:
          return false;
      }
    })
    .map(describeProblem);
}

export function optionLabelProblem(problems: readonly CounterProblem[], optionId: string): string | null {
  const problem = problems.find(
    (candidate) => (candidate.code === 'invalid-label' || candidate.code === 'invalid-color') && candidate.optionId === optionId
  );
  return problem ? describeProblem(problem) : null;
}

export function fieldProblem(problems: readonly CounterProblem[], code: 'invalid-name' | 'invalid-target' | 'option-count'): string | null {
  const problem = problems.find((candidate) => candidate.code === code);
  return problem ? describeProblem(problem) : null;
}
