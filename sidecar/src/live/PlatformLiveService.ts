import type { LivePlatform } from '../../../shared/live';
import type { ConnectionState } from '../../../shared/appState';
import type { LiveChatService, LiveChatServiceListener } from './LiveChatService';

/** Owns exactly one active provider and makes platform changes atomic. */
export class PlatformLiveService implements LiveChatService {
  private active: LivePlatform = 'tiktok';
  constructor(private readonly tiktok: LiveChatService, private readonly twitch: LiveChatService) {}
  getState(): ConnectionState { return this.service().getState(); }
  async connect(channelInput = '', platform: LivePlatform = 'tiktok'): Promise<void> {
    if (platform !== this.active) await this.service().disconnect();
    this.active = platform;
    await this.service().connect(channelInput, platform);
  }
  async disconnect(): Promise<void> { await this.service().disconnect(); }
  private service(): LiveChatService { return this.active === 'twitch' ? this.twitch : this.tiktok; }
}

export function createPlatformLiveService(
  tiktokFactory: (listener: LiveChatServiceListener) => LiveChatService,
  twitchFactory: (listener: LiveChatServiceListener) => LiveChatService
) {
  return (listener: LiveChatServiceListener): LiveChatService =>
    new PlatformLiveService(tiktokFactory(listener), twitchFactory(listener));
}
