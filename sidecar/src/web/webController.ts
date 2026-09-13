import type { AppError, AppState } from '../../../shared/appState';
import type { OverlaySettings, Settings } from '../../../shared/settings';
import { MAX_TARGET, MIN_TARGET, isValidTarget, type VoteSnapshot } from '../../../shared/voting';
import { SidecarApp } from '../app';
import { describeError } from '../logging';
import { parseOverlaySettings, type LogLevel, type SidecarCommand, type SidecarEvent } from '../protocol';
import type { LiveConnectionFactory } from '../tiktok/TikTokLiveService';
import { normalizeUsername } from '../tiktok/username';

export type Logger = (level: LogLevel, message: string) => void;

export type SettingsSaver = {
  save: (settings: Settings) => Promise<void>;
};

/**
 * Server-side counterpart of the Tauri backend: drives the sidecar app, persists the settings
 * and publishes the same sanitized `AppState` the desktop dashboard receives.
 */
export class WebController {
  private readonly app: SidecarApp;
  private readonly stateListeners = new Set<(state: AppState) => void>();
  private readonly errorListeners = new Set<(error: AppError) => void>();
  private settings: Settings;

  constructor(
    createConnection: LiveConnectionFactory,
    settings: Settings,
    private readonly store: SettingsSaver,
    private readonly log: Logger
  ) {
    this.settings = settings;
    this.app = new SidecarApp(createConnection, (event) => this.handleEvent(event));
  }

  /** Applies the saved target and overlay settings to the new round. */
  async start(): Promise<void> {
    await this.app.handleCommand({ type: 'setTarget', target: this.settings.target });
    await this.app.handleCommand({ type: 'setOverlaySettings', overlay: this.settings.overlay });
  }

  getState(): AppState {
    const { connection, votes } = this.app.getState();
    return {
      sidecarRunning: true,
      connection,
      votes,
      // The browser knows its public origin better than the server behind the proxy.
      overlayUrl: null,
      // The web version's own /overlay is already public.
      publicOverlayUrl: null,
      settings: { ...this.settings, overlay: { ...this.settings.overlay } }
    };
  }

  getVotes(): VoteSnapshot {
    return this.app.getVotes();
  }

  subscribeVotes(listener: (votes: VoteSnapshot) => void): () => void {
    return this.app.subscribeVotes(listener);
  }

  getOverlaySettings(): OverlaySettings {
    return this.app.getOverlaySettings();
  }

  subscribeOverlaySettings(listener: (overlay: OverlaySettings) => void): () => void {
    return this.app.subscribeOverlaySettings(listener);
  }

  subscribeState(listener: (state: AppState) => void): () => void {
    this.stateListeners.add(listener);
    return () => {
      this.stateListeners.delete(listener);
    };
  }

  subscribeErrors(listener: (error: AppError) => void): () => void {
    this.errorListeners.add(listener);
    return () => {
      this.errorListeners.delete(listener);
    };
  }

  async connect(input: unknown): Promise<AppError | null> {
    const username = typeof input === 'string' ? normalizeUsername(input) : null;
    if (!username) {
      return { code: 'invalid-username', message: 'Invalid TikTok username' };
    }
    // Like the desktop app, the outcome arrives as status and error events, not as the response.
    this.run({ type: 'connect', username });
    await this.updateSettings({ username });
    return null;
  }

  async disconnect(): Promise<AppError | null> {
    this.run({ type: 'disconnect' });
    return null;
  }

  async addManualVote(): Promise<AppError | null> {
    await this.app.handleCommand({ type: 'addManualVote' });
    return null;
  }

  async removeManualVote(): Promise<AppError | null> {
    await this.app.handleCommand({ type: 'removeManualVote' });
    return null;
  }

  async resetVotes(): Promise<AppError | null> {
    await this.app.handleCommand({ type: 'reset' });
    return null;
  }

  async setTarget(target: unknown): Promise<AppError | null> {
    if (typeof target !== 'number' || !isValidTarget(target)) {
      return { code: 'invalid-target', message: `Target must be an integer between ${MIN_TARGET} and ${MAX_TARGET}` };
    }
    await this.updateSettings({ target });
    await this.app.handleCommand({ type: 'setTarget', target });
    return null;
  }

  async setOverlaySettings(value: unknown): Promise<AppError | null> {
    const overlay = parseOverlaySettings(value);
    if (!overlay) {
      return { code: 'invalid-overlay-settings', message: 'Invalid overlay settings' };
    }
    await this.updateSettings({ overlay });
    await this.app.handleCommand({ type: 'setOverlaySettings', overlay });
    return null;
  }

  shutdown(): Promise<void> {
    return this.app.shutdown();
  }

  private run(command: SidecarCommand): void {
    this.app.handleCommand(command).catch((error: unknown) => {
      this.log('error', `Command ${command.type} failed: ${describeError(error)}`);
    });
  }

  private async updateSettings(changes: Partial<Settings>): Promise<void> {
    this.settings = { ...this.settings, ...changes };
    this.emitState();
    try {
      await this.store.save(this.settings);
    } catch (error) {
      this.log('error', `Saving settings failed: ${describeError(error)}`);
    }
  }

  private handleEvent(event: SidecarEvent): void {
    switch (event.type) {
      case 'status':
      case 'votes':
        this.emitState();
        break;
      case 'error':
        for (const listener of this.errorListeners) {
          listener(event.error);
        }
        break;
      case 'log':
        this.log(event.level, event.message);
        break;
      case 'ready':
        break;
    }
  }

  private emitState(): void {
    const state = this.getState();
    for (const listener of this.stateListeners) {
      listener(state);
    }
  }
}
