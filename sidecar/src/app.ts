import type { ConnectionState } from '../../shared/appState';
import { DEFAULT_OVERLAY_SETTINGS, type OverlaySettings } from '../../shared/settings';
import { MAX_TARGET, MIN_TARGET, VotingService, isValidTarget, type VoteSnapshot } from '../../shared/voting';
import type { SidecarCommand, SidecarEvent } from './protocol';
import { TELEMETRY_ERROR_CODES, voteCountBucket, type TelemetryErrorCode, type TelemetryEvent } from '../../shared/analytics';
import { TikTokLiveService, type LiveConnectionFactory } from './tiktok/TikTokLiveService';

export type SidecarStateSnapshot = {
  connection: ConnectionState;
  votes: VoteSnapshot;
  overlay: OverlaySettings;
};

export type SidecarAppOptions = {
  votingService?: VotingService;
  onTelemetry?: (event: TelemetryEvent) => void;
  onTelemetryEnabled?: (enabled: boolean) => void;
};

/** Wires the TikTok connection to the voting logic and reports sanitized updates. */
export class SidecarApp {
  private readonly voting: VotingService;
  private readonly live: TikTokLiveService;
  private overlay: OverlaySettings = { ...DEFAULT_OVERLAY_SETTINGS };
  private readonly overlayListeners = new Set<(overlay: OverlaySettings) => void>();
  private readonly onTelemetry: (event: TelemetryEvent) => void;
  private readonly onTelemetryEnabled: (enabled: boolean) => void;

  constructor(
    createConnection: LiveConnectionFactory,
    private readonly send: (event: SidecarEvent) => void,
    options: SidecarAppOptions = {}
  ) {
    this.voting = options.votingService ?? new VotingService();
    this.onTelemetry = options.onTelemetry ?? (() => undefined);
    this.onTelemetryEnabled = options.onTelemetryEnabled ?? (() => undefined);
    this.voting.subscribe((votes) => send({ type: 'votes', votes }));

    this.live = new TikTokLiveService(createConnection, {
      onStatus: (connection) => {
        send({ type: 'status', connection });
        if (connection.status === 'connected') this.onTelemetry({ version: 1, name: 'connection_succeeded' });
      },
      onChat: (message) => {
        this.voting.handleComment(message.userId, message.comment);
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
    return { connection: this.live.getState(), votes: this.voting.getSnapshot(), overlay: this.getOverlaySettings() };
  }

  getVotes(): VoteSnapshot {
    return this.voting.getSnapshot();
  }

  subscribeVotes(listener: (votes: VoteSnapshot) => void): () => void {
    return this.voting.subscribe(listener);
  }

  getOverlaySettings(): OverlaySettings {
    return { ...this.overlay };
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
        this.voting.addManualVote();
        break;
      case 'removeManualVote':
        this.voting.removeManualVote();
        break;
      case 'reset':
        if (this.voting.getSnapshot().count > 0) {
          this.onTelemetry({
            version: 1,
            name: 'round_completed',
            voteCountBucket: voteCountBucket(this.voting.getSnapshot().count)
          });
        }
        this.voting.reset();
        break;
      case 'setTarget':
        if (!isValidTarget(command.target)) {
          this.send({
            type: 'error',
            error: { code: 'invalid-target', message: `Target must be an integer between ${MIN_TARGET} and ${MAX_TARGET}` }
          });
          return;
        }
        this.voting.setTarget(command.target);
        break;
      case 'setOverlaySettings':
        this.overlay = { ...command.overlay };
        for (const listener of this.overlayListeners) {
          listener(this.getOverlaySettings());
        }
        break;
      case 'setTelemetryEnabled':
        this.onTelemetryEnabled(command.enabled);
        break;
      case 'getState': {
        const state = this.getState();
        this.send({ type: 'status', connection: state.connection });
        this.send({ type: 'votes', votes: state.votes });
        break;
      }
    }
  }

  shutdown(): Promise<void> {
    return this.live.disconnect();
  }
}
