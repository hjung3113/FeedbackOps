/**
 * DetailPanelSectionNav — sticky horizontal anchor-tab strip for detail/triage panels.
 *
 * Prototype ref: docs/design-prototype/components.jsx:304-387 (DetailPanelSectionNav)
 * Styles ref:   docs/design-prototype/styles.css:.panel-section-nav (lines 1499-1541)
 *
 * Token translations (PROTOTYPE-TO-PACK17.md):
 *   .panel-section-nav                → sticky top-0 z-10 flex items-center gap-0
 *                                        px-6 pt-1.5 pb-2 bg-surface-detail/95 backdrop-blur-sm
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
  const [overflowState, setOverflowState] = React.useState({
    canScrollLeft: false,
    canScrollRight: false,
  });
  const navRef = React.useRef<HTMLDivElement>(null);
  const programmaticRef = React.useRef(false);
  const sectionKey = sections.map((s) => s.id).join('|');

  // Reset active section when sections list changes
  React.useEffect(() => {
    setActiveSection(firstSection);
  }, [firstSection, sectionKey]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: Rebind when section IDs replace tab elements.
  React.useLayoutEffect(() => {
    const nav = navRef.current;
    if (!nav) return;

    const updateOverflow = () => {
      const maxScroll = nav.scrollWidth - nav.clientWidth;
      setOverflowState({
        canScrollLeft: nav.scrollLeft > 1,
        canScrollRight: maxScroll - nav.scrollLeft > 1,
      });
    };

    updateOverflow();
    nav.addEventListener('scroll', updateOverflow, { passive: true });
    window.addEventListener('resize', updateOverflow);
    const resizeObserver =
      typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(updateOverflow);
    resizeObserver?.observe(nav);
    for (const tab of nav.children) {
      resizeObserver?.observe(tab);
    }
    return () => {
      nav.removeEventListener('scroll', updateOverflow);
      window.removeEventListener('resize', updateOverflow);
      resizeObserver?.disconnect();
    };
  }, [sectionKey]);

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
      const tab = navRef.current?.querySelector<HTMLButtonElement>(`[data-section-id="${id}"]`);
      if (typeof tab?.scrollIntoView === 'function') {
        tab.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'nearest' });
      }
      const root = scrollRef?.current;
      const el = root?.querySelector<HTMLElement>(`[data-anchor="${id}"]`);
      if (!root || !el) return;
      programmaticRef.current = true;
      setActiveSection(id);
      const rootRect = root.getBoundingClientRect();
      const elRect = el.getBoundingClientRect();
      root.scrollTo({
        top: root.scrollTop + elRect.top - rootRect.top,
        behavior: 'smooth',
      });
      setTimeout(() => {
        programmaticRef.current = false;
      }, 700);
    },
    [scrollRef],
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
    <div
      className={cn(
        // .panel-section-nav: sticky, flex, horizontal, borderBottom, overflow-x scroll, no scrollbar
        'sticky top-0 z-10 flex items-center gap-0',
        'px-6 pt-1.5 pb-0',
        'bg-surface-detail border-b border-border-subtle',
        className,
      )}
    >
      {overflowState.canScrollLeft && (
        <button
          type="button"
          aria-label="Scroll tabs left"
          className="mr-1 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-border-subtle bg-surface-card text-text-secondary shadow-sm hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring"
          onClick={() => scrollTabs('left')}
        >
          <ChevronLeft className="h-3.5 w-3.5" aria-hidden="true" />
        </button>
      )}
      <div className="relative min-w-0 flex-1">
        {overflowState.canScrollLeft && (
          <span
            className="pointer-events-none absolute inset-y-0 left-0 z-10 w-4 bg-gradient-to-r from-surface-detail to-transparent"
            aria-hidden="true"
          />
        )}
        <div
          ref={navRef}
          data-testid="detail-panel-section-nav-track"
          className="flex min-w-0 items-center gap-0 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
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
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring',
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
            className="pointer-events-none absolute inset-y-0 right-0 z-10 w-5 bg-gradient-to-l from-surface-detail to-transparent"
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
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring',
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
        <button
          type="button"
          aria-label="Scroll tabs right"
          className="ml-1 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-border-subtle bg-surface-card text-text-secondary shadow-sm hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring"
          onClick={() => scrollTabs('right')}
        >
          <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />
        </button>
      )}
    </div>
  );
}

DetailPanelSectionNav.displayName = 'DetailPanelSectionNav';
