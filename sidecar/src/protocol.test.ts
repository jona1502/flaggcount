import { describe, expect, it } from 'vitest';
import { parseCommand, serializeEvent } from './protocol';

describe('parseCommand', () => {
  it('parses a connect command', () => {
    expect(parseCommand('{"type":"connect","username":"streamer"}')).toEqual({
      type: 'connect',
      username: 'streamer'
    });
  });

  it('parses a disconnect command', () => {
    expect(parseCommand('{"type":"disconnect"}')).toEqual({ type: 'disconnect' });
  });

  it.each([
    '',
    'not json',
    'null',
    '[]',
    '{"type":"connect"}',
    '{"type":"connect","username":5}',
    '{"type":"shutdown"}'
  ])('rejects %j', (line) => {
    expect(parseCommand(line)).toBeNull();
  });
});

describe('serializeEvent', () => {
  it('writes exactly one JSON line', () => {
    expect(serializeEvent({ type: 'ready' })).toBe('{"type":"ready"}\n');
  });
});
