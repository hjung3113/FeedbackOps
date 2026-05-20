import * as React from 'react';
import { cn } from '../utils/cn';
import { ShellHeader, type ShellHeaderProps } from './ShellHeader';
import { useDetailPanelSlot } from './useDetailPanelSlot';

export interface ListShellProps {
  /** Toolbar (filter + sort + search). 50px ShellHeader variant="toolbar". */
  toolbar?: ShellHeaderProps;
  /** List rows. ListShell does NOT scroll itself — give the list its own overflow. */
  list: React.ReactNode;
  /** Optional tabs row below the toolbar (Inbox: untriaged/high/unassigned/…). */
  tabs?: React.ReactNode;
  /** Optional detail-panel intent. Forwarded to AppFrame's global slot. */
  detailPanel?: React.ReactNode;
  className?: string;
}

/**
 * ListShell — filter+list+detail routes (VOC inbox/my, Tasks, Findings, Evidence, Entity Links).
 * Layout: 50px toolbar + optional tabs + main list. detailPanel forwards to AppFrame slot.
 */
export function ListShell({ toolbar, list, tabs, detailPanel, className }: ListShellProps) {
  useDetailPanelSlot(detailPanel);
  return (
    <div className={cn('flex flex-col flex-1 min-h-0 bg-surface-list', className)} data-shell="list">
      {toolbar && <ShellHeader {...toolbar} variant="toolbar" />}
      {tabs && <div className="border-b border-border-subtle px-4 py-2 bg-surface-canvas">{tabs}</div>}
      <div className="flex-1 min-h-0 overflow-y-auto">
        {list}
      </div>
    </div>
  );
}
