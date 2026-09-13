import type { ConnectionState } from '../../shared/appState';
import { MAX_TARGET, MIN_TARGET, VotingService, isValidTarget, type VoteSnapshot } from '../../shared/voting';
import type { SidecarCommand, SidecarEvent } from './protocol';
import { TikTokLiveService, type LiveConnectionFactory } from './tiktok/TikTokLiveService';

export type SidecarStateSnapshot = {
  connection: ConnectionState;
  votes: VoteSnapshot;
};

export type SidecarAppOptions = {
  votingService?: VotingService;
};

/** Wires the TikTok connection to the voting logic and reports sanitized updates. */
export class SidecarApp {
  private readonly voting: VotingService;
  private readonly live: TikTokLiveService;

  constructor(
    createConnection: LiveConnectionFactory,
    private readonly send: (event: SidecarEvent) => void,
    options: SidecarAppOptions = {}
  ) {
    this.voting = options.votingService ?? new VotingService();
    this.voting.subscribe((votes) => send({ type: 'votes', votes }));

    this.live = new TikTokLiveService(createConnection, {
      onStatus: (connection) => send({ type: 'status', connection }),
      onChat: (message) => {
        this.voting.handleComment(message.userId, message.comment);
      },
      onError: (error) => send({ type: 'error', error }),
      onLog: (level, message) => send({ type: 'log', level, message })
    });
  }

  getState(): SidecarStateSnapshot {
    return { connection: this.live.getState(), votes: this.voting.getSnapshot() };
  }

  getVotes(): VoteSnapshot {
    return this.voting.getSnapshot();
  }

  subscribeVotes(listener: (votes: VoteSnapshot) => void): () => void {
    return this.voting.subscribe(listener);
  }

  async handleCommand(command: SidecarCommand): Promise<void> {
    switch (command.type) {
      case 'connect':
        await this.live.connect(command.username);
        break;
      case 'disconnect':
        await this.live.disconnect();
        break;
      case 'reset':
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
