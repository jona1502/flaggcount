import { describe, expect, it } from 'vitest';
import { DEFAULT_OVERLAY_SETTINGS } from '../../shared/settings';
import { parseCommand, serializeEvent } from './protocol';

describe('parseCommand', () => {
  it.each([
    ['{"type":"connect","username":"streamer"}', { type: 'connect', username: 'streamer' }],
    ['{"type":"disconnect"}', { type: 'disconnect' }],
    ['{"type":"addManualVote"}', { type: 'addManualVote' }],
    ['{"type":"removeManualVote"}', { type: 'removeManualVote' }],
    ['{"type":"reset"}', { type: 'reset' }],
    ['{"type":"setTarget","target":25}', { type: 'setTarget', target: 25 }],
    [
      '{"type":"setOverlaySettings","overlay":{"showBackground":false,"showProgress":true,"extra":1}}',
      { type: 'setOverlaySettings', overlay: { ...DEFAULT_OVERLAY_SETTINGS, showBackground: false, showProgress: true } }
    ],
    ['{"type":"getState","extra":true}', { type: 'getState' }]
  ])('parses %s', (line, expected) => {
    expect(parseCommand(line)).toEqual(expected);
  });

  it.each([
    '',
    'not json',
    'null',
    '[]',
    '{"type":"connect"}',
    '{"type":"connect","username":5}',
    '{"type":"setTarget","target":"25"}',
    '{"type":"setOverlaySettings"}',
    '{"type":"setOverlaySettings","overlay":{"showBackground":"no","showProgress":true}}',
    '{"type":"shutdown"}'
  ])('rejects %j', (line) => {
    expect(parseCommand(line)).toBeNull();
  });
});

describe('serializeEvent', () => {
  it('writes exactly one JSON line', () => {
    expect(serializeEvent({ type: 'ready', port: 1234, token: 'abc', publicOverlayUrl: null })).toBe(
      '{"type":"ready","port":1234,"token":"abc","publicOverlayUrl":null}\n'
    );
  });
});
