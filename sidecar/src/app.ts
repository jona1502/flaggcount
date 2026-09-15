import type { ConnectionState } from '../../shared/appState';
import { FREE_ENTITLEMENTS, canUse, checkCounters, effectiveCounters, limitFor, type Entitlements } from '../../shared/entitlements';
import { FREE_LICENSE_STATE, type LicenseState } from '../../shared/licensing';
import { DEFAULT_BOARD_LAYOUT, OVERVIEW_SCOPE, buildCounterViews, type BoardAccess } from '../../shared/overlayBoard';
import { AUTO_SCENE_ID, LIVE_SCOPE, createRedFlagCounter, type CounterDefinition, type OverlayView } from '../../shared/profiles';
import { DEFAULT_OVERLAY_SETTINGS, type OverlaySettings } from '../../shared/settings';
import { VotingEngine, toVoteSnapshot, type CounterSnapshot, type VoteSnapshot } from '../../shared/voting';
import type { LicenseManager } from './license/licenseManager';
import type { SidecarCommand, SidecarEvent } from './protocol';
import { trimHistory, type RoundRecord } from '../../shared/history';
import type { LiveChatService, LiveChatServiceFactory } from './live/LiveChatService';
import type { TwitchAuthManager } from './twitch/TwitchAuthManager';
import type { TwitchAuthState } from '../../shared/live';

export type SidecarStateSnapshot = {
  connection: ConnectionState;
  votes: VoteSnapshot;
  counters: CounterSnapshot[];
  overlay: OverlaySettings;
  license: LicenseState;
  history: RoundRecord[];
  twitchAuth: TwitchAuthState;
};

export type SidecarAppOptions = {
  /** Counters until Tauri configures the saved ones; the red flag counter by default. */
  counters?: CounterDefinition[];
  overlayViews?: OverlayView[];
  createRoundId?: () => string;
  /** What the plan allows until the license manager reports otherwise; Free by default. */
  entitlements?: Entitlements;
  /** Manages FlagCount Pro on the desktop; the web version runs without it. */
  license?: LicenseManager;
  history?: RoundRecord[];
  onHistoryChanged?: (history: RoundRecord[]) => void;
  twitchAuth?: TwitchAuthManager;
};

/** Wires the selected live-chat provider to voting and reports sanitized updates. */
export class SidecarApp {
  /** Counters as configured by the user; the plan decides which of them run. */
  private requested: CounterDefinition[];
  private definitions: CounterDefinition[];
  private overlayViews: OverlayView[];
  private entitlements: Entitlements;
  private readonly engine: VotingEngine;
  private readonly live: LiveChatService;
  private readonly license: LicenseManager | null;
  private readonly twitchAuth: TwitchAuthManager | null;
  private readonly voteListeners = new Set<(votes: VoteSnapshot) => void>();
  private readonly overlayListeners = new Set<(overlay: OverlaySettings) => void>();
  private readonly boardListeners = new Set<() => void>();
  private lastVotes: string;
  private history: RoundRecord[];
  private readonly onHistoryChanged: (history: RoundRecord[]) => void;
  private readonly startedAt = new Map<string, string>();
  private readonly manualVotes = new Map<string, number>();
  private profileId = 'active';
  private profileName = 'Aktives Profil';
  private liveSceneId = AUTO_SCENE_ID;
  private liveHidden = false;

