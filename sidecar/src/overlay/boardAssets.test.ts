// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { CounterView } from '../../../shared/overlayBoard';
import { DEFAULT_OVERLAY_SETTINGS } from '../../../shared/settings';
import { BOARD_SCRIPT, renderBoardPage, renderOverlayNotice } from './boardAssets';

type Listener = (event: { data?: string }) => void;

class FakeEventSource {
  static instances: FakeEventSource[] = [];
  private readonly listeners = new Map<string, Listener[]>();

  constructor(readonly url: string) {
    FakeEventSource.instances.push(this);
  }

  addEventListener(type: string, listener: Listener): void {
    this.listeners.set(type, [...(this.listeners.get(type) ?? []), listener]);
  }

  emit(type: string, data?: unknown): void {
    for (const listener of this.listeners.get(type) ?? []) {
      listener({ data: data === undefined ? undefined : JSON.stringify(data) });
    }
  }
}

const poll: CounterView = {
  counterId: 'teams',
  name: 'Welches Team?',
  mode: 'poll',
  options: [
    { optionId: 'red', label: 'Rot', count: 3, color: '#ff0000' },
    { optionId: 'blue', label: 'Blau', count: 1, color: '#0000ff' }
  ],
  totalCount: 4,
  target: null,
  targetReached: false,
  overlay: { ...DEFAULT_OVERLAY_SETTINGS, textColor: '#fafafa' }
};

const flags: CounterView = {
  counterId: 'red-flags',
  name: 'Rote Flaggen',
  mode: 'single',
  options: [{ optionId: 'red-flag', label: 'Rote Flagge', count: 1234, color: '#e82634' }],
  totalCount: 1234,
  target: 5000,
  targetReached: false,
  overlay: DEFAULT_OVERLAY_SETTINGS
};

function mount(counters: CounterView[], scope = 'all'): FakeEventSource {
  const page = new DOMParser().parseFromString(renderBoardPage(counters, { eventsUrl: '/overlay/all/events', scope }), 'text/html');
  document.body.innerHTML = page.body.innerHTML;
  vi.stubGlobal('EventSource', FakeEventSource);
  new Function(BOARD_SCRIPT)();
  const source = FakeEventSource.instances.at(-1);
  if (!source) throw new Error('no event stream');
  return source;
}

const texts = (selector: string): string[] => [...document.querySelectorAll(selector)].map((node) => node.textContent ?? '');

afterEach(() => {
  FakeEventSource.instances = [];
  vi.unstubAllGlobals();
  document.body.innerHTML = '';
});

describe('board overlay', () => {
  it('renders single counters and polls from the initial state', () => {
    const source = mount([flags, poll]);

    expect(source.url).toBe('/overlay/all/events');
    expect(texts('.card-title')).toEqual(['Rote Flaggen', 'Welches Team?']);
    expect(texts('.card-count')).toEqual(['1.234']);
    expect(texts('.card-target')).toEqual(['/ 5.000']);
    expect(texts('.option-count')).toEqual(['3 · 75 %', '1 · 25 %']);
    const fills = [...document.querySelectorAll<HTMLElement>('.option .bar-fill')];
    expect(fills.map((fill) => fill.style.width)).toEqual(['75%', '25%']);
    expect(document.querySelectorAll<HTMLElement>('.card')[1]?.style.getPropertyValue('--text')).toBe('#fafafa');
  });

  it('follows the event stream and shows the connection state', () => {
    const source = mount([poll], 'teams');

    source.emit('board', { status: 'ok', counters: [{ ...poll, options: [{ ...poll.options[0], count: 4 }, poll.options[1]], totalCount: 5 }] });
    expect(texts('.option-count')).toEqual(['4 · 80 %', '1 · 20 %']);

    source.emit('error');
    expect(document.getElementById('board')?.getAttribute('data-connected')).toBe('false');
    source.emit('board', { status: 'pro-required', counters: [] });
    expect(document.querySelectorAll('.card')).toHaveLength(0);
    expect(document.getElementById('board')?.getAttribute('data-connected')).toBe('true');
  });

  it('never interprets names as HTML', () => {
    mount([{ ...poll, name: '<img src=x onerror=alert(1)>', options: [{ ...poll.options[0]!, label: '<b>Rot</b>' }, poll.options[1]!] }]);

    expect(document.querySelector('img')).toBeNull();
    expect(texts('.card-title')).toEqual(['<img src=x onerror=alert(1)>']);
    expect(texts('.option-label')[0]).toBe('<b>Rot</b>');
  });

  it('shows the emoji of a single counter and the size of each scene entry', () => {
    mount([
      { ...flags, icon: '🔥', itemId: 'big', itemScale: 140 },
      { ...flags, icon: '🔥', itemId: 'small', itemScale: 60 }
    ]);

    expect(texts('.card-icon')).toEqual(['🔥', '🔥']);
    const cards = [...document.querySelectorAll<HTMLElement>('.card')];
    expect(cards.map((card) => card.style.getPropertyValue('--item-scale'))).toEqual(['1.4', '0.6']);
  });

  it('renders unsaved scenes sent by the app in preview mode, only from the app origin', () => {
    const page = new DOMParser().parseFromString(renderBoardPage([], { scope: 'preview', preview: true }), 'text/html');
    document.body.innerHTML = page.body.innerHTML;
    vi.stubGlobal('EventSource', FakeEventSource);
    new Function(BOARD_SCRIPT)();

    expect(FakeEventSource.instances).toHaveLength(0);
    window.dispatchEvent(new MessageEvent('message', { origin: 'https://evil.example', data: { type: 'audience-live-preview', counters: [flags] } }));
    expect(texts('.card-title')).toEqual([]);
    window.dispatchEvent(new MessageEvent('message', { origin: 'http://tauri.localhost', data: { type: 'audience-live-preview', counters: [flags] } }));
    expect(texts('.card-title')).toEqual(['Rote Flaggen']);
  });

  it('lines up cards of different heights along the chosen edge', () => {
    const layout = { layout: 'horizontal', gap: 24, horizontalAlign: 'center', verticalAlign: 'end', scale: 70, sizing: 'canvas' } as const;
    const page = new DOMParser().parseFromString(renderBoardPage([poll, flags], { eventsUrl: '/overlay/live/events', scope: 'live', layout }), 'text/html');
    document.body.innerHTML = page.body.innerHTML;
    vi.stubGlobal('EventSource', FakeEventSource);
    new Function(BOARD_SCRIPT)();

    expect(document.getElementById('board')?.style.alignItems).toBe('flex-end');
  });

  it('escapes notices', () => {
    expect(renderOverlayNotice('Pro <nötig>')).toContain('Pro &lt;nötig&gt;');
  });
});
