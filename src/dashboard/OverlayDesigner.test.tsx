// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { ComponentProps } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_OVERLAY_SETTINGS } from '../../shared/settings';
import { OverlayDesigner } from './OverlayDesigner';

const PREVIEW_URL = 'http://127.0.0.1:3847/overlay';

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

function renderDesigner(overrides: Partial<ComponentProps<typeof OverlayDesigner>> = {}) {
  const props: ComponentProps<typeof OverlayDesigner> = {
    settings: DEFAULT_OVERLAY_SETTINGS,
    previewUrl: PREVIEW_URL,
    disabled: false,
    onChange: vi.fn(),
    saveDelayMs: 300,
    ...overrides
  };
  const view = render(<OverlayDesigner {...props} />);
  return { props, view };
}

const control = (label: string) => screen.getByLabelText(label) as HTMLInputElement & HTMLSelectElement;

describe('OverlayDesigner', () => {
  it('saves colors and sliders once the streamer pauses', () => {
    vi.useFakeTimers();
    const { props } = renderDesigner();

    fireEvent.change(control('Balken & Akzent'), { target: { value: '#00ff88' } });
    fireEvent.change(control('Balken & Akzent'), { target: { value: '#00ff99' } });
    fireEvent.change(control('Größe'), { target: { value: '60' } });
    expect(props.onChange).not.toHaveBeenCalled();
    expect(screen.getByText('60 %')).toBeTruthy();

    act(() => {
      vi.advanceTimersByTime(300);
    });

    expect(props.onChange).toHaveBeenCalledTimes(1);
    expect(props.onChange).toHaveBeenCalledWith({ ...DEFAULT_OVERLAY_SETTINGS, accentColor: '#00ff99', size: 60 });
  });

  it('saves switches and choices right away', () => {
    const { props } = renderDesigner();

    fireEvent.change(control('Position'), { target: { value: 'top' } });
    fireEvent.change(control('Flagge'), { target: { value: 'bounce' } });
    fireEvent.change(control('Ziel erreicht'), { target: { value: 'confetti' } });

    expect(props.onChange).toHaveBeenLastCalledWith({
      ...DEFAULT_OVERLAY_SETTINGS,
      position: 'top',
      flagAnimation: 'bounce',
      targetEffect: 'confetti'
    });
  });

  it('saves a change that is still waiting when the designer closes', () => {
    vi.useFakeTimers();
    const { props, view } = renderDesigner();

    fireEvent.change(control('Deckkraft'), { target: { value: '35' } });
    view.unmount();

    expect(props.onChange).toHaveBeenCalledWith({ ...DEFAULT_OVERLAY_SETTINGS, backgroundOpacity: 35 });
  });

  it('restores the default look', () => {
    const { props } = renderDesigner({
      settings: { ...DEFAULT_OVERLAY_SETTINGS, size: 50, targetEffect: 'glow' }
    });

    fireEvent.click(screen.getByRole('button', { name: 'Standard wiederherstellen' }));

    expect(props.onChange).toHaveBeenCalledWith(DEFAULT_OVERLAY_SETTINGS);
    expect((screen.getByRole('button', { name: 'Standard wiederherstellen' }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('follows settings that changed elsewhere', () => {
    const { props, view } = renderDesigner();

    view.rerender(<OverlayDesigner {...props} settings={{ ...DEFAULT_OVERLAY_SETTINGS, position: 'bottom' }} />);

    expect(control('Position').value).toBe('bottom');
  });

  it('only allows the opacity while the background is shown', () => {
    renderDesigner({ settings: { ...DEFAULT_OVERLAY_SETTINGS, showBackground: false } });

    expect(control('Deckkraft').disabled).toBe(true);
  });

  it('shows a live preview of the overlay when it is available', () => {
    const { props, view } = renderDesigner();
    expect(screen.getByTitle('Vorschau des Overlays').getAttribute('src')).toBe(PREVIEW_URL);

    view.rerender(<OverlayDesigner {...props} previewUrl={null} />);
    expect(screen.queryByTitle('Vorschau des Overlays')).toBeNull();
  });
});
