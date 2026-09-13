import { describe, expect, it } from 'vitest';
import { createRedFlagCounter } from '../../shared/profiles';
import { DEFAULT_OVERLAY_SETTINGS } from '../../shared/settings';
import { PROTOCOL_VERSION, parseCommand, serializeEvent } from './protocol';

const counter = createRedFlagCounter(25, { ...DEFAULT_OVERLAY_SETTINGS, showBackground: false });

describe('parseCommand', () => {
  it.each([
    ['{"type":"connect","username":"streamer"}', { type: 'connect', username: 'streamer' }],
    ['{"type":"disconnect"}', { type: 'disconnect' }],
    ['{"type":"addManualVote"}', { type: 'addManualVote' }],
    ['{"type":"addManualVote","counterId":"poll","optionId":"a"}', { type: 'addManualVote', counterId: 'poll', optionId: 'a' }],
    ['{"type":"removeManualVote"}', { type: 'removeManualVote' }],
    ['{"type":"removeManualVote","counterId":"red-flags"}', { type: 'removeManualVote', counterId: 'red-flags' }],
    ['{"type":"reset"}', { type: 'reset' }],
    ['{"type":"reset","counterId":"poll","optionId":"ignored"}', { type: 'reset', counterId: 'poll' }],
    [JSON.stringify({ type: 'configureCounters', counters: [counter] }), { type: 'configureCounters', counters: [counter] }],
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
    '{"type":"addManualVote","counterId":5}',
    '{"type":"addManualVote","optionId":"mit leerzeichen"}',
    '{"type":"reset","counterId":""}',
    '{"type":"configureCounters"}',
    '{"type":"configureCounters","counters":[]}',
    JSON.stringify({ type: 'configureCounters', counters: [{ ...counter, target: 0 }] }),
    JSON.stringify({ type: 'configureCounters', counters: [counter, counter] }),
    '{"type":"setTarget","target":25}',
    '{"type":"shutdown"}'
  ])('rejects %j', (line) => {
    expect(parseCommand(line)).toBeNull();
  });
});

describe('serializeEvent', () => {
  it('writes exactly one JSON line', () => {
    expect(
      serializeEvent({ type: 'ready', protocolVersion: PROTOCOL_VERSION, port: 1234, token: 'abc', publicOverlayUrl: null })
    ).toBe('{"type":"ready","protocolVersion":2,"port":1234,"token":"abc","publicOverlayUrl":null}\n');
  });
});
