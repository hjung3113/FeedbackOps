import * as React from 'react';
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
  className?: string;
  contentClassName?: string;
}

/**
 * PageShell — full-page content (Home, Settings, New VOC, Roadmap, Survey list).
 * Layout: 50px header + scrollable content. NO list rail. detailPanel forwards to AppFrame slot.
 */
export function PageShell({ header, children, detailPanel, className, contentClassName }: PageShellProps) {
  useDetailPanelSlot(detailPanel);
  return (
    <div className={cn('flex flex-col flex-1 min-h-0 bg-surface-canvas', className)} data-shell="page">
      {header && <ShellHeader {...header} />}
      <div className={cn('flex-1 min-h-0 overflow-y-auto', contentClassName)}>
        {children}
      </div>
    </div>
  );
}
