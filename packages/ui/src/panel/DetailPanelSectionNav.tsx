/**
 * DetailPanelSectionNav — sticky horizontal anchor-tab strip for detail/triage panels.
 *
 * Prototype ref: docs/design-prototype/components.jsx:304-387 (DetailPanelSectionNav)
 * Styles ref:   docs/design-prototype/styles.css:.panel-section-nav (lines 1499-1541)
 *
 * Token translations (PROTOTYPE-TO-PACK17.md):
 *   .panel-section-nav                → sticky top-0 z-10 flex items-center gap-0
 *                                        px-6 pt-1.5 pb-2 bg-surface-detail/95 backdrop-blur-xs
 *                                        border-b border-border-subtle overflow-x-auto scrollbar-none
 *   .panel-section-nav-button         → inline-flex items-center gap-1.5 px-2.5 py-1.5
 *                                        border-0 border-b-2 border-transparent bg-transparent
 *                                        text-text-muted cursor-pointer text-xs font-medium whitespace-nowrap
 *   .panel-section-nav-button:hover   → hover:text-text-secondary
 *   .panel-section-nav-button.active  → border-b-accent-primary text-text-primary
 *   .panel-section-nav-count          → px-1 py-px rounded-full bg-surface-canvas text-text-muted text-caption font-mono
 *
 * Sections flagged `overflow: true` render inside a trailing "더보기" dropdown instead of the
 * pinned strip (#519 — a deliberate deviation from the prototype, whose strip overflows a
 * 440px panel). With no flagged section the output is identical to the prototype strip.
 */

import { ChevronDown, ChevronLeft, ChevronRight } from 'lucide-react';
import * as React from 'react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '../components/shadcn/dropdown-menu.js';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '../components/shadcn/tooltip.js';
import { useHorizontalOverflow } from '../internal/useHorizontalOverflow.js';
import { cn } from '../utils/cn.js';

export interface PanelSection {
  id: string;
  label: string;
  /** Optional count badge — shown as a small pill next to the label. */
  count?: number;
  /** Render this section in the overflow menu instead of the pinned navigation. */
  overflow?: boolean;
}

export interface DetailPanelSectionNavProps {
  sections: PanelSection[];
  /** Ref to the scrollable container that holds the anchored sections. */
  scrollRef?: React.RefObject<HTMLElement | null>;
  className?: string;
}

/** Bottom rootMargin fraction. Percentage margins resolve against root width, not height. */
const OBSERVER_BOTTOM_MARGIN = 0.66;
const OBSERVER_ROOT_MARGIN = '0px 0px -66% 0px';

function anchorId(anchor: Element): string {
  return anchor.getAttribute('data-anchor') ?? '';
}

/** Topmost candidate by its current viewport top. Empty when none qualify. */
function topmostAnchor(
  anchors: readonly HTMLElement[],
  isCandidate: (anchor: HTMLElement) => boolean,
): string {
  let bestId = '';
  let bestTop = Number.POSITIVE_INFINITY;
  for (const anchor of anchors) {
    if (!isCandidate(anchor)) continue;
    const top = anchor.getBoundingClientRect().top;
    if (top < bestTop) {
      bestTop = top;
      bestId = anchorId(anchor);
    }
  }
  return bestId;
}

function inObserverTopBand(anchor: HTMLElement, rootRect: DOMRect): boolean {
  // Intersection Observer resolves a percentage rootMargin against the root's width,
  // so `-66%` ends the band at rootBottom - 0.66 * width, not 34% of the height.
  // Floor at rootTop so a short, wide root cannot push the band above the root.
  const bandBottom = Math.max(
    rootRect.top,
    rootRect.bottom - OBSERVER_BOTTOM_MARGIN * rootRect.width,
  );
  const box = anchor.getBoundingClientRect();
  return box.bottom > rootRect.top && box.top < bandBottom;
}

