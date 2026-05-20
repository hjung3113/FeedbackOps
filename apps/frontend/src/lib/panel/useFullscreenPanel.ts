import { useCallback, useEffect, useState } from 'react';

interface FullscreenPanelApi {
  isFullscreen: boolean;
  toggle: () => void;
  open: () => void;
  close: () => void;
}

/**
 * Detail panel fullscreen toggle. Esc collapses. Caller is responsible for resetting on route change
 * (recommended: tie to TanStack `useMatchRoute` + useEffect).
 */
export function useFullscreenPanel(initial = false): FullscreenPanelApi {
  const [isFullscreen, setFullscreen] = useState(initial);

  const close = useCallback(() => setFullscreen(false), []);
  const open = useCallback(() => setFullscreen(true), []);
  const toggle = useCallback(() => setFullscreen((prev) => !prev), []);

  useEffect(() => {
    if (!isFullscreen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isFullscreen, close]);

  return { isFullscreen, toggle, open, close };
}
