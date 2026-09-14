import {
  MAX_NAME_LENGTH,
  MAX_OPTION_TRIGGERS,
  MAX_POLL_OPTIONS,
  MAX_WITHDRAWAL_TRIGGERS,
  MIN_POLL_OPTIONS,
  type CounterDefinition,
  type CounterMode,
  type PollOption
} from './profiles';
import { DEFAULT_OVERLAY_SETTINGS, isHexColor } from './settings';
import { RED_FLAG, WHITE_FLAG } from './voting/redFlag';
import { createRandomRoundId } from './voting/VotingEngine';
import { isValidTarget } from './voting/target';
import { parseTrigger, triggerKey, type Trigger } from './voting/triggers';

export type TriggerOwner = { kind: 'option'; optionId: string; label: string } | { kind: 'withdrawal' };

/** A reason a counter cannot be saved, precise enough to point the streamer at the field. */
export type CounterProblem =
  | { code: 'invalid-name' }
  | { code: 'invalid-target' }
  | { code: 'option-count'; min: number; max: number }
  | { code: 'invalid-label'; optionId: string }
  | { code: 'invalid-color'; optionId: string }
  | { code: 'missing-trigger'; optionId: string; label: string }
  | { code: 'too-many-triggers'; owner: TriggerOwner; max: number }
  | { code: 'invalid-trigger'; owner: TriggerOwner; value: string }
  | { code: 'duplicate-trigger'; value: string; owners: TriggerOwner[] };

const nameLength = (value: string): number => [...value.trim()].length;

/**
 * Everything `parseCounterDefinition` would reject, as individual problems. Duplicates report every
 * option they appear in, so a streamer can see which choices collide.
 */
export function findCounterProblems(counter: CounterDefinition): CounterProblem[] {
  const problems: CounterProblem[] = [];
  const length = nameLength(counter.name);
  if (length < 1 || length > MAX_NAME_LENGTH) problems.push({ code: 'invalid-name' });
  if (counter.target !== null && !isValidTarget(counter.target)) problems.push({ code: 'invalid-target' });

  const [min, max] = counter.mode === 'single' ? [1, 1] : [MIN_POLL_OPTIONS, MAX_POLL_OPTIONS];
  if (counter.options.length < min || counter.options.length > max) problems.push({ code: 'option-count', min, max });

  const seen = new Map<string, { value: string; owners: TriggerOwner[] }>();
  const collect = (trigger: Trigger, owner: TriggerOwner): void => {
    if (!parseTrigger(trigger)) {
      problems.push({ code: 'invalid-trigger', owner, value: trigger.value });
      return;
    }
    const key = triggerKey(trigger);
    const entry = seen.get(key) ?? { value: trigger.value.trim(), owners: [] };
    entry.owners.push(owner);
    seen.set(key, entry);
  };

  for (const option of counter.options) {
    const owner: TriggerOwner = { kind: 'option', optionId: option.id, label: option.label.trim() };
    const labelLength = nameLength(option.label);
    if (labelLength < 1 || labelLength > MAX_NAME_LENGTH) problems.push({ code: 'invalid-label', optionId: option.id });
    if (!isHexColor(option.accentColor)) problems.push({ code: 'invalid-color', optionId: option.id });
    if (option.triggers.length === 0) problems.push({ code: 'missing-trigger', optionId: option.id, label: owner.label });
    if (option.triggers.length > MAX_OPTION_TRIGGERS) problems.push({ code: 'too-many-triggers', owner, max: MAX_OPTION_TRIGGERS });
    option.triggers.forEach((trigger) => collect(trigger, owner));
  }

  const withdrawal: TriggerOwner = { kind: 'withdrawal' };
  if (counter.withdrawalTriggers.length > MAX_WITHDRAWAL_TRIGGERS) {
    problems.push({ code: 'too-many-triggers', owner: withdrawal, max: MAX_WITHDRAWAL_TRIGGERS });
  }
  counter.withdrawalTriggers.forEach((trigger) => collect(trigger, withdrawal));

  for (const { value, owners } of seen.values()) {
    if (owners.length > 1) problems.push({ code: 'duplicate-trigger', value, owners });
  }
  return problems;
}

