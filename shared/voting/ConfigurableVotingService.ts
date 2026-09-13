import type { CounterDefinition, Trigger } from '../profiles';
import type { VoteSnapshot } from './VotingService';
import { DEFAULT_COUNTER_ID } from '../profiles';

export type OptionSnapshot = { optionId: string; label: string; count: number };
export type CounterSnapshot = {
  counterId: string;
  name: string;
  mode: CounterDefinition['mode'];
  options: OptionSnapshot[];
  totalCount: number;
  target: number | null;
  targetReached: boolean;
  roundId: string;
};
export type ConfigurableVoteResult = 'counted' | 'switched' | 'duplicate' | 'withdrawn' | 'not-voted' | 'ambiguous' | 'no-match' | 'invalid-user';
export type CounterVoteResult = { counterId: string; result: ConfigurableVoteResult };

type CounterState = { voters: Map<string, string>; manualVotes: Map<string, number>; manualWithdrawals: number; roundId: string };
export type ConfigurableVotingServiceOptions = { createRoundId?: () => string };

/** Adapts the existing free snapshot while consumers migrate to the multi-counter protocol. */
export function counterSnapshotFromLegacy(votes: VoteSnapshot): CounterSnapshot {
  return {
    counterId: DEFAULT_COUNTER_ID,
    name: 'Rote Flaggen',
    mode: 'single',
    options: [{ optionId: 'red-flags', label: 'Rote Flaggen', count: votes.count }],
    totalCount: votes.count,
    target: votes.target,
    targetReached: votes.targetReached,
    roundId: votes.roundId
  };
}

/** Pure multi-counter voting engine. Viewer identities exist only in transient in-memory maps. */
export class ConfigurableVotingService {
  private readonly states = new Map<string, CounterState>();
  private readonly createRoundId: () => string;

  constructor(private readonly counters: readonly CounterDefinition[], options: ConfigurableVotingServiceOptions = {}) {
    this.createRoundId = options.createRoundId ?? createRoundId;
    const ids = new Set<string>();
    for (const counter of counters) {
      if (ids.has(counter.id)) throw new RangeError(`Duplicate counter id: ${counter.id}`);
      ids.add(counter.id);
      this.states.set(counter.id, { voters: new Map(), manualVotes: new Map(), manualWithdrawals: 0, roundId: this.createRoundId() });
    }
  }

  handleComment(userId: string, comment: string): CounterVoteResult[] {
    const user = userId.trim();
    if (!user) return this.counters.map((counter) => ({ counterId: counter.id, result: 'invalid-user' }));
    const normalized = comment.normalize('NFC');
    return this.counters.map((counter) => ({ counterId: counter.id, result: this.voteCounter(counter, user, normalized) }));
  }

  addManualVote(counterId: string, optionId?: string): CounterSnapshot {
    const counter = this.counter(counterId);
    const option = optionId ?? counter.options[0]?.id;
    if (!option || !counter.options.some((candidate) => candidate.id === option)) throw new RangeError('Unknown option');
    const state = this.states.get(counterId)!;
    state.manualVotes.set(option, (state.manualVotes.get(option) ?? 0) + 1);
    return this.snapshot(counter);
  }

  removeManualVote(counterId: string): CounterSnapshot {
    const counter = this.counter(counterId);
    const state = this.states.get(counterId)!;
    if (this.snapshot(counter).totalCount > 0) state.manualWithdrawals++;
    return this.snapshot(counter);
  }

  reset(counterId: string): CounterSnapshot {
    const counter = this.counter(counterId);
    const state = this.states.get(counterId)!;
    state.voters.clear();
    state.manualVotes.clear();
    state.manualWithdrawals = 0;
    state.roundId = this.createRoundId();
    return this.snapshot(counter);
  }
  resetAll(): CounterSnapshot[] { return this.counters.map((counter) => this.reset(counter.id)); }
  getSnapshot(counterId: string): CounterSnapshot { return this.snapshot(this.counter(counterId)); }
  getSnapshots(): CounterSnapshot[] { return this.counters.map((counter) => this.snapshot(counter)); }

  private voteCounter(counter: CounterDefinition, user: string, comment: string): ConfigurableVoteResult {
    const state = this.states.get(counter.id)!;
    if (matchesAny(counter.withdrawalTriggers, comment)) {
      if (!state.voters.delete(user)) return 'not-voted';
      if (state.manualWithdrawals > 0) state.manualWithdrawals--;
      return 'withdrawn';
    }
    const matches = counter.options.filter((option) => matchesAny(option.triggers, comment));
    if (matches.length === 0) return 'no-match';
    if (matches.length > 1) return 'ambiguous';
    const optionId = matches[0]!.id;
    const previous = state.voters.get(user);
    if (previous === optionId) return 'duplicate';
    state.voters.set(user, optionId);
    return previous ? 'switched' : 'counted';
  }
  private counter(counterId: string): CounterDefinition {
    const counter = this.counters.find((candidate) => candidate.id === counterId);
    if (!counter) throw new RangeError(`Unknown counter: ${counterId}`);
    return counter;
  }
  private snapshot(counter: CounterDefinition): CounterSnapshot {
    const state = this.states.get(counter.id)!;
    const counts = new Map<string, number>();
    for (const option of counter.options) counts.set(option.id, 0);
    for (const optionId of state.voters.values()) counts.set(optionId, (counts.get(optionId) ?? 0) + 1);
    for (const [optionId, count] of state.manualVotes) counts.set(optionId, (counts.get(optionId) ?? 0) + count);
    const options = counter.options.map((option) => ({ optionId: option.id, label: option.label, count: Math.max(0, counts.get(option.id) ?? 0) }));
    const totalCount = Math.max(0, options.reduce((total, option) => total + option.count, 0) - state.manualWithdrawals);
    return { counterId: counter.id, name: counter.name, mode: counter.mode, options, totalCount, target: counter.target, targetReached: counter.target !== null && totalCount >= counter.target, roundId: state.roundId };
  }
}

export function matchesTrigger(trigger: Trigger, comment: string): boolean {
  const value = trigger.value.normalize('NFC');
  if (!value.trim()) return false;
  if (trigger.kind === 'emoji') return comment.includes(value);
  const text = comment.toLocaleLowerCase();
  const target = value.toLocaleLowerCase();
  if (trigger.match === 'contains') return text.includes(target);
  const escaped = target.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(?:^|[^\\p{L}\\p{N}_])${escaped}(?:$|[^\\p{L}\\p{N}_])`, 'u').test(text);
}
function matchesAny(triggers: readonly Trigger[], comment: string): boolean { return triggers.some((trigger) => matchesTrigger(trigger, comment)); }
function createRoundId(): string {
  const cryptoApi = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto;
  return cryptoApi?.randomUUID?.() ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}
