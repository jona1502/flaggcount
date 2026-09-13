import type { CounterDefinition, CounterMode } from '../profiles';
import { DEFAULT_TARGET, isValidTarget } from './target';
import { createTriggerMatcher, normalizeComment, type NormalizedComment, type TriggerMatcher } from './triggers';
import type { VoteSnapshot } from './VotingService';

export type OptionSnapshot = {
  optionId: string;
  label: string;
  count: number;
};

/** Serializable view of one counter, safe to send to UI, overlay and relay: no viewer identities. */
export type CounterSnapshot = {
  counterId: string;
  name: string;
  mode: CounterMode;
  options: OptionSnapshot[];
  totalCount: number;
  target: number | null;
  targetReached: boolean;
  roundId: string;
};

/**
 * `moved` shifts a viewer's vote to another option of a poll; `ambiguous` messages match several
 * options of the same counter and are ignored there.
 */
export type CounterVoteResult =
  | 'counted'
  | 'moved'
  | 'duplicate'
  | 'withdrawn'
  | 'not-voted'
  | 'ambiguous'
  | 'no-match'
  | 'invalid-user';

export type CommentResult = {
  counterId: string;
  result: CounterVoteResult;
};

export type CountersListener = (counters: CounterSnapshot[]) => void;

export type VotingEngineOptions = {
  createRoundId?: () => string;
};

type CompiledOption = {
  id: string;
  matches: TriggerMatcher;
};

type CounterState = {
  definition: CounterDefinition;
  options: CompiledOption[];
  withdraws: TriggerMatcher;
  /** Viewer id → option id. Lives only in memory and never leaves the engine. */
  voters: Map<string, string>;
  chatVotes: Map<string, number>;
  manualVotes: Map<string, number>;
  /** Operator corrections that subtract from an option's count. */
  manualWithdrawals: Map<string, number>;
  roundId: string;
};

const CHANGING_RESULTS: ReadonlySet<CounterVoteResult> = new Set(['counted', 'moved', 'withdrawn']);

function anyOf(matchers: TriggerMatcher[]): TriggerMatcher {
  return (comment) => matchers.some((matches) => matches(comment));
}

function increment(counts: Map<string, number>, key: string, by = 1): void {
  counts.set(key, (counts.get(key) ?? 0) + by);
}

/**
 * Counts one active vote per viewer per counter and round, for any number of independent counters.
 * Every chat message is normalized once and then matched against all counters. Free of UI, Node.js
 * and browser APIs so it can run in the sidecar or on the web. Definitions must be validated upstream.
 */
export class VotingEngine {
  private counters: CounterState[];
  private readonly listeners = new Set<CountersListener>();
  private readonly createRoundId: () => string;

  constructor(definitions: CounterDefinition[], options: VotingEngineOptions = {}) {
    this.createRoundId = options.createRoundId ?? createRandomRoundId;
    this.counters = definitions.map((definition) => this.createState(definition));
  }

  /**
   * Replaces the counter definitions. Counters that keep their id keep their round and all votes for
   * options that still exist, so reconfiguring during a stream never loses the running round.
   */
  configure(definitions: CounterDefinition[]): void {
    const before = JSON.stringify(this.getSnapshots());
    const previous = new Map(this.counters.map((counter) => [counter.definition.id, counter]));

    this.counters = definitions.map((definition) => {
      const old = previous.get(definition.id);
      if (!old) return this.createState(definition);

      const state = this.createState(definition, old.roundId);
      const optionIds = new Set(definition.options.map((option) => option.id));
      for (const [voter, optionId] of old.voters) {
        if (optionIds.has(optionId)) {
          state.voters.set(voter, optionId);
          increment(state.chatVotes, optionId);
        }
      }
      for (const [source, target] of [
        [old.manualVotes, state.manualVotes],
        [old.manualWithdrawals, state.manualWithdrawals]
      ] as const) {
        for (const [optionId, count] of source) {
          if (optionIds.has(optionId)) target.set(optionId, count);
        }
      }
      return state;
    });

    if (JSON.stringify(this.getSnapshots()) !== before) {
      this.notify();
    }
  }

  handleComment(userId: string, comment: string): CommentResult[] {
    const normalized = normalizeComment(comment);
    const voter = userId.trim();
    let changed = false;

    const results = this.counters.map((counter) => {
      const result = this.applyComment(counter, voter, normalized);
      changed ||= CHANGING_RESULTS.has(result);
      return { counterId: counter.definition.id, result };
    });

    if (changed) this.notify();
    return results;
  }

  /** Adds one operator-entered vote. Single counters need no option; polls do. */
  addManualVote(counterId: string, optionId?: string): boolean {
    const target = this.findOption(counterId, optionId);
    if (!target) return false;
    increment(target.counter.manualVotes, target.optionId);
    this.notify();
    return true;
  }

  /** Subtracts one vote without changing which viewers have voted; does nothing at zero. */
  removeManualVote(counterId: string, optionId?: string): boolean {
    const target = this.findOption(counterId, optionId);
    if (!target || this.optionCount(target.counter, target.optionId) === 0) return false;
    increment(target.counter.manualWithdrawals, target.optionId);
    this.notify();
    return true;
  }