const OPTION_COLORS = ['#e82634', '#2f80ed', '#27ae60', '#f2c94c', '#9b51e0', '#f2994a'];

function newId(prefix: string): string {
  return `${prefix}-${createRandomRoundId().replace(/[^A-Za-z0-9]/g, '').slice(0, 16)}`;
}

/** Options are named A, B, C … and answered with that letter as a whole word. */
export function createPollOption(index: number): PollOption {
  const letter = String.fromCharCode(65 + index);
  return {
    id: newId('option'),
    label: letter,
    triggers: [{ kind: 'text', value: letter, match: 'word' }],
    accentColor: OPTION_COLORS[index % OPTION_COLORS.length] as string
  };
}

export function createPollCounter(name = 'Abstimmung'): CounterDefinition {
  return {
    id: newId('counter'),
    name,
    mode: 'poll',
    target: null,
    options: [createPollOption(0), createPollOption(1)],
    withdrawalTriggers: [],
    overlay: { ...DEFAULT_OVERLAY_SETTINGS }
  };
}

/** A single counter; without triggers it counts 🚩 and withdraws with 🏳️, exactly what Free allows. */
export function createSingleCounter(
  name = 'Zähler',
  triggers: Trigger[] = [{ kind: 'emoji', value: RED_FLAG, match: 'contains' }],
  withdrawalTriggers: Trigger[] = [{ kind: 'emoji', value: `${WHITE_FLAG}️`, match: 'contains' }]
): CounterDefinition {
  return {
    id: newId('counter'),
    name,
    mode: 'single',
    target: null,
    options: [{ id: newId('option'), label: name, triggers, accentColor: DEFAULT_OVERLAY_SETTINGS.accentColor }],
    withdrawalTriggers,
    overlay: { ...DEFAULT_OVERLAY_SETTINGS }
  };
}

/** A copy with new counter and option ids, so it runs its own round and gets its own overlay. */
export function duplicateCounter(counter: CounterDefinition): CounterDefinition {
  const suffix = ' (Kopie)';
  const base = [...counter.name.trim()].slice(0, MAX_NAME_LENGTH - suffix.length).join('');
  return {
    ...counter,
    id: newId('counter'),
    name: `${base}${suffix}`,
    options: counter.options.map((option) => ({ ...option, id: newId('option'), triggers: option.triggers.map((trigger) => ({ ...trigger })) })),
    withdrawalTriggers: counter.withdrawalTriggers.map((trigger) => ({ ...trigger })),
    overlay: { ...counter.overlay }
  };
}

/** Adds the next lettered option. Its trigger stays empty if the letter is already used in this counter. */
export function appendPollOption(counter: CounterDefinition): CounterDefinition {
  const next = createPollOption(counter.options.length);
  const used = new Set([...counter.options.flatMap((option) => option.triggers), ...counter.withdrawalTriggers].map(triggerKey));
  const option = next.triggers.every((trigger) => !used.has(triggerKey(trigger))) ? next : { ...next, triggers: [] };
  return { ...counter, options: [...counter.options, option] };
}

/** Switches between a single counter and a poll while keeping as much of the counter as possible. */
export function changeCounterMode(counter: CounterDefinition, mode: CounterMode): CounterDefinition {
  if (counter.mode === mode) return counter;
  if (mode === 'single') {
    return { ...counter, mode, options: counter.options.slice(0, 1) };
  }
  let poll: CounterDefinition = { ...counter, mode, options: [...counter.options] };
  while (poll.options.length < MIN_POLL_OPTIONS) {
    poll = appendPollOption(poll);
  }
  return poll;
}
