import { containsRedFlag } from './redFlag';

export const DEFAULT_TARGET = 100;
export const MIN_TARGET = 1;
export const MAX_TARGET = 100_000;

export type VoteState = {
  voters: Set<string>;
  manualVotes: number;
  count: number;
  target: number;
  roundId: string;
};

/** Serializable view of the vote state, safe to send to UI and overlay. */
export type VoteSnapshot = {
  count: number;
  target: number;
  roundId: string;
  targetReached: boolean;
};

export type VoteResult = 'counted' | 'duplicate' | 'no-flag' | 'invalid-user';

export type VoteListener = (snapshot: VoteSnapshot) => void;

export type VotingServiceOptions = {
  target?: number;
  createRoundId?: () => string;
};

export function isValidTarget(target: number): boolean {
  return Number.isInteger(target) && target >= MIN_TARGET && target <= MAX_TARGET;
}

/**
 * Counts one vote per user per round for comments containing 🚩.
 * Free of UI, Node.js and browser APIs so it can run in the sidecar or on the web.
 */
export class VotingService {
  private readonly state: VoteState;
  private readonly listeners = new Set<VoteListener>();
  private readonly createRoundId: () => string;

  constructor(options: VotingServiceOptions = {}) {
    const target = options.target ?? DEFAULT_TARGET;
    assertValidTarget(target);

    this.createRoundId = options.createRoundId ?? createRandomRoundId;
    this.state = { voters: new Set(), manualVotes: 0, count: 0, target, roundId: this.createRoundId() };
  }

  handleComment(userId: string, comment: string): VoteResult {
    if (!containsRedFlag(comment)) {
      return 'no-flag';
    }

    const voter = userId.trim();
    if (!voter) {
      return 'invalid-user';
    }
    if (this.state.voters.has(voter)) {
      return 'duplicate';
    }

    this.state.voters.add(voter);
    this.state.count = this.state.voters.size + this.state.manualVotes;
    this.notify();
    return 'counted';
  }

  /** Adds one operator-entered vote without affecting TikTok's per-viewer deduplication. */
  addManualVote(): VoteSnapshot {
    this.state.manualVotes++;
    this.state.count = this.state.voters.size + this.state.manualVotes;
    this.notify();
    return this.getSnapshot();
  }

  /** Starts a new round: all votes are cleared and every user may vote again. */
  reset(): VoteSnapshot {
    this.state.voters.clear();
    this.state.manualVotes = 0;
    this.state.count = 0;
    this.state.roundId = this.createRoundId();
    this.notify();
    return this.getSnapshot();
  }

  setTarget(target: number): VoteSnapshot {
    assertValidTarget(target);
    if (target !== this.state.target) {
      this.state.target = target;
      this.notify();
    }
    return this.getSnapshot();
  }

  hasVoted(userId: string): boolean {
    return this.state.voters.has(userId.trim());
  }

  getSnapshot(): VoteSnapshot {
    const { count, target, roundId } = this.state;
    return { count, target, roundId, targetReached: count >= target };
  }

  subscribe(listener: VoteListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private notify(): void {
    const snapshot = this.getSnapshot();
    for (const listener of this.listeners) {
      listener(snapshot);
    }
  }
}

function assertValidTarget(target: number): void {
  if (!isValidTarget(target)) {
    throw new RangeError(`Target must be an integer between ${MIN_TARGET} and ${MAX_TARGET}`);
  }
}

function createRandomRoundId(): string {
  const cryptoApi = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto;
  return cryptoApi?.randomUUID?.() ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}
