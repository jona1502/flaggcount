import type { ConnectionState } from '../../shared/appState';
import { createRedFlagCounter, type CounterDefinition } from '../../shared/profiles';
import { DEFAULT_OVERLAY_SETTINGS, type OverlaySettings } from '../../shared/settings';
import { VotingEngine, toVoteSnapshot, type CounterSnapshot, type VoteSnapshot } from '../../shared/voting';
import type { SidecarCommand, SidecarEvent } from './protocol';
import { TikTokLiveService, type LiveConnectionFactory } from './tiktok/TikTokLiveService';

export type SidecarStateSnapshot = {
  connection: ConnectionState;
  votes: VoteSnapshot;
  counters: CounterSnapshot[];
  overlay: OverlaySettings;
};

export type SidecarAppOptions = {
  /** Counters until Tauri configures the saved ones; the red flag counter by default. */
  counters?: CounterDefinition[];
  createRoundId?: () => string;
};

/** Wires the TikTok connection to the voting logic and reports sanitized updates. */
export class SidecarApp {
  private definitions: CounterDefinition[];
  private readonly engine: VotingEngine;
  private readonly live: TikTokLiveService;
  private readonly voteListeners = new Set<(votes: VoteSnapshot) => void>();
  private readonly overlayListeners = new Set<(overlay: OverlaySettings) => void>();
  private lastVotes: string;

  constructor(
    createConnection: LiveConnectionFactory,
    private readonly send: (event: SidecarEvent) => void,
    options: SidecarAppOptions = {}
  ) {
    this.definitions = options.counters ?? [createRedFlagCounter()];
    this.engine = new VotingEngine(this.definitions, { createRoundId: options.createRoundId });
    this.lastVotes = JSON.stringify(this.getVotes());
    this.engine.subscribe((counters) => {
      send({ type: 'counters', counters });
      this.publishVotesIfChanged();
    });

    this.live = new TikTokLiveService(createConnection, {
      onStatus: (connection) => send({ type: 'status', connection }),
      onChat: (message) => {
        this.engine.handleComment(message.userId, message.comment);
      },
      onError: (error) => send({ type: 'error', error }),
      onLog: (level, message) => send({ type: 'log', level, message })
    });
  }

  getState(): SidecarStateSnapshot {
    return {
      connection: this.live.getState(),
      votes: this.getVotes(),
      counters: this.engine.getSnapshots(),
      overlay: this.getOverlaySettings()
    };
  }

  /** The first counter in the single-count format the overlay and the relay understand. */
  getVotes(): VoteSnapshot {
    const [primary] = this.engine.getSnapshots();
    if (!primary) throw new Error('The sidecar has no counter');
    return toVoteSnapshot(primary);
  }

  subscribeVotes(listener: (votes: VoteSnapshot) => void): () => void {
    this.voteListeners.add(listener);
    return () => {
      this.voteListeners.delete(listener);
    };
  }

  getCounters(): CounterSnapshot[] {
    return this.engine.getSnapshots();
  }

  subscribeCounters(listener: (counters: CounterSnapshot[]) => void): () => void {
    return this.engine.subscribe(listener);
  }

  getOverlaySettings(): OverlaySettings {
    return { ...(this.definitions[0]?.overlay ?? DEFAULT_OVERLAY_SETTINGS) };
  }

  subscribeOverlaySettings(listener: (overlay: OverlaySettings) => void): () => void {
    this.overlayListeners.add(listener);
    return () => {
      this.overlayListeners.delete(listener);
    };
  }

  async handleCommand(command: SidecarCommand): Promise<void> {
    switch (command.type) {
      case 'connect':
        await this.live.connect(command.username);
        break;
      case 'disconnect':
        await this.live.disconnect();
        break;
      case 'addManualVote':
      case 'removeManualVote': {
        const counterId = command.counterId ?? this.definitions[0]?.id ?? '';
        const applied =
          command.type === 'addManualVote'
            ? this.engine.addManualVote(counterId, command.optionId)
            : this.engine.removeManualVote(counterId, command.optionId);
        if (!applied && command.type === 'addManualVote') {
          this.send({ type: 'log', level: 'warn', message: 'Ignoring a manual vote for an unknown counter or option' });
        }
        break;
      }
      case 'reset':
        this.engine.reset(command.counterId);
        break;
      case 'configureCounters':
        this.configure(command.counters);
        break;
      case 'getState': {
        const state = this.getState();
        this.send({ type: 'status', connection: state.connection });
        this.send({ type: 'votes', votes: state.votes });
        this.send({ type: 'counters', counters: state.counters });
        break;
      }
    }
  }

  shutdown(): Promise<void> {
    return this.live.disconnect();
  }

  private configure(counters: CounterDefinition[]): void {
    const previousOverlay = JSON.stringify(this.getOverlaySettings());
    this.definitions = counters;
    this.engine.configure(counters);
    this.publishVotesIfChanged();

    const overlay = this.getOverlaySettings();
    if (JSON.stringify(overlay) !== previousOverlay) {
      for (const listener of this.overlayListeners) {
        listener({ ...overlay });
      }
    }
  }

  /** Parallel counters change without touching the first one, which must not repaint the overlay. */
  private publishVotesIfChanged(): void {
    const votes = this.getVotes();
    const serialized = JSON.stringify(votes);
    if (serialized === this.lastVotes) return;
    this.lastVotes = serialized;
    this.send({ type: 'votes', votes });
    for (const listener of this.voteListeners) {
      listener(votes);
    }
  }
}