/** Inside the scroll root the whole strip covers content; outside, only the overlap does. */
function stickyCover(root: HTMLElement, header: HTMLElement | null): number {
  if (!header) return 0;
  const headerRect = header.getBoundingClientRect();
  if (root.contains(header)) return headerRect.height;
  return Math.max(0, headerRect.bottom - root.getBoundingClientRect().top);
}

export function DetailPanelSectionNav({
  sections,
  scrollRef,
  className,
}: DetailPanelSectionNavProps): React.ReactElement | null {
  const firstSection = sections[0]?.id ?? '';
  const [activeSection, setActiveSection] = React.useState(firstSection);
  const navRef = React.useRef<HTMLDivElement>(null);
  const stickyHeaderRef = React.useRef<HTMLDivElement>(null);
  const programmaticRef = React.useRef(false);
  const recomputeOnNextScrollRef = React.useRef(false);
  const jumpTimeoutRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const sectionKey = sections.map((s) => s.id).join('|');
  const activeSectionRef = React.useRef(activeSection);
  activeSectionRef.current = activeSection;

  const revealSection = React.useCallback((id: string) => {
    const nav = navRef.current;
    const tab = nav?.querySelector<HTMLButtonElement>(`[data-section-id="${id}"]`);
    if (!nav || !tab) return;

    const navRect = nav.getBoundingClientRect();
    const tabRect = tab.getBoundingClientRect();
    const left =
      tabRect.left < navRect.left
        ? tabRect.left - navRect.left
        : tabRect.right > navRect.right
          ? tabRect.right - navRect.right
          : 0;
    if (left !== 0) nav.scrollBy({ left, behavior: 'smooth' });
  }, []);

  // Reset active section when sections list changes
  React.useEffect(() => {
    setActiveSection(firstSection);
  }, [firstSection, sectionKey]);

  React.useEffect(() => {
    return () => {
      if (jumpTimeoutRef.current !== null) clearTimeout(jumpTimeoutRef.current);
    };
  }, []);

  const updateAnchorScrollMargins = React.useCallback(() => {
    const root = scrollRef?.current;
    if (!root) return;
    const cover = stickyCover(root, stickyHeaderRef.current);
    for (const section of sections) {
      const anchor = root.querySelector<HTMLElement>(`[data-anchor="${section.id}"]`);
      if (anchor) anchor.style.scrollMarginTop = `${cover}px`;
    }
  }, [scrollRef, sectionKey]);

  React.useEffect(() => {
    updateAnchorScrollMargins();
  }, [updateAnchorScrollMargins]);

  const updateNavigationLayout = React.useCallback(() => {
    updateAnchorScrollMargins();
    revealSection(activeSectionRef.current);
  }, [revealSection, updateAnchorScrollMargins]);
  const overflowState = useHorizontalOverflow(navRef, {
    contentKey: sectionKey,
    observeRef: stickyHeaderRef,
    onResize: updateNavigationLayout,
  });

  React.useLayoutEffect(() => {
    revealSection(activeSection);
  }, [activeSection, revealSection]);

  // Observe intersections to track active section during scroll.
  React.useEffect(() => {
    const root = scrollRef?.current;
    if (!root || !sections.length) return;

    const anchors = sections
      .map((s) => root.querySelector<HTMLElement>(`[data-anchor="${s.id}"]`))
      .filter((el): el is HTMLElement => el !== null);

    if (!anchors.length) return;

    if (typeof IntersectionObserver === 'undefined') {
      // Same ranking as the observer: topmost anchor inside the top band, not nearest top.
      const updateActiveSection = () => {
        if (programmaticRef.current) return;
        const rootRect = root.getBoundingClientRect();
        const id = topmostAnchor(anchors, (anchor) => inObserverTopBand(anchor, rootRect));
        if (id) setActiveSection(id);
      };
      root.addEventListener('scroll', updateActiveSection, { passive: true });
      updateActiveSection();
      return () => {
        root.removeEventListener('scroll', updateActiveSection);
      };
    }

    // #861: entries only carry the anchors whose intersection changed, so every entry updates the
    // map — even inside a programmatic jump, whose guard suppresses only the selection. The map
    // holds flags only; the winner is ranked by each anchor's current box, read at selection time.
    // Declared here so a rebuilt observer (scrollRef/sectionKey change) starts from a clean map.
    const intersectionState = new Map<string, boolean>();
    const selectTopmostIntersecting = () => {
      const id = topmostAnchor(
        anchors,
        (anchor) => intersectionState.get(anchorId(anchor)) === true,
      );
      if (id) setActiveSection(id);
    };
    const observer = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          intersectionState.set(anchorId(e.target), e.isIntersecting);
        }
        if (programmaticRef.current) return;
        selectTopmostIntersecting();
      },
      { root, rootMargin: OBSERVER_ROOT_MARGIN, threshold: 0 },
    );
    // #876: do not recompute when the jump guard ends — that would drop a just-clicked lower
    // section. The next user scroll ranks the anchors that are intersecting now.
    const recomputeAfterJump = () => {
      if (programmaticRef.current || !recomputeOnNextScrollRef.current) return;
      recomputeOnNextScrollRef.current = false;
      selectTopmostIntersecting();
    };
    for (const anchor of anchors) observer.observe(anchor);
    root.addEventListener('scroll', recomputeAfterJump, { passive: true });
    return () => {
      observer.disconnect();
      root.removeEventListener('scroll', recomputeAfterJump);
    };
  }, [scrollRef, sectionKey]); // eslint-disable-line react-hooks/exhaustive-deps

  const scrollTo = React.useCallback(
    (id: string) => {
      revealSection(id);
      const root = scrollRef?.current;
      const el = root?.querySelector<HTMLElement>(`[data-anchor="${id}"]`);
      if (!root || !el) return;
      programmaticRef.current = true;
      setActiveSection(id);
      const rootRect = root.getBoundingClientRect();
      const elRect = el.getBoundingClientRect();
      const cover = stickyCover(root, stickyHeaderRef.current);
      root.scrollTo({
        top: root.scrollTop + elRect.top - rootRect.top - cover,
        behavior: 'smooth',
      });
      if (jumpTimeoutRef.current !== null) clearTimeout(jumpTimeoutRef.current);
      jumpTimeoutRef.current = setTimeout(() => {
        jumpTimeoutRef.current = null;
        programmaticRef.current = false;
        recomputeOnNextScrollRef.current = true;
      }, 700);
    },
    [revealSection, scrollRef],
  );

  if (!sections.length) return null;

  const pinned = sections.filter((s) => !s.overflow);
  const overflowed = sections.filter((s) => s.overflow);
  const scrollTabs = (direction: 'left' | 'right') => {
    const nav = navRef.current;
    if (!nav) return;
    nav.scrollBy({
      left:
        direction === 'right'
          ? Math.max(nav.clientWidth * 0.75, 120)
          : -Math.max(nav.clientWidth * 0.75, 120),
      behavior: 'smooth',
    });
  };

  return (
    <TooltipProvider delayDuration={400}>
      <div
        ref={stickyHeaderRef}
        className={cn(
          // .panel-section-nav: sticky, flex, horizontal, borderBottom, overflow-x scroll, no scrollbar
          'sticky top-0 z-10 flex items-center gap-0',
          'px-6 pt-1.5 pb-0',
          'bg-surface-detail border-b border-border-subtle',
          className,
        )}
      >
        {overflowState.canScrollLeft && (
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                aria-label="이전 탭 보기"
                className="mr-1 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-border-subtle bg-surface-card text-text-secondary shadow-sm hover:text-text-primary focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-focus-ring"
                onClick={() => scrollTabs('left')}
              >
                <ChevronLeft className="h-3.5 w-3.5" aria-hidden="true" />
              </button>
            </TooltipTrigger>
            <TooltipContent side="bottom" className="text-xs">
              이전 탭 보기
            </TooltipContent>
          </Tooltip>
        )}
        <div className="relative min-w-0 flex-1">
          {overflowState.canScrollLeft && (
            <span
              className="pointer-events-none absolute inset-y-0 left-0 z-10 w-4 bg-linear-to-r/srgb from-surface-detail to-transparent"
              aria-hidden="true"
            />
          )}
          <div
            ref={navRef}
            data-testid="detail-panel-section-nav-track"
            className="flex min-w-0 items-center gap-0 overflow-x-auto scrollbar-none [&::-webkit-scrollbar]:hidden"
          >
            {pinned.map((s) => {
              const isActive = activeSection === s.id;
              return (
                <button
                  key={s.id}
                  type="button"
                  data-section-id={s.id}
                  onClick={() => {
                    scrollTo(s.id);
                  }}
                  {...(isActive ? { 'aria-current': 'true' as const } : {})}
                  className={cn(
                    // .panel-section-nav-button
                    'inline-flex items-center gap-1.5 px-2.5 py-1.5',
                    'border-0 border-b-2 bg-transparent cursor-pointer',
                    'text-xs font-medium whitespace-nowrap leading-none',
                    'focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-focus-ring',
                    isActive
                      ? 'border-accent-primary text-text-primary'
                      : 'border-transparent text-text-muted hover:text-text-secondary',
                  )}
                >
                  {s.label}
                  {s.count !== undefined && (
                    <span
                      className={cn(
                        // .panel-section-nav-count
                        'px-1 rounded-full bg-surface-canvas text-text-muted font-mono',
                        'text-caption leading-body',
                      )}
                    >
                      {s.count}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
          {overflowState.canScrollRight && (
            <span
              className="pointer-events-none absolute inset-y-0 right-0 z-10 w-5 bg-linear-to-l/srgb from-surface-detail to-transparent"
              aria-hidden="true"
            />
          )}
        </div>
        {overflowed.length > 0 && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                className={cn(
                  'inline-flex items-center gap-1.5 px-2.5 py-1.5',
                  'border-0 border-b-2 bg-transparent cursor-pointer',
                  'text-xs font-medium whitespace-nowrap leading-none',
                  'focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-focus-ring',
                  overflowed.some((s) => activeSection === s.id)
                    ? 'border-accent-primary text-text-primary'
                    : 'border-transparent text-text-muted hover:text-text-secondary',
                )}
              >
                더보기
                <ChevronDown className="h-3 w-3" aria-hidden="true" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start">
              {overflowed.map((s) => {
                const isCurrent = activeSection === s.id;
                return (
                  <DropdownMenuItem
                    key={s.id}
                    onSelect={() => {
                      scrollTo(s.id);
                    }}
                    {...(isCurrent ? { 'aria-current': 'true' as const } : {})}
                    {...(isCurrent ? { className: 'font-medium text-text-primary' } : {})}
                  >
                    {s.label}
                    {s.count !== undefined && (
                      <span className="ml-auto px-1 rounded-full bg-surface-canvas text-text-muted font-mono text-caption leading-body">
                        {s.count}
                      </span>
                    )}
                  </DropdownMenuItem>
                );
              })}
            </DropdownMenuContent>
          </DropdownMenu>
        )}
        {overflowState.canScrollRight && (
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                aria-label="다음 탭 보기"
                className="ml-1 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-border-subtle bg-surface-card text-text-secondary shadow-sm hover:text-text-primary focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-focus-ring"
                onClick={() => scrollTabs('right')}
              >
                <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />
              </button>
            </TooltipTrigger>
            <TooltipContent side="bottom" className="text-xs">
              다음 탭 보기
            </TooltipContent>
          </Tooltip>
        )}
      </div>
    </TooltipProvider>
  );
}

DetailPanelSectionNav.displayName = 'DetailPanelSectionNav';