  constructor(
    createLiveService: LiveChatServiceFactory,
    private readonly send: (event: SidecarEvent) => void,
    options: SidecarAppOptions = {}
  ) {
    this.entitlements = options.entitlements ?? FREE_ENTITLEMENTS;
    this.license = options.license ?? null;
    this.twitchAuth = options.twitchAuth ?? null;
    this.history = options.history ?? [];
    this.onHistoryChanged = options.onHistoryChanged ?? (() => undefined);
    this.requested = options.counters ?? [createRedFlagCounter()];
    this.overlayViews = options.overlayViews ?? [];
    this.definitions = effectiveCounters(this.requested, this.entitlements);
    this.engine = new VotingEngine(this.definitions, { createRoundId: options.createRoundId });
    for (const counter of this.definitions) this.startedAt.set(counter.id, new Date().toISOString());
    this.lastVotes = JSON.stringify(this.getVotes());
    this.engine.subscribe((counters) => {
      send({ type: 'counters', counters });
      this.publishVotesIfChanged();
      this.notifyBoard();
    });

    this.live = createLiveService({
      onStatus: (connection) => {
        send({ type: 'status', connection });
      },
      onChat: (message) => {
        this.engine.handleComment(message.userId, message.comment);
      },
      onError: (error) => {
        send({ type: 'error', error });
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
      license: this.license?.getState() ?? FREE_LICENSE_STATE,
      history: structuredClone(this.history)
      ,twitchAuth: this.twitchAuth?.getState() ?? { status: 'signed-out' }
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
      this.notifyBoard();
    }
  }

  /**
   * What an overlay for one counter or for the overview may show. Free has one overlay; Pro one per
   * counter and the overview of all counters.
   */
  getBoard(scope: string): BoardAccess {
    if (scope === LIVE_SCOPE) return this.getLiveBoard();
    const views = buildCounterViews(this.engine.getSnapshots(), this.definitions);
    if (scope === OVERVIEW_SCOPE) {
      return canUse(this.entitlements, 'parallel-counters')
        ? { status: 'ok', counters: views, layout: { ...DEFAULT_BOARD_LAYOUT, layout: 'vertical' } }
        : { status: 'pro-required' };
    }
    const custom = this.overlayViews.find((view) => view.id === scope);
    if (custom) {
      if (!canUse(this.entitlements, 'parallel-counters')) return { status: 'pro-required' };
      const selected = custom.items.map((item) => views.find((view) => view.counterId === item.counterId)).filter((view): view is NonNullable<typeof view> => Boolean(view));
      if (selected.length === 0) return { status: 'not-found' };
      const { layout, gap, horizontalAlign, verticalAlign, scale } = custom;
      return { status: 'ok', counters: selected, layout: { layout, gap, horizontalAlign, verticalAlign, scale } };
    }
    const index = views.findIndex((view) => view.counterId === scope);
    const view = views[index];
    if (!view) return { status: 'not-found' };
    return index < limitFor(this.entitlements, 'overlayUrls') ? { status: 'ok', counters: [view], layout: { ...DEFAULT_BOARD_LAYOUT } } : { status: 'pro-required' };
  }

  /**
   * The fixed live overlay shows the chosen scene. Hidden it stays connected but empty; Free shows its one
   * overlay, and a scene that cannot run right now falls back to the automatic scene.
   */
  private getLiveBoard(): BoardAccess {
    if (this.liveHidden) return { status: 'ok', counters: [], layout: { ...DEFAULT_BOARD_LAYOUT } };
    if (!canUse(this.entitlements, 'parallel-counters')) {
      const [first] = buildCounterViews(this.engine.getSnapshots(), this.definitions);
      return { status: 'ok', counters: first ? [first] : [], layout: { ...DEFAULT_BOARD_LAYOUT } };
    }
    const scene = this.liveSceneId === AUTO_SCENE_ID ? null : this.getBoard(this.liveSceneId);
    return scene?.status === 'ok' ? scene : this.getBoard(OVERVIEW_SCOPE);
  }

  /** Every overlay scope the plan allows right now: the running counters, the live overlay and, with Pro, the scenes. */
  getBoardScopes(): string[] {
    const scopes = this.definitions.map((definition) => definition.id);
    return [...scopes, OVERVIEW_SCOPE, LIVE_SCOPE, ...this.overlayViews.map((view) => view.id)].filter((scope) => this.getBoard(scope).status === 'ok');
  }

  getSignedEntitlement() {
    return this.license?.getSignedEntitlement() ?? null;
  }

  /** Notifies about counts, counters, designs and plan changes, which all change the overlays. */
  subscribeBoard(listener: () => void): () => void {
    this.boardListeners.add(listener);
    return () => {
      this.boardListeners.delete(listener);
    };
  }

  async handleCommand(command: SidecarCommand): Promise<void> {
    switch (command.type) {
      case 'connect':
        await ('username' in command
          ? this.live.connect(command.username, 'tiktok')
          : this.live.connect(command.channelInput, command.platform));
        break;
      case 'disconnect':
        await this.live.disconnect();
        break;
      case 'configureTwitchAuth':
        await this.twitchAuth?.configure(command.credentials);
        break;
      case 'startTwitchAuth':
        if (!this.twitchAuth) {
          this.send({ type: 'error', error: { code: 'provider-not-configured', message: 'Twitch is not configured' } });
        } else {
          await this.twitchAuth.start();
        }
        break;
      case 'disconnectTwitchAccount':
        await this.twitchAuth?.disconnect();
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
        if (applied && command.type === 'addManualVote') this.manualVotes.set(counterId, (this.manualVotes.get(counterId) ?? 0) + 1);
        break;
      }
      case 'reset':
        this.finishRounds(command.counterId, 'reset');
        this.engine.reset(command.counterId);
        break;
      case 'configureCounters':
        this.profileId = command.profileId ?? this.profileId;
        this.profileName = command.profileName ?? this.profileName;
        this.overlayViews = command.overlayViews ?? [];
        this.liveSceneId = command.liveSceneId ?? AUTO_SCENE_ID;
        this.liveHidden = command.liveHidden ?? false;
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
      case 'clearHistory':
        this.history = [];
        this.onHistoryChanged([]);
        this.send({ type: 'history', history: [] });
        break;
      case 'getState': {
        const state = this.getState();
        this.send({ type: 'status', connection: state.connection });
        this.send({ type: 'votes', votes: state.votes });
        this.send({ type: 'counters', counters: state.counters });
        this.send({ type: 'license', license: state.license });
        this.send({ type: 'history', history: this.history });
        break;
      }
    }
  }

  shutdown(): Promise<void> {
    this.finishRounds(undefined, 'app-exit');
    this.license?.stop();
    return this.live.disconnect();
  }

  private configure(counters: CounterDefinition[]): void {
    if (JSON.stringify(counters.map(({ id }) => id)) !== JSON.stringify(this.requested.map(({ id }) => id))) {
      this.finishRounds(undefined, 'profile-change');
    }
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
    this.notifyBoard();
  }

  private finishRounds(counterId: string | undefined, reason: RoundRecord['endReason']): void {
    if (!canUse(this.entitlements, 'history')) return;
    const endedAt = new Date().toISOString();
    const records = this.engine.getSnapshots().filter((snapshot) => (!counterId || snapshot.counterId === counterId) && snapshot.totalCount > 0).map((snapshot): RoundRecord => ({
      schemaVersion: 1, id: `${snapshot.roundId}-${endedAt}`, profileId: this.profileId, profileName: this.profileName, counterId: snapshot.counterId,
      counterName: snapshot.name, mode: snapshot.mode, startedAt: this.startedAt.get(snapshot.counterId) ?? endedAt, endedAt, endReason: reason,
      target: snapshot.target, targetReached: snapshot.targetReached, totalCount: snapshot.totalCount,
      options: snapshot.options.map(({ optionId, label, count }) => ({ optionId, label, count })), manualVotes: this.manualVotes.get(snapshot.counterId) ?? 0
    }));
    if (records.length) {
      this.history = trimHistory([...this.history, ...records]);
      this.onHistoryChanged(this.history);
      this.send({ type: 'history', history: this.history });
    }
    for (const snapshot of this.engine.getSnapshots()) if (!counterId || snapshot.counterId === counterId) { this.startedAt.set(snapshot.counterId, endedAt); this.manualVotes.delete(snapshot.counterId); }
  }

  private notifyBoard(): void {
    for (const listener of [...this.boardListeners]) {
      listener();
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
