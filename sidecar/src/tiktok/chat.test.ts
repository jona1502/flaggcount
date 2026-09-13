import { describe, expect, it } from 'vitest';
import { toChatMessage } from './chat';

describe('toChatMessage', () => {
  it('maps a raw chat event to the internal format', () => {
    const message = toChatMessage(
      {
        common: { msgId: 'm1' },
        user: { id: '123', displayId: 'Viewer', nickname: 'Der Viewer' },
        content: 'Bitte 🚩'
      },
      1000
    );

    expect(message).toEqual({
      messageId: 'm1',
      userId: '123',
      uniqueId: 'Viewer',
      nickname: 'Der Viewer',
      comment: 'Bitte 🚩',
      receivedAt: 1000
    });
  });

  it('falls back to the handle when the numeric id is missing', () => {
    expect(toChatMessage({ user: { id: '0', displayId: 'Viewer' }, content: '🚩' }, 1)?.userId).toBe('unique:viewer');
  });

  it('defaults missing optional fields', () => {
    expect(toChatMessage({ user: { id: '5' } }, 2)).toEqual({
      messageId: '',
      userId: '5',
      uniqueId: '',
      nickname: '',
      comment: '',
      receivedAt: 2
    });
  });

  it('ignores messages without any user identity', () => {
    expect(toChatMessage({ user: undefined, content: '🚩' }, 1)).toBeNull();
    expect(toChatMessage({ user: { id: ' ', displayId: '' }, content: '🚩' }, 1)).toBeNull();
  });

  it('removes a flag that only belongs to the replied-to display name', () => {
    const message = toChatMessage(
      {
        user: { id: '1', displayId: 'viewer' },
        atUser: { id: '2', displayId: 'flag-user', nickname: 'Rudi 🚩' },
        content: '@Rudi 🚩 Hallo'
      },
      1
    );

    expect(message?.comment).toBe(' Hallo');
  });

  it('keeps a real flag written after a reply label', () => {
    const message = toChatMessage(
      {
        user: { id: '1', displayId: 'viewer' },
        atUser: { id: '2', nickname: 'Rudi 🚩' },
        content: '@Rudi 🚩 Hallo 🚩'
      },
      1
    );

    expect(message?.comment).toBe(' Hallo 🚩');
  });

  it('removes flags from every user identified by TikTok as a mention', () => {
    const message = toChatMessage(
      {
        user: { id: '1', displayId: 'viewer' },
        mentionUsers: [{ id: '2', nickname: 'Rot 🚩' }, { id: '3', nickname: 'Weiß 🏳️' }],
        content: 'Hallo @Rot 🚩 und @Weiß 🏳️'
      },
      1
    );

    expect(message?.comment).toBe('Hallo  und ');
  });

  it('does not remove an unmarked flag from the message', () => {
    const message = toChatMessage(
      {
        user: { id: '1', displayId: 'viewer' },
        atUser: { id: '2', nickname: 'Rudi' },
        content: '@Rudi 🚩'
      },
      1
    );

    expect(message?.comment).toBe(' 🚩');
  });
});
