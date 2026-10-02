import * as React from 'react';

// #611 — open state for the app-shell command palette. AuthedLayout provides
// the state so the Home sidebar Command row (built in features/home, above the
// AppFrame that hosts the palette itself) can open it; AppFrame mounts
// <CommandPalette />, which consumes this context. Consumers rendered without
// the provider (RouteFallback's AppFrame) get an inert palette: permanently
// closed, the toggle is a no-op.

export interface CommandPaletteContextValue {
  open: boolean;
  setOpen: (open: boolean) => void;
  toggle: () => void;
}

const noop = () => undefined;

const CommandPaletteContext = React.createContext<CommandPaletteContextValue>({
  open: false,
  setOpen: noop,
  toggle: noop,
});

export function CommandPaletteProvider({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = React.useState(false);
  const toggle = React.useCallback(() => setOpen((previous) => !previous), []);
  const value = React.useMemo(() => ({ open, setOpen, toggle }), [open, toggle]);
  return <CommandPaletteContext.Provider value={value}>{children}</CommandPaletteContext.Provider>;
}

export function useCommandPalette(): CommandPaletteContextValue {
  return React.useContext(CommandPaletteContext);
}
