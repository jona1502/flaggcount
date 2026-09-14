import type { LiveChatServiceFactory } from '../live/LiveChatService';
import { TikTokLiveService, type LiveConnectionFactory, type TikTokLiveServiceOptions } from './TikTokLiveService';

/** Adapts the TikTok connector and normalization to the provider-neutral live contract. */
export function createTikTokAdapter(
  createConnection: LiveConnectionFactory,
  options: TikTokLiveServiceOptions = {}
): LiveChatServiceFactory {
  return (listener) => new TikTokLiveService(createConnection, listener, options);
}
