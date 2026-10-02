import * as React from 'react';

export interface HorizontalOverflowState {
  canScrollLeft: boolean;
  canScrollRight: boolean;
}

interface UseHorizontalOverflowOptions<TObserved extends HTMLElement = HTMLElement> {
  /** Changes when the viewport's direct children are replaced. */
  contentKey: string;
  observeRef?: React.RefObject<TObserved | null>;
  onResize?: () => void;
}

/** Shared horizontal edge measurement and resize observation for UI primitives. */
export function useHorizontalOverflow<
  TViewport extends HTMLElement,
  TObserved extends HTMLElement = HTMLElement,
>(
  viewportRef: React.RefObject<TViewport | null>,
  { contentKey, observeRef, onResize }: UseHorizontalOverflowOptions<TObserved>,
): HorizontalOverflowState {
  const [overflowState, setOverflowState] = React.useState<HorizontalOverflowState>({
    canScrollLeft: false,
    canScrollRight: false,
  });

  const updateOverflow = React.useCallback(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;

    const maxScroll = viewport.scrollWidth - viewport.clientWidth;
    setOverflowState({
      canScrollLeft: viewport.scrollLeft > 1,
      canScrollRight: maxScroll - viewport.scrollLeft > 1,
    });
  }, [viewportRef]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: contentKey rebinds observation when dynamic children change.
  React.useLayoutEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;

    const updateLayout = () => {
      updateOverflow();
      onResize?.();
    };

    updateLayout();
    viewport.addEventListener('scroll', updateOverflow, { passive: true });
    window.addEventListener('resize', updateLayout);

    const resizeObserver =
      typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(updateLayout);
    resizeObserver?.observe(viewport);
    const observedElement = observeRef?.current;
    if (observedElement) resizeObserver?.observe(observedElement);
    for (const child of viewport.children) {
      resizeObserver?.observe(child);
    }

    return () => {
      viewport.removeEventListener('scroll', updateOverflow);
      window.removeEventListener('resize', updateLayout);
      resizeObserver?.disconnect();
    };
  }, [contentKey, observeRef, onResize, updateOverflow, viewportRef]);

  return overflowState;
}
