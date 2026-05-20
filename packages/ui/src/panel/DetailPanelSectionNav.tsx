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
 */

import * as React from 'react';
import { cn } from '../utils/cn.js';

export interface PanelSection {
  id: string;
  label: string;
  /** Optional count badge — shown as a small pill next to the label. */
  count?: number;
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
  const programmaticRef = React.useRef(false);
  const sectionKey = sections.map((s) => s.id).join('|');

  // Reset active section when sections list changes
  React.useEffect(() => {
    setActiveSection(firstSection);
  }, [firstSection, sectionKey]);

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
      return () => { root.removeEventListener('scroll', updateActiveSection); };
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
    anchors.forEach((a) => { observer.observe(a); });
    return () => { observer.disconnect(); };
  }, [scrollRef, sectionKey]); // eslint-disable-line react-hooks/exhaustive-deps

  const scrollTo = React.useCallback(
    (id: string) => {
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
      setTimeout(() => { programmaticRef.current = false; }, 700);
    },
    [scrollRef],
  );

  if (!sections.length) return null;

  return (
    <div
      className={cn(
        // .panel-section-nav: sticky, flex, horizontal, borderBottom, overflow-x scroll, no scrollbar
        'sticky top-0 z-10 flex items-center gap-0',
        'px-6 pt-1.5 pb-0',
        'bg-surface-detail border-b border-border-subtle',
        'overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden',
        className,
      )}
    >
      {sections.map((s) => {
        const isActive = activeSection === s.id;
        return (
          <button
            key={s.id}
            type="button"
            onClick={() => { scrollTo(s.id); }}
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
  );
}

DetailPanelSectionNav.displayName = 'DetailPanelSectionNav';
