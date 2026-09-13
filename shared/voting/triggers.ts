export type TriggerKind = 'emoji' | 'text';
/** `word` only matches whole words; emoji triggers always match anywhere in the message. */
export type TriggerMatch = 'contains' | 'word';

/** What a viewer writes in the chat to vote for an option or to withdraw their vote. */
export type Trigger = {
  kind: TriggerKind;
  value: string;
  match: TriggerMatch;
};

export const MAX_TRIGGER_LENGTH = 40;

/** A chat message, normalized once and then matched against the triggers of every counter. */
export type NormalizedComment = {
  emoji: string;
  text: string;
};

export type TriggerMatcher = (comment: NormalizedComment) => boolean;

const VARIATION_SELECTORS = /[︎️]/gu;
const EMOJI = /[\p{Extended_Pictographic}\p{Regional_Indicator}⃣]/u;
const LETTER = /\p{L}/u;
const WHITESPACE = /\s/u;
const WORD_CHARACTER = '[\\p{L}\\p{N}\\p{M}]';

/** Emoji compare exactly, apart from the optional variation selector: 🏳 and 🏳️ are the same flag. */
export function normalizeEmoji(value: string): string {
  return value.replace(VARIATION_SELECTORS, '');
}

/** Unicode-compatible, case-insensitive text with collapsed whitespace. */
export function normalizeText(value: string): string {
  return value.normalize('NFKC').toLowerCase().replace(/\s+/gu, ' ').trim();
}

export function normalizeComment(comment: string): NormalizedComment {
  return { emoji: normalizeEmoji(comment), text: normalizeText(comment) };
}

/** Two triggers with the same key match the same messages, so they must not appear twice in one counter. */
export function triggerKey(trigger: Trigger): string {
  return trigger.kind === 'emoji' ? normalizeEmoji(trigger.value) : normalizeText(trigger.value);
}

/** Reads a trigger from untrusted input; empty, oversized or malformed triggers are rejected. */
export function parseTrigger(input: unknown): Trigger | null {
  if (typeof input !== 'object' || input === null || Array.isArray(input)) {
    return null;
  }
  const { kind, value, match } = input as Record<string, unknown>;
  if (typeof value !== 'string') {
    return null;
  }
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > MAX_TRIGGER_LENGTH) {
    return null;
  }

  switch (kind) {
    case 'emoji':
      if (match !== 'contains' || !EMOJI.test(trimmed) || LETTER.test(trimmed) || WHITESPACE.test(trimmed)) {
        return null;
      }
      return { kind, value: trimmed, match };
    case 'text':
      return match === 'contains' || match === 'word' ? { kind, value: trimmed, match } : null;
    default:
      return null;
  }
}

export function createTriggerMatcher(trigger: Trigger): TriggerMatcher {
  const needle = triggerKey(trigger);
  if (trigger.kind === 'emoji') {
    return (comment) => comment.emoji.includes(needle);
  }
  if (trigger.match === 'contains') {
    return (comment) => comment.text.includes(needle);
  }
  const pattern = new RegExp(`(?<!${WORD_CHARACTER})${escapeRegExp(needle)}(?!${WORD_CHARACTER})`, 'u');
  return (comment) => pattern.test(comment.text);
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&');
}
