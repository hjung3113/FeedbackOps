import { useCallback, useEffect, useState } from 'react';

interface FullscreenPanelApi {
  isFullscreen: boolean;
  toggle: () => void;
  open: () => void;
  close: () => void;
}

/** Local fullscreen state for panels such as Triage; AppFrame owns slot-drawer state. */
export function useFullscreenPanel(initial = false): FullscreenPanelApi {
  const [isFullscreen, setFullscreen] = useState(initial);

  const close = useCallback(() => setFullscreen(false), []);
  const open = useCallback(() => setFullscreen(true), []);
  const toggle = useCallback(() => setFullscreen((prev) => !prev), []);

  useEffect(() => {
    if (!isFullscreen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !e.defaultPrevented) close();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isFullscreen, close]);

  return { isFullscreen, toggle, open, close };
}
