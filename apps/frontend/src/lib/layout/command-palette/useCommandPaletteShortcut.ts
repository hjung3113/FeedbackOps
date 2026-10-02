import * as React from 'react';

import { isMacPlatform } from './platform';

/**
 * Global ⌘K (macOS) / Ctrl+K (Windows, Linux) toggle for the command palette
 * (prototype app.jsx global handler, made platform-aware per issue #611).
 *
 * - `preventDefault` — browsers bind Ctrl+K to the address/search bar.
 * - Ignored while an IME composition is active (`event.isComposing`).
 * - The opposite modifier never triggers it: on macOS Ctrl+K stays free for
 *   the browser, and on Windows/Linux ⌘K is not a palette binding.
 */
export function useCommandPaletteShortcut(onToggle: () => void): void {
  const onToggleRef = React.useRef(onToggle);
  React.useEffect(() => {
    onToggleRef.current = onToggle;
  }, [onToggle]);

  React.useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (event.key.toLowerCase() !== 'k') return;
      if (event.isComposing || event.altKey) return;
      const mac = isMacPlatform();
      const modifier = mac ? event.metaKey : event.ctrlKey;
      const otherModifier = mac ? event.ctrlKey : event.metaKey;
      if (!modifier || otherModifier) return;
      event.preventDefault();
      onToggleRef.current();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);
}
