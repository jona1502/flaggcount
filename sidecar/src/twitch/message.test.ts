import { describe, expect, it } from 'vitest';
import { normalizeFragments, toTwitchChatMessage } from './message';
import { MessageDedupe } from './dedupe';

describe('Twitch chat normalization', () => {
  it('keeps text and emote labels in their original order', () => {
    expect(normalizeFragments({ fragments: [{ type: 'text', text: 'Ja ' }, { type: 'emote', text: 'Kappa', emote: { id: '1' } }, { text: ' 🚩' }] })).toBe('Ja Kappa 🚩');
  });

  it('maps stable ids and rejects incomplete events', () => {
    expect(toTwitchChatMessage({ message_id: 'm1', chatter_user_id: 'u1', chatter_user_login: 'viewer', chatter_user_name: 'Viewer', message: { text: 'rot' } }, 5)).toEqual({ platform: 'twitch', messageId: 'm1', userId: 'u1', uniqueId: 'viewer', nickname: 'Viewer', comment: 'rot', receivedAt: 5 });
    expect(toTwitchChatMessage({ message_id: 'm1' }, 5)).toBeNull();
  });
});

describe('MessageDedupe', () => {
  it('rejects duplicates, expires entries and stays bounded', () => {
    let now = 0;
    const cache = new MessageDedupe(2, 10, () => now);
    expect(cache.accept('a')).toBe(true);
    expect(cache.accept('a')).toBe(false);
    cache.accept('b'); cache.accept('c');
    expect(cache.accept('a')).toBe(true);
    now = 20;
    expect(cache.accept('c')).toBe(true);
  });
});
