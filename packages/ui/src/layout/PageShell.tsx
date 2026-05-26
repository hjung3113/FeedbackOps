import type * as React from 'react';
import { cn } from '../utils/cn';
import { ShellHeader, type ShellHeaderProps } from './ShellHeader';
import { useDetailPanelSlot } from './useDetailPanelSlot';

export interface PageShellProps {
  /** Header content — title + optional actions. Uses ShellHeader (50px). */
  header?: ShellHeaderProps;
  /** Main body content. */
  children: React.ReactNode;
  /** Optional detail-panel intent. Forwarded to AppFrame's global slot via useDetailPanelSlot. */
  detailPanel?: React.ReactNode;
  /**
   * Full-bleed content. When false (default) the content column is centered and
   * capped at 1600px (prototype `.main-padded.constrained`); when true it spans
   * the full available width (prototype `page-shell--fluid`).
   */
  fluid?: boolean;
  className?: string;
  contentClassName?: string;
}

/**
 * PageShell — full-page content (Home, Settings, New VOC, Roadmap, Survey list).
 * Layout: 50px header + scrollable content. NO list rail. detailPanel forwards to AppFrame slot.
 *
 * The scroll region fills the available height; the inner padded column mirrors
 * the prototype's `.main-padded` (28px 32px 36px) and, when not `fluid`, caps at
 * 1600px centered so huge monitors stay readable without leaving a 1024px gutter.
 */
export function PageShell({
  header,
  children,
  detailPanel,
  fluid = false,
  className,
  contentClassName,
}: PageShellProps) {
  useDetailPanelSlot(detailPanel);
  return (
    <div
      className={cn('flex flex-col flex-1 min-h-0 bg-surface-canvas', className)}
      data-shell="page"
    >
      {header && <ShellHeader {...header} />}
      <div className="flex-1 min-h-0 overflow-y-auto">
        <div
          className={cn(
            'px-8 pt-7 pb-9',
            fluid ? 'w-full' : 'mx-auto w-full max-w-[1600px]',
            contentClassName,
          )}
        >
          {children}
        </div>
      </div>
    </div>
  );
}
