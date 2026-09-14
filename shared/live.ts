export const LIVE_PLATFORMS = ['tiktok', 'twitch'] as const;
export type LivePlatform = (typeof LIVE_PLATFORMS)[number];

export type LiveChannel = {
  platform: LivePlatform;
  channelId: string | null;
  login: string | null;
  displayName: string | null;
};

export type SavedLiveSource = {
  platform: LivePlatform;
  /** User-entered channel only for providers that support it. Empty for Twitch. */
  channelInput: string;
};

export type TwitchAuthState =
  | { status: 'signed-out' }
  | { status: 'authorizing'; userCode: string; verificationUri: string; expiresAt: string }
  | { status: 'signed-in'; channelId: string; login: string; displayName: string }
  | { status: 'expired' };

export type NormalizedChatMessage = {
  platform: LivePlatform;
  messageId: string;
  userId: string;
  comment: string;
  receivedAt: number;
};

export function parseSavedLiveSource(value: unknown, legacyUsername = ''): SavedLiveSource {
  if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
    const record = value as Record<string, unknown>;
    if ((LIVE_PLATFORMS as readonly unknown[]).includes(record['platform'])) {
      const channelInput = typeof record['channelInput'] === 'string' ? record['channelInput'].trim() : '';
      return { platform: record['platform'] as LivePlatform, channelInput };
    }
  }
  return { platform: 'tiktok', channelInput: legacyUsername };
}
