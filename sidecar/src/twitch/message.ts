import type { ChatMessage } from '../protocol';

type Fragment = { type?: string; text?: string; emote?: { id?: string; emote_set_id?: string } };
type ChatEvent = {
  message_id?: string;
  chatter_user_id?: string;
  chatter_user_login?: string;
  chatter_user_name?: string;
  message?: { text?: string; fragments?: Fragment[] };
};

export function normalizeFragments(message: ChatEvent['message']): string {
  if (Array.isArray(message?.fragments)) {
    return message.fragments.map((fragment) => typeof fragment.text === 'string' ? fragment.text : '').join('');
  }
  return typeof message?.text === 'string' ? message.text : '';
}

export function toTwitchChatMessage(event: ChatEvent, receivedAt: number): ChatMessage | null {
  const userId = event.chatter_user_id?.trim();
  const messageId = event.message_id?.trim();
  if (!userId || !messageId) return null;
  return {
    platform: 'twitch',
    messageId,
    userId,
    uniqueId: event.chatter_user_login?.trim() ?? '',
    nickname: event.chatter_user_name?.trim() ?? '',
    comment: normalizeFragments(event.message),
    receivedAt
  };
}
