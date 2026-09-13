import { describe, expect, it } from 'vitest';
import {
  MAX_TRIGGER_LENGTH,
  createTriggerMatcher,
  normalizeComment,
  parseTrigger,
  triggerKey,
  type Trigger
} from './triggers';

const matches = (trigger: Trigger, comment: string): boolean => createTriggerMatcher(trigger)(normalizeComment(comment));
const emoji = (value: string): Trigger => ({ kind: 'emoji', value, match: 'contains' });
const text = (value: string, match: Trigger['match'] = 'contains'): Trigger => ({ kind: 'text', value, match });

describe('trigger matching', () => {
  it('treats emoji with and without variation selector as the same emoji', () => {
    expect(matches(emoji('🏳️'), 'Bitte 🏳')).toBe(true);
    expect(matches(emoji('🏳'), 'Bitte 🏳️')).toBe(true);
    expect(matches(emoji('🚩'), 'abc🚩def')).toBe(true);
    expect(matches(emoji('🚩'), '🏁')).toBe(false);
  });

  it('keeps other emoji modifiers exact', () => {
    expect(matches(emoji('👍🏽'), '👍')).toBe(false);
    expect(matches(emoji('👍🏽'), 'super 👍🏽')).toBe(true);
  });

  it('compares text case-insensitively and Unicode-normalized', () => {
    expect(matches(text('ja'), 'JA bitte')).toBe(true);
    expect(matches(text('ja'), 'ＪＡ')).toBe(true);
    expect(matches(text('Team Blau'), 'go   team\tblau!')).toBe(true);
  });

  it('only matches whole words in word mode', () => {
    expect(matches(text('ja', 'word'), 'ich sag ja!')).toBe(true);
    expect(matches(text('ja', 'word'), 'Ja.')).toBe(true);
    expect(matches(text('ja', 'word'), 'jahr')).toBe(false);
    expect(matches(text('für', 'word'), 'fürs team')).toBe(false);
    expect(matches(text('a+b', 'word'), 'wähle a+b jetzt')).toBe(true);
    expect(matches(text('ja', 'contains'), 'jahr')).toBe(true);
  });
});

describe('parseTrigger', () => {
  it('trims values and keeps valid triggers', () => {
    expect(parseTrigger({ kind: 'text', value: '  A ', match: 'word' })).toEqual({ kind: 'text', value: 'A', match: 'word' });
    expect(parseTrigger({ kind: 'emoji', value: '🔥', match: 'contains' })).toEqual(emoji('🔥'));
    expect(parseTrigger({ kind: 'emoji', value: '1️⃣', match: 'contains' })).toEqual(emoji('1️⃣'));
  });

  it.each([
    null,
    'ja',
    { kind: 'text', value: '', match: 'contains' },
    { kind: 'text', value: '   ', match: 'contains' },
    { kind: 'text', value: 'x'.repeat(MAX_TRIGGER_LENGTH + 1), match: 'contains' },
    { kind: 'text', value: 'ja', match: 'regex' },
    { kind: 'emoji', value: 'ja', match: 'contains' },
    { kind: 'emoji', value: '🔥 🔥', match: 'contains' },
    { kind: 'emoji', value: '🔥', match: 'word' },
    { kind: 'sticker', value: '🔥', match: 'contains' },
    { kind: 'text', value: 5, match: 'contains' }
  ])('rejects %j', (value) => {
    expect(parseTrigger(value)).toBeNull();
  });

  it('gives triggers that match the same messages the same key', () => {
    expect(triggerKey(text('JA'))).toBe(triggerKey(text(' ja ', 'word')));
    expect(triggerKey(emoji('🏳️'))).toBe(triggerKey(emoji('🏳')));
    expect(triggerKey(text('nein'))).not.toBe(triggerKey(text('ja')));
  });
});
