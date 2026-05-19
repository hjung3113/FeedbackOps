import { createContext, useContext, useEffect, useRef } from 'react';
import type { ReactNode } from 'react';

interface DetailPanelSlotContext {
  setContent: (key: string, node: ReactNode) => void;
  clear: (key: string) => void;
}

export const DetailPanelSlotContext = createContext<DetailPanelSlotContext | null>(null);

/**
 * Hook a shell uses to forward its `detailPanel?` prop into the AppFrame's global slot.
 * One slot, one registrant per lifetime. Calling from two shells with overlapping lifetimes
 * logs a warning (last-write wins by default; track keys to debug).
 *
 * AppFrame in apps/frontend/src/lib/layout/ provides the context. If a shell renders outside
 * AppFrame (storybook, ad-hoc tests), the hook is a no-op.
 */
export function useDetailPanelSlot(node: ReactNode | undefined): void {
  const ctx = useContext(DetailPanelSlotContext);
  const keyRef = useRef<string>(Math.random().toString(36).slice(2));
  useEffect(() => {
    if (!ctx || node === undefined) return;
    ctx.setContent(keyRef.current, node);
    return () => { ctx.clear(keyRef.current); };
  }, [ctx, node]);
}
