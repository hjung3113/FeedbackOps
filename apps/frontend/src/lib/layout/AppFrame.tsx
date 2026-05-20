import * as React from 'react';
import { DetailPanelSlotContext, cn } from '@fops/ui';
import { AppRail } from './AppRail';
import { AppSidebar, type SidebarNavEntry } from './AppSidebar';

export interface AppFrameProps {
  sidebarEntries: SidebarNavEntry[];
  workspaceName?: string;
  /** The shell-rendered route content. AppFrame is NOT itself a shell. */
  children: React.ReactNode;
  className?: string;
}

interface SlotEntry {
  key: string;
  node: React.ReactNode;
}

/**
 * App frame for authenticated routes. Composes Rail(52) + Sidebar(240/56) + shell outlet + DetailPanelSlot(440).
 *
 * NOT a shell — does NOT live in packages/ui. The shell taxonomy is fixed at exactly three
 * (PageShell / ListShell / WorkbenchShell per ADR-0020). AppFrame composes one of those as its outlet.
 */
export function AppFrame({ sidebarEntries, workspaceName, children, className }: AppFrameProps) {
  const [slots, setSlots] = React.useState<SlotEntry[]>([]);

  const setContent = React.useCallback((key: string, node: React.ReactNode) => {
    setSlots((prev) => {
      const filtered = prev.filter((s) => s.key !== key);
      if (filtered.length > 0 && process.env.NODE_ENV !== 'production') {
        console.warn(
          `[AppFrame] DetailPanelSlot already has a registrant. New registration "${key}" overrides previous keys: ${filtered.map((s) => s.key).join(', ')}. Only one shell should forward detailPanel per route.`,
        );
      }
      return [...filtered, { key, node }];
    });
  }, []);

  const clear = React.useCallback((key: string) => {
    setSlots((prev) => prev.filter((s) => s.key !== key));
  }, []);

  const slotNode = slots[slots.length - 1]?.node;
  const slotOpen = slotNode !== undefined && slotNode !== null;

  // Memoize context value so shells' useDetailPanelSlot effect does not re-fire
  // on every AppFrame re-render. Without this, ctx reference changes each render
  // → effect re-runs → setContent → setState → re-render → infinite loop.
  const ctxValue = React.useMemo(() => ({ setContent, clear }), [setContent, clear]);

  return (
    <DetailPanelSlotContext.Provider value={ctxValue}>
      <div className={cn('flex h-screen bg-surface-canvas text-text-primary', className)} data-app-frame>
        <AppRail />
        {workspaceName !== undefined ? (
          <AppSidebar entries={sidebarEntries} workspaceName={workspaceName} />
        ) : (
          <AppSidebar entries={sidebarEntries} />
        )}
        <main className="flex-1 min-w-0 flex flex-col" data-testid="app-main">
          {children}
        </main>
        <aside
          className={cn(
            'border-l border-border-subtle bg-surface-detail overflow-y-auto transition-[width] duration-150',
            slotOpen ? '' : 'w-0',
          )}
          aria-label="Detail panel"
          data-testid="app-detail-slot"
          data-open={slotOpen ? 'true' : 'false'}
          style={
            slotOpen
              ? { width: 'var(--detail-panel-width)', minWidth: 360, maxWidth: 520 }
              : undefined
          }
        >
          {slotOpen && slotNode}
        </aside>
      </div>
    </DetailPanelSlotContext.Provider>
  );
}
