import type { ConnectionState } from '../../shared/appState';
import { FREE_ENTITLEMENTS, checkCounters, effectiveCounters, type Entitlements } from '../../shared/entitlements';
import { FREE_LICENSE_STATE, type LicenseState } from '../../shared/licensing';
import { createRedFlagCounter, type CounterDefinition } from '../../shared/profiles';
import { DEFAULT_OVERLAY_SETTINGS, type OverlaySettings } from '../../shared/settings';
import { VotingEngine, toVoteSnapshot, type CounterSnapshot, type VoteSnapshot } from '../../shared/voting';
import { TELEMETRY_ERROR_CODES, voteCountBucket, type TelemetryErrorCode, type TelemetryEvent } from '../../shared/analytics';
import type { LicenseManager } from './license/licenseManager';
import type { SidecarCommand, SidecarEvent } from './protocol';
import { TikTokLiveService, type LiveConnectionFactory } from './tiktok/TikTokLiveService';

export type SidecarStateSnapshot = {
  connection: ConnectionState;
  votes: VoteSnapshot;
  counters: CounterSnapshot[];
  overlay: OverlaySettings;
  license: LicenseState;
};

export type SidecarAppOptions = {
  /** Counters until Tauri configures the saved ones; the red flag counter by default. */
  counters?: CounterDefinition[];
  createRoundId?: () => string;
  /** What the plan allows until the license manager reports otherwise; Free by default. */
  entitlements?: Entitlements;
  /** Manages FlagCount Pro on the desktop; the web version runs without it. */
  license?: LicenseManager;
  onTelemetry?: (event: TelemetryEvent) => void;
  onTelemetryEnabled?: (enabled: boolean) => void;
};

/** Wires the TikTok connection to the voting logic and reports sanitized updates. */
export class SidecarApp {
  /** Counters as configured by the user; the plan decides which of them run. */
  private requested: CounterDefinition[];
  private definitions: CounterDefinition[];
  private entitlements: Entitlements;
  private readonly engine: VotingEngine;
  private readonly live: TikTokLiveService;
  private readonly license: LicenseManager | null;
  private readonly voteListeners = new Set<(votes: VoteSnapshot) => void>();
  private readonly overlayListeners = new Set<(overlay: OverlaySettings) => void>();
  private lastVotes: string;
  private readonly onTelemetry: (event: TelemetryEvent) => void;
  private readonly onTelemetryEnabled: (enabled: boolean) => void;

  constructor(
    createConnection: LiveConnectionFactory,
    private readonly send: (event: SidecarEvent) => void,
    options: SidecarAppOptions = {}
  ) {
    this.entitlements = options.entitlements ?? FREE_ENTITLEMENTS;
    this.license = options.license ?? null;
    this.onTelemetry = options.onTelemetry ?? (() => undefined);
    this.onTelemetryEnabled = options.onTelemetryEnabled ?? (() => undefined);
    this.requested = options.counters ?? [createRedFlagCounter()];
    this.definitions = effectiveCounters(this.requested, this.entitlements);
    this.engine = new VotingEngine(this.definitions, { createRoundId: options.createRoundId });
    this.lastVotes = JSON.stringify(this.getVotes());
    this.engine.subscribe((counters) => {
      send({ type: 'counters', counters });
      this.publishVotesIfChanged();
    });

    this.live = new TikTokLiveService(createConnection, {
      onStatus: (connection) => {
        send({ type: 'status', connection });
        if (connection.status === 'connected') this.onTelemetry({ version: 1, name: 'connection_succeeded' });
      },
      onChat: (message) => {
        this.engine.handleComment(message.userId, message.comment);
      },
      onError: (error) => {
        send({ type: 'error', error });
        const code = TELEMETRY_ERROR_CODES.includes(error.code as TelemetryErrorCode)
          ? (error.code as TelemetryErrorCode)
          : 'unknown';
        this.onTelemetry({ version: 1, name: 'error', code });
      },
      onLog: (level, message) => send({ type: 'log', level, message })
    });
  }

  getState(): SidecarStateSnapshot {
    return {
      connection: this.live.getState(),
      votes: this.getVotes(),
      counters: this.engine.getSnapshots(),
      overlay: this.getOverlaySettings(),
      license: this.license?.getState() ?? FREE_LICENSE_STATE
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

  /**
   * New Pro features apply at once. Losing them never cuts the counters of a running stream: they keep
   * running until the configuration changes or the app restarts, then Free applies without deleting anything.
   */
  setEntitlements(entitlements: Entitlements): void {
    this.entitlements = entitlements;
    if (checkCounters(this.definitions, entitlements).length === 0) {
      this.configure(this.requested);
    } else {
      this.send({ type: 'log', level: 'info', message: 'The plan changed; the running counters stay until the next change' });
    }
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
        for (const snapshot of this.engine.getSnapshots()) {
          if ((!command.counterId || command.counterId === snapshot.counterId) && snapshot.totalCount > 0) {
            this.onTelemetry({ version: 1, name: 'round_completed', voteCountBucket: voteCountBucket(snapshot.totalCount) });
          }
        }
        this.engine.reset(command.counterId);
        break;
      case 'configureCounters':
        this.configure(command.counters);
        break;
      case 'configureLicense':
        await this.license?.configure(command);
        break;
      case 'activateLicense':
        await this.license?.activate(command.code, command.replaceInstallationId);
        break;
      case 'refreshLicense':
        await this.license?.refresh();
        break;
      case 'deactivateLicense':
        await this.license?.deactivate();
        break;
      case 'openCustomerPortal':
        await this.license?.openCustomerPortal();
        break;
      case 'setTelemetryEnabled':
        this.onTelemetryEnabled(command.enabled);
        break;
      case 'getState': {
        const state = this.getState();
        this.send({ type: 'status', connection: state.connection });
        this.send({ type: 'votes', votes: state.votes });
        this.send({ type: 'counters', counters: state.counters });
        this.send({ type: 'license', license: state.license });
        break;
      }
    }
  }

  shutdown(): Promise<void> {
    this.license?.stop();
    return this.live.disconnect();
  }

  private configure(counters: CounterDefinition[]): void {
    const previousOverlay = JSON.stringify(this.getOverlaySettings());
    this.requested = counters;
    this.definitions = effectiveCounters(counters, this.entitlements);
    this.engine.configure(this.definitions);
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
