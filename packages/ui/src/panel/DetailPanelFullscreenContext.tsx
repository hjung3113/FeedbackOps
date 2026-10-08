import { Maximize2, Minimize2 } from 'lucide-react';
import { createContext, useContext } from 'react';
import type * as React from 'react';
import { cn } from '../utils/cn.js';

export interface DetailPanelFullscreenValue {
  expanded: boolean;
  toggle: () => void;
}

export const DetailPanelFullscreenContext = createContext<DetailPanelFullscreenValue | null>(null);

const iconButtonCls = cn(
  'flex items-center justify-center rounded p-1',
  'text-text-muted hover:text-text-primary hover:bg-surface-canvas',
  'focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-focus-ring',
);

export function DetailPanelReadingColumn({
  children,
  ...dataAttrs
}: React.PropsWithChildren<{ 'data-testid'?: string }>): React.ReactElement {
  const fullscreen = useContext(DetailPanelFullscreenContext);
  const expanded = fullscreen?.expanded === true;

  return (
    // Expanded drawers render as a centred reading column. The wrapper is always
    // present (`contents` when collapsed, or when there is no fullscreen context,
    // so layout is unchanged): a conditional wrapper would remount the panel on
    // toggle and drop unsaved input.
    <div
      {...dataAttrs}
      className={cn(
        expanded ? 'mx-auto h-full w-full max-w-[60rem] border-x border-border-subtle' : 'contents',
      )}
    >
      {children}
    </div>
  );
}

export function DetailPanelFullscreenToggle(): React.ReactElement | null {
  const fullscreen = useContext(DetailPanelFullscreenContext);
  if (fullscreen === null) return null;

  return (
    <button
      type="button"
      aria-label="전체 화면 전환"
      title="전체 화면 전환"
      aria-pressed={fullscreen.expanded}
      className={iconButtonCls}
      onClick={fullscreen.toggle}
    >
      {fullscreen.expanded ? (
        <Minimize2 size={16} aria-hidden="true" />
      ) : (
        <Maximize2 size={16} aria-hidden="true" />
      )}
    </button>
  );
}
