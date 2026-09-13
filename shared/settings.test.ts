import { describe, expect, it } from 'vitest';
import { DEFAULT_OVERLAY_SETTINGS, parseOverlaySettings } from './settings';

describe('parseOverlaySettings', () => {
  it('fills the fields that older apps and saved settings do not have yet', () => {
    expect(parseOverlaySettings({ showBackground: false, showProgress: true })).toEqual({
      ...DEFAULT_OVERLAY_SETTINGS,
      showBackground: false
    });
  });

  it('accepts every appearance option and normalizes colors', () => {
    const custom = {
      theme: 'neon',
      font: 'inter',
      logoAsset: '0123456789abcdef0123456789abcdef.png',
      backgroundAsset: null,
      showBackground: true,
      showProgress: false,
      accentColor: '#00FF88',
      textColor: '#101010',
      backgroundColor: '#ffffff',
      backgroundOpacity: 0,
      position: 'top',
      size: 20,
      flagAnimation: 'wave',
      targetEffect: 'confetti'
    };

    expect(parseOverlaySettings(custom)).toEqual({ ...custom, accentColor: '#00ff88' });
  });

  it.each([
    { accentColor: 'red' },
    { textColor: '#fff' },
    { backgroundColor: '#12345g' },
    { backgroundOpacity: 101 },
    { backgroundOpacity: 12.5 },
    { size: 19 },
    { size: 101 },
    { position: 'left' },
    { flagAnimation: 'spin' },
    { targetEffect: 'fireworks' },
    { showBackground: 'yes' }
  ])('rejects an invalid value: %o', (invalid) => {
    expect(parseOverlaySettings({ ...DEFAULT_OVERLAY_SETTINGS, ...invalid })).toBeNull();
  });

  it('ignores unknown fields and rejects anything but an object', () => {
    expect(parseOverlaySettings({ extra: 1 })).toEqual(DEFAULT_OVERLAY_SETTINGS);
    expect(parseOverlaySettings(null)).toBeNull();
    expect(parseOverlaySettings([])).toBeNull();
    expect(parseOverlaySettings('overlay')).toBeNull();
  });
});
