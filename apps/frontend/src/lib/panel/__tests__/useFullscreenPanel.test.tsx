import { act, renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { useFullscreenPanel } from '../useFullscreenPanel';

describe('useFullscreenPanel', () => {
  it('toggle flips boolean', () => {
    const { result } = renderHook(() => useFullscreenPanel());
    expect(result.current.isFullscreen).toBe(false);
    act(() => {
      result.current.toggle();
    });
    expect(result.current.isFullscreen).toBe(true);
    act(() => {
      result.current.toggle();
    });
    expect(result.current.isFullscreen).toBe(false);
  });

  it('Esc closes when open', () => {
    const { result } = renderHook(() => useFullscreenPanel(true));
    expect(result.current.isFullscreen).toBe(true);
    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    });
    expect(result.current.isFullscreen).toBe(false);
  });

  it('keeps the panel open when another Escape handler prevented the event', () => {
    const { result } = renderHook(() => useFullscreenPanel(true));
    const event = new KeyboardEvent('keydown', { key: 'Escape', cancelable: true });
    event.preventDefault();

    act(() => {
      window.dispatchEvent(event);
    });

    expect(result.current.isFullscreen).toBe(true);
  });

  it('open/close are explicit setters', () => {
    const { result } = renderHook(() => useFullscreenPanel());
    act(() => {
      result.current.open();
    });
    expect(result.current.isFullscreen).toBe(true);
    act(() => {
      result.current.close();
    });
    expect(result.current.isFullscreen).toBe(false);
  });
});