  /** Starts a new round for one counter, or for all counters without an id. */
  reset(counterId?: string): boolean {
    const counters = this.counters.filter((counter) => counterId === undefined || counter.definition.id === counterId);
    if (counters.length === 0) return false;
    for (const counter of counters) {
      counter.voters.clear();
      counter.chatVotes.clear();
      counter.manualVotes.clear();
      counter.manualWithdrawals.clear();
      counter.roundId = this.createRoundId();
    }
    this.notify();
    return true;
  }

  setTarget(counterId: string, target: number | null): boolean {
    if (target !== null && !isValidTarget(target)) {
      throw new RangeError('Invalid target');
    }
    const counter = this.find(counterId);
    if (!counter) return false;
    if (counter.definition.target !== target) {
      counter.definition = { ...counter.definition, target };
      this.notify();
    }
    return true;
  }

  hasVoted(counterId: string, userId: string): boolean {
    return this.find(counterId)?.voters.has(userId.trim()) ?? false;
  }

  getSnapshots(): CounterSnapshot[] {
    return this.counters.map((counter) => this.snapshotOf(counter));
  }

  getSnapshot(counterId: string): CounterSnapshot | null {
    const counter = this.find(counterId);
    return counter ? this.snapshotOf(counter) : null;
  }

  subscribe(listener: CountersListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private applyComment(counter: CounterState, voter: string, comment: NormalizedComment): CounterVoteResult {
    // A withdrawal takes precedence if a message also contains a vote, so it is never undone by accident.
    const withdraws = counter.withdraws(comment);
    const matched = withdraws ? [] : counter.options.filter((option) => option.matches(comment));
    if (!withdraws && matched.length === 0) return 'no-match';
    if (!voter) return 'invalid-user';

    const previous = counter.voters.get(voter);
    if (withdraws) {
      if (previous === undefined) return 'not-voted';
      this.removeVoter(counter, voter, previous);
      return 'withdrawn';
    }

    const [option, ...others] = matched;
    if (!option || others.length > 0) return 'ambiguous';
    if (previous === option.id) return 'duplicate';

    if (previous !== undefined) this.removeVoter(counter, voter, previous);
    counter.voters.set(voter, option.id);
    increment(counter.chatVotes, option.id);
    return previous === undefined ? 'counted' : 'moved';
  }

  private removeVoter(counter: CounterState, voter: string, optionId: string): void {
    counter.voters.delete(voter);
    increment(counter.chatVotes, optionId, -1);
    // If the operator already corrected this option downwards, the real withdrawal absorbs one
    // correction, so later votes still raise the count normally.
    const corrections = counter.manualWithdrawals.get(optionId) ?? 0;
    if (corrections > 0) counter.manualWithdrawals.set(optionId, corrections - 1);
  }

  private optionCount(counter: CounterState, optionId: string): number {
    const count =
      (counter.chatVotes.get(optionId) ?? 0) +
      (counter.manualVotes.get(optionId) ?? 0) -
      (counter.manualWithdrawals.get(optionId) ?? 0);
    return Math.max(0, count);
  }

  private snapshotOf(counter: CounterState): CounterSnapshot {
    const { id, name, mode, target } = counter.definition;
    const options = counter.definition.options.map((option) => ({
      optionId: option.id,
      label: option.label,
      count: this.optionCount(counter, option.id)
    }));
    const totalCount = options.reduce((sum, option) => sum + option.count, 0);
    return {
      counterId: id,
      name,
      mode,
      options,
      totalCount,
      target,
      targetReached: target !== null && totalCount >= target,
      roundId: counter.roundId
    };
  }

  private find(counterId: string): CounterState | undefined {
    return this.counters.find((counter) => counter.definition.id === counterId);
  }

  private findOption(counterId: string, optionId?: string): { counter: CounterState; optionId: string } | null {
    const counter = this.find(counterId);
    if (!counter) return null;
    const { mode, options } = counter.definition;
    const resolved = optionId ?? (mode === 'single' ? options[0]?.id : undefined);
    return resolved !== undefined && options.some((option) => option.id === resolved) ? { counter, optionId: resolved } : null;
  }

  private createState(definition: CounterDefinition, roundId = this.createRoundId()): CounterState {
    return {
      definition,
      options: definition.options.map((option) => ({
        id: option.id,
        matches: anyOf(option.triggers.map(createTriggerMatcher))
      })),
      withdraws: anyOf(definition.withdrawalTriggers.map(createTriggerMatcher)),
      voters: new Map(),
      chatVotes: new Map(),
      manualVotes: new Map(),
      manualWithdrawals: new Map(),
      roundId
    };
  }

  private notify(): void {
    const snapshots = this.getSnapshots();
    for (const listener of this.listeners) {
      listener(snapshots);
    }
  }
}

/**
 * The single-count view the 0.2 dashboard, overlay and relay understand. A counter without a target
 * shows the default target, which never happens for counters created by the current UI.
 */
export function toVoteSnapshot(counter: CounterSnapshot): VoteSnapshot {
  return {
    count: counter.totalCount,
    target: counter.target ?? DEFAULT_TARGET,
    roundId: counter.roundId,
    targetReached: counter.targetReached
  };
}

export function createRandomRoundId(): string {
  const cryptoApi = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto;
  return cryptoApi?.randomUUID?.() ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}
