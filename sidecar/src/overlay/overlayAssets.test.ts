// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_OVERLAY_SETTINGS, type OverlaySettings } from '../../../shared/settings';
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

function mountOverlay(initial: VoteSnapshot, eventsUrl?: string, overlay?: OverlaySettings): FakeEventSource {
  const page = new DOMParser().parseFromString(renderOverlayPage(initial, overlay, { eventsUrl }), 'text/html');
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

/** Mounts the overlay in a 1000×1000 page with a fixed natural size, so its placement is predictable. */
function mountSized(overlay: OverlaySettings, width: number, height: number): HTMLElement {
  const page = new DOMParser().parseFromString(renderOverlayPage(votes(12, 50), overlay), 'text/html');
  document.body.innerHTML = page.body.innerHTML;
  const root = element('overlay');
  Object.defineProperty(root, 'offsetWidth', { configurable: true, get: () => width });
  Object.defineProperty(root, 'offsetHeight', { configurable: true, get: () => height });
  vi.stubGlobal('innerWidth', 1000);
  vi.stubGlobal('innerHeight', 1000);
  vi.stubGlobal('EventSource', FakeEventSource);
  new Function(OVERLAY_SCRIPT)();
  return root;
}

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

  it('subscribes to the event stream of an online overlay', () => {
    const source = mountOverlay(votes(0, 10), '/o/abc/events');

    expect(source.url).toBe('/o/abc/events');
    expect(renderOverlayPage(votes(0, 10), undefined, { eventsUrl: '"><script>' })).not.toContain('"><script>');
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

  it('scales the overlay to fill the streaming source', () => {
    const page = new DOMParser().parseFromString(renderOverlayPage(votes(12, 50)), 'text/html');
    document.body.innerHTML = page.body.innerHTML;
    const root = element('overlay');
    let width = 400;
    Object.defineProperty(root, 'offsetWidth', { configurable: true, get: () => width });
    Object.defineProperty(root, 'offsetHeight', { configurable: true, get: () => 200 });
    vi.stubGlobal('innerWidth', 1000);
    vi.stubGlobal('innerHeight', 1000);
    vi.stubGlobal('EventSource', FakeEventSource);

    new Function(OVERLAY_SCRIPT)();
    expect(root.style.transform).toBe('translate(40px, 270px) scale(2.3)');

    width = 800;
    window.dispatchEvent(new Event('resize'));
    expect(root.style.transform).toBe('translate(40px, 385px) scale(1.15)');
  });

  it('places the overlay at the top or bottom in the chosen size', () => {
    const top = mountSized({ ...DEFAULT_OVERLAY_SETTINGS, position: 'top', size: 50 }, 400, 200);
    expect(top.style.transform).toBe('translate(250px, 40px) scale(1.25)');

    const bottom = mountSized({ ...DEFAULT_OVERLAY_SETTINGS, position: 'bottom', size: 50 }, 400, 200);
    expect(bottom.style.transform).toBe('translate(250px, 710px) scale(1.25)');
  });

  it('keeps a full-size overlay inside the source', () => {
    const root = mountSized({ ...DEFAULT_OVERLAY_SETTINGS, position: 'bottom', size: 100 }, 500, 500);

    expect(root.style.transform).toBe('translate(0px, 0px) scale(2)');
  });

  it('applies the colors and the background opacity', () => {
    const source = mountOverlay(votes(1, 4), undefined, {
      ...DEFAULT_OVERLAY_SETTINGS,
      accentColor: '#00ff88',
      textColor: '#101010',
      backgroundColor: '#ffffff',
      backgroundOpacity: 50
    });
    const root = element('overlay');
    expect(root.style.getPropertyValue('--accent')).toBe('#00ff88');
    expect(root.style.getPropertyValue('--text')).toBe('#101010');
    expect(root.style.getPropertyValue('--panel')).toBe('rgba(255, 255, 255, 0.5)');

    source.emitRaw('settings', JSON.stringify({ ...DEFAULT_OVERLAY_SETTINGS, accentColor: '#123456', backgroundOpacity: 0 }));
    expect(root.style.getPropertyValue('--accent')).toBe('#123456');
    expect(root.style.getPropertyValue('--panel')).toBe('rgba(12, 12, 16, 0)');

    source.emitRaw('settings', JSON.stringify({ ...DEFAULT_OVERLAY_SETTINGS, accentColor: 'red;background:url(x)' }));
    expect(root.style.getPropertyValue('--accent')).toBe('#123456');
  });

  it('reserves the width of the target for the count', () => {
    const source = mountOverlay(votes(3, 1000));

    expect(element('count').style.minWidth).toBe('5ch');

    source.emitVotes(votes(4, 50));
    expect(element('count').style.minWidth).toBe('2ch');
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
    const html = renderOverlayPage(votes(1, 4), { ...DEFAULT_OVERLAY_SETTINGS, showBackground: false, showProgress: false });

    expect(html).toContain('data-background="false"');
    expect(html).toContain('data-progress="false"');
    expect(html).toContain('data-accent="#e82634"');
    expect(html).toContain('data-panel-opacity="80"');
    expect(html).toContain('data-position="center" data-size="92"');
    expect(html).toContain('data-flag-animation="none" data-target-effect="none"');
  });

  it('applies overlay settings changes live', () => {
    const source = mountOverlay(votes(1, 4));
    expect(element('overlay').dataset['background']).toBe('true');

    source.emitRaw('settings', JSON.stringify({ ...DEFAULT_OVERLAY_SETTINGS, showBackground: false, showProgress: false }));

    expect(element('overlay').dataset['background']).toBe('false');
    expect(element('overlay').dataset['progress']).toBe('false');
    expect(() => source.emitRaw('settings', '{broken')).not.toThrow();
    expect(element('overlay').dataset['background']).toBe('false');
  });

  it('keeps the flag still while animations are off', () => {
    const source = mountOverlay(votes(0, 4));

    source.emitVotes(votes(1, 4));

    expect(element('flag').className).toBe('flag');
    expect(element('count').className).toBe('count');
  });

  it.each([
    ['bounce', 'vote-bounce'],
    ['pulse', 'vote-pulse']
  ] as const)('plays the %s animation on every new vote', (flagAnimation, className) => {
    const source = mountOverlay(votes(0, 4), undefined, { ...DEFAULT_OVERLAY_SETTINGS, flagAnimation });
    expect(element('flag').classList.contains(className)).toBe(false);

    source.emitVotes(votes(1, 4));

    expect(element('flag').classList.contains(className)).toBe(true);
    expect(element('count').classList.contains('vote-pop')).toBe(true);

    element('flag').dispatchEvent(new Event('animationend'));
    source.emitVotes(votes(0, 4));
    expect(element('flag').classList.contains(className)).toBe(false);
  });

  it('waves the flag continuously and switches animations live', () => {
    const source = mountOverlay(votes(0, 4), undefined, { ...DEFAULT_OVERLAY_SETTINGS, flagAnimation: 'wave' });
    expect(element('overlay').dataset['flagAnimation']).toBe('wave');

    source.emitRaw('settings', JSON.stringify({ ...DEFAULT_OVERLAY_SETTINGS, flagAnimation: 'pulse' }));
    expect(element('overlay').dataset['flagAnimation']).toBe('pulse');

    source.emitRaw('settings', JSON.stringify({ ...DEFAULT_OVERLAY_SETTINGS, flagAnimation: 'explode' }));
    expect(element('overlay').dataset['flagAnimation']).toBe('pulse');
  });

  it('bursts confetti once when the target is reached', () => {
    const source = mountOverlay(votes(3, 4), undefined, { ...DEFAULT_OVERLAY_SETTINGS, targetEffect: 'confetti' });

    source.emitVotes(votes(4, 4, true));
    expect(element('confetti').children).toHaveLength(48);

    source.emitVotes(votes(5, 4, true));
    expect(element('confetti').children).toHaveLength(48);
  });

  it('does not celebrate a target that was already reached when the page opened', () => {
    const source = mountOverlay(votes(5, 4, true), undefined, { ...DEFAULT_OVERLAY_SETTINGS, targetEffect: 'confetti' });

    source.emitVotes(votes(6, 4, true));

    expect(element('confetti').children).toHaveLength(0);
  });

  it('marks the glow effect for the stylesheet', () => {
    mountOverlay(votes(4, 4, true), undefined, { ...DEFAULT_OVERLAY_SETTINGS, targetEffect: 'glow' });

    expect(element('overlay').dataset['targetEffect']).toBe('glow');
    expect(element('confetti').children).toHaveLength(0);
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
