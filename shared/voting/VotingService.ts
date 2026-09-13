import { RED_FLAG_COUNTER_ID, createRedFlagCounter } from '../profiles';
import { DEFAULT_TARGET, MAX_TARGET, MIN_TARGET, isValidTarget } from './target';
import { VotingEngine, toVoteSnapshot } from './VotingEngine';

export { DEFAULT_TARGET, MAX_TARGET, MIN_TARGET, isValidTarget };

/** Serializable view of the vote state, safe to send to UI and overlay. */
export type VoteSnapshot = {
  count: number;
  target: number;
  roundId: string;
  targetReached: boolean;
};

export type VoteResult = 'counted' | 'duplicate' | 'withdrawn' | 'not-voted' | 'no-flag' | 'invalid-user';

export type VoteListener = (snapshot: VoteSnapshot) => void;

export type VotingServiceOptions = {
  target?: number;
  createRoundId?: () => string;
};

/**
 * Compatibility adapter for the 0.2 red flag counter: one vote per user per round for comments
 * containing 🚩, withdrawn with 🏳️. Backed by a `VotingEngine` with a single counter.
 */
export class VotingService {
  private readonly engine: VotingEngine;

  constructor(options: VotingServiceOptions = {}) {
    const target = options.target ?? DEFAULT_TARGET;
    assertValidTarget(target);
    this.engine = new VotingEngine([createRedFlagCounter(target)], { createRoundId: options.createRoundId });
  }

  handleComment(userId: string, comment: string): VoteResult {
    const [outcome] = this.engine.handleComment(userId, comment);
    switch (outcome?.result) {
      case 'counted':
      case 'withdrawn':
      case 'not-voted':
      case 'invalid-user':
        return outcome.result;
      case 'no-match':
      case undefined:
        return 'no-flag';
      default:
        // A single counter has one option, so votes can neither move nor be ambiguous.
        return 'duplicate';
    }
  }

  /** Adds one operator-entered vote without affecting TikTok's per-viewer deduplication. */
  addManualVote(): VoteSnapshot {
    this.engine.addManualVote(RED_FLAG_COUNTER_ID);
    return this.getSnapshot();
  }

  /** Subtracts one operator-entered correction without changing which viewers have voted. */
  removeManualVote(): VoteSnapshot {
    this.engine.removeManualVote(RED_FLAG_COUNTER_ID);
    return this.getSnapshot();
  }

  /** Starts a new round: all votes are cleared and every user may vote again. */
  reset(): VoteSnapshot {
    this.engine.reset();
    return this.getSnapshot();
  }

  setTarget(target: number): VoteSnapshot {
    assertValidTarget(target);
    this.engine.setTarget(RED_FLAG_COUNTER_ID, target);
    return this.getSnapshot();
  }

  hasVoted(userId: string): boolean {
    return this.engine.hasVoted(RED_FLAG_COUNTER_ID, userId);
  }

  getSnapshot(): VoteSnapshot {
    const [counter] = this.engine.getSnapshots();
    if (!counter) throw new Error('The red flag counter is missing');
    return toVoteSnapshot(counter);
  }

  subscribe(listener: VoteListener): () => void {
    return this.engine.subscribe(([counter]) => {
      if (counter) listener(toVoteSnapshot(counter));
    });
  }
}

function assertValidTarget(target: number): void {
  if (!isValidTarget(target)) {
    throw new RangeError(`Target must be an integer between ${MIN_TARGET} and ${MAX_TARGET}`);
  }
}
