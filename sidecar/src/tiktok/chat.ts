import type { ChatMessage } from '../protocol';

type RawUser = { id?: string; displayId?: string; nickname?: string };

/** The subset of the connector's `WebcastChatMessage` that FlagCount relies on. */
export type RawChatMessage = {
  common?: { msgId?: string } | undefined;
  user?: RawUser | undefined;
  content?: string;
  /** TikTok marks the user targeted by a reply separately from the comment text. */
  atUser?: RawUser | undefined;
  /** Other users explicitly mentioned in the comment. */
  mentionUsers?: RawUser[] | undefined;
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
    comment: withoutMentionedUserNames(raw.content ?? '', [raw.atUser, ...(raw.mentionUsers ?? [])]),
    receivedAt
  };
}

/**
 * TikTok includes reply/mention labels in `content`. A flag in such a display name is
 * not part of the viewer's message, so remove only names backed by TikTok's mention metadata.
 */
function withoutMentionedUserNames(content: string, users: Array<RawUser | undefined>): string {
  let comment = withoutEmojiVariationSelectors(content);
  const aliases = new Set<string>();

  for (const user of users) {
    for (const value of [user?.displayId, user?.nickname]) {
      const alias = withoutEmojiVariationSelectors(value?.trim() ?? '');
      if (alias) aliases.add(alias);
    }
  }

  // Longer display names must be removed before a shorter handle that may be part of them.
  for (const alias of [...aliases].sort((left, right) => right.length - left.length)) {
    comment = comment.split(`@${alias}`).join('');
    if (comment.startsWith(alias)) {
      comment = comment.slice(alias.length);
    }
  }
  return comment;
}

function withoutEmojiVariationSelectors(value: string): string {
  return value.split('\uFE0F').join('');
}
