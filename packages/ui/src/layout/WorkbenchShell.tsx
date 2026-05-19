import * as React from 'react';
import { cn } from '../utils/cn';
import { ShellHeader, type ShellHeaderProps } from './ShellHeader';
import { useDetailPanelSlot } from './useDetailPanelSlot';

export interface WorkbenchShellProps {
  /** 50px toolbar. */
  toolbar?: ShellHeaderProps;
  /** Primary workbench surface (triage queue, board, builder). */
  children: React.ReactNode;
  /** Optional detail-panel intent. Forwarded to AppFrame's global slot. */
  detailPanel?: React.ReactNode;
  className?: string;
}

/**
 * WorkbenchShell — work surfaces that aren't simple lists (Triage Console, Tasks board,
 * Survey builder/result). Layout: 50px toolbar + workspace body. detailPanel forwards to AppFrame.
 */
export function WorkbenchShell({ toolbar, children, detailPanel, className }: WorkbenchShellProps) {
  useDetailPanelSlot(detailPanel);
  return (
    <div className={cn('flex flex-col flex-1 min-h-0 bg-surface-canvas', className)} data-shell="workbench">
      {toolbar && <ShellHeader {...toolbar} variant="toolbar" />}
      <div className="flex-1 min-h-0 overflow-hidden">
        {children}
      </div>
    </div>
  );
}
