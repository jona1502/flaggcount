import type { ChatMessage } from '../protocol';

/** The subset of the connector's `WebcastChatMessage` that FlagCount relies on. */
export type RawChatMessage = {
  common?: { msgId?: string } | undefined;
  user?: { id?: string; displayId?: string; nickname?: string } | undefined;
  content?: string;
};

export function toChatMessage(raw: RawChatMessage, receivedAt: number): ChatMessage | null {
  const numericId = raw.user?.id?.trim() ?? '';
  const uniqueId = raw.user?.displayId?.trim() ?? '';

  // Prefer the numeric id: users can change their handle, but not their id.
  let userId = '';
  if (numericId && numericId !== '0') {
    userId = numericId;
  } else if (uniqueId) {
    userId = `unique:${uniqueId.toLowerCase()}`;
  }
  if (!userId) {
    return null;
  }

  return {
    messageId: raw.common?.msgId ?? '',
    userId,
    uniqueId,
    nickname: raw.user?.nickname ?? '',
    comment: raw.content ?? '',
    receivedAt
  };
}
