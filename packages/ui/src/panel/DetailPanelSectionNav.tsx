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
 *   .panel-section-nav-count          → px-1 py-px rounded-full bg-surface-canvas text-text-muted text-[10px] font-mono
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

  // biome-ignore lint/correctness/useExhaustiveDependencies: sectionKey rebinds when the section IDs change.
  const updateAnchorScrollMargins = React.useCallback(() => {
    const root = scrollRef?.current;
    if (!root) return;
    const stickyHeaderHeight = stickyHeaderRef.current?.getBoundingClientRect().height ?? 0;
    for (const section of sections) {
      const anchor = root.querySelector<HTMLElement>(`[data-anchor="${section.id}"]`);
      if (anchor) anchor.style.scrollMarginTop = `${stickyHeaderHeight}px`;
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

  // Observe intersections to track active section during scroll
  React.useEffect(() => {
    const root = scrollRef?.current;
    if (!root || !sections.length) return;

    const anchors = sections
      .map((s) => root.querySelector<HTMLElement>(`[data-anchor="${s.id}"]`))
      .filter((el): el is HTMLElement => el !== null);

    if (!anchors.length) return;

    if (typeof IntersectionObserver === 'undefined') {
      // Fallback: use scroll event + closest top
      const updateActiveSection = () => {
        if (programmaticRef.current) return;
        const rootRect = root.getBoundingClientRect();
        const closest = anchors
          .map((a) => ({
            id: a.getAttribute('data-anchor') ?? '',
            top: Math.abs(a.getBoundingClientRect().top - rootRect.top),
          }))
          .sort((a, b) => a.top - b.top)[0];
        if (closest?.id) setActiveSection(closest.id);
      };
      root.addEventListener('scroll', updateActiveSection, { passive: true });
      updateActiveSection();
      return () => {
        root.removeEventListener('scroll', updateActiveSection);
      };
    }

    const observer = new IntersectionObserver(
      (entries) => {
        if (programmaticRef.current) return;
        const visible = entries
          .filter((e) => e.isIntersecting)
          .map((e) => ({
            id: e.target.getAttribute('data-anchor') ?? '',
            top: e.boundingClientRect.top,
          }))
          .sort((a, b) => a.top - b.top);
        if (visible[0]?.id) setActiveSection(visible[0].id);
      },
      { root, rootMargin: '0px 0px -66% 0px', threshold: 0 },
    );
    anchors.forEach((a) => {
      observer.observe(a);
    });
    return () => {
      observer.disconnect();
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
      const stickyHeaderHeight = stickyHeaderRef.current?.getBoundingClientRect().height ?? 0;
      root.scrollTo({
        top: root.scrollTop + elRect.top - rootRect.top - stickyHeaderHeight,
        behavior: 'smooth',
      });
      setTimeout(() => {
        programmaticRef.current = false;
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
              className="pointer-events-none absolute inset-y-0 left-0 z-10 w-4 bg-linear-to-r from-surface-detail to-transparent"
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
                        'text-[10px] leading-[1.4]',
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
              className="pointer-events-none absolute inset-y-0 right-0 z-10 w-5 bg-linear-to-l from-surface-detail to-transparent"
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
              {overflowed.map((s) => (
                <DropdownMenuItem
                  key={s.id}
                  onSelect={() => {
                    scrollTo(s.id);
                  }}
                >
                  {s.label}
                  {s.count !== undefined && (
                    <span className="ml-auto px-1 rounded-full bg-surface-canvas text-text-muted font-mono text-[10px] leading-[1.4]">
                      {s.count}
                    </span>
                  )}
                </DropdownMenuItem>
              ))}
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
