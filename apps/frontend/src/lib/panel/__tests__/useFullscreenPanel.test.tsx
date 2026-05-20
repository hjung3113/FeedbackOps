import { describe, it, expect } from 'vitest';
import { renderHook, act } from '@testing-library/react';
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
