// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { VoteSnapshot } from '../../../shared/voting';
import { OVERLAY_CSP, OVERLAY_SCRIPT, renderOverlayPage } from './overlayAssets';

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

  emitRaw(type: string, data?: string): void {
    for (const listener of this.listeners.get(type) ?? []) {
      listener({ data });
    }
  }

  emitVotes(votes: VoteSnapshot): void {
    this.emitRaw('votes', JSON.stringify(votes));
  }
}

const votes = (count: number, target: number, targetReached = count >= target): VoteSnapshot => ({
  count,
  target,
  roundId: 'round-1',
  targetReached
});

function mountOverlay(initial: VoteSnapshot): FakeEventSource {
  const page = new DOMParser().parseFromString(renderOverlayPage(initial), 'text/html');
  document.body.innerHTML = page.body.innerHTML;
  vi.stubGlobal('EventSource', FakeEventSource);
  new Function(OVERLAY_SCRIPT)();
  const source = FakeEventSource.instances.at(-1);
  if (!source) throw new Error('overlay did not open an event stream');
  return source;
}

const element = (id: string): HTMLElement => {
  const found = document.getElementById(id);
  if (!found) throw new Error(`#${id} missing`);
  return found;
};

afterEach(() => {
  FakeEventSource.instances = [];
  vi.unstubAllGlobals();
  document.body.innerHTML = '';
});

describe('overlay page', () => {
  it('renders the initial snapshot in German number format', () => {
    mountOverlay(votes(1234, 5000));

    expect(element('count').textContent).toBe('1.234');
    expect(element('target').textContent).toBe('5.000');
    expect(element('bar-fill').style.width).toBe('24.68%');
    expect(element('overlay').dataset['reached']).toBe('false');
  });

  it('subscribes to the vote event stream', () => {
    const source = mountOverlay(votes(0, 10));

    expect(source.url).toBe('/overlay/events');
  });

  it('updates immediately when votes change', () => {
    const source = mountOverlay(votes(0, 4));

    source.emitVotes(votes(2, 4));
    expect(element('count').textContent).toBe('2');
    expect(element('bar-fill').style.width).toBe('50%');

    source.emitVotes(votes(5, 4, true));
    expect(element('bar-fill').style.width).toBe('100%');
    expect(element('overlay').dataset['reached']).toBe('true');
  });

  it('dims the overlay while the stream is disconnected', () => {
    const source = mountOverlay(votes(1, 4));

    source.emitRaw('error');
    expect(element('overlay').dataset['connected']).toBe('false');

    source.emitRaw('open');
    expect(element('overlay').dataset['connected']).toBe('true');
  });

  it('keeps the last state when an update is malformed', () => {
    const source = mountOverlay(votes(3, 4));

    expect(() => source.emitRaw('votes', 'not json')).not.toThrow();
    expect(element('count').textContent).toBe('3');
  });

  it('renders the saved overlay settings', () => {
    const html = renderOverlayPage(votes(1, 4), { showBackground: false, showProgress: false });

    expect(html).toContain('data-background="false"');
    expect(html).toContain('data-progress="false"');
  });

  it('applies overlay settings changes live', () => {
    const source = mountOverlay(votes(1, 4));
    expect(element('overlay').dataset['background']).toBe('true');

    source.emitRaw('settings', JSON.stringify({ showBackground: false, showProgress: false }));

    expect(element('overlay').dataset['background']).toBe('false');
    expect(element('overlay').dataset['progress']).toBe('false');
    expect(() => source.emitRaw('settings', '{broken')).not.toThrow();
    expect(element('overlay').dataset['background']).toBe('false');
  });

  it('works under the strict content security policy', () => {
    const html = renderOverlayPage(votes(1, 2));

    expect(OVERLAY_CSP).toContain("script-src 'self'");
    expect(OVERLAY_CSP).toContain("style-src 'self'");
    expect(html).not.toMatch(/<script(?![^>]*\ssrc=)[^>]*>/);
    expect(html).not.toMatch(/\sstyle=/);
    expect(html).not.toMatch(/\son[a-z]+=/);
  });
});
