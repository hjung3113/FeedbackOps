import { X } from 'lucide-react';
import type * as React from 'react';
import { cn } from '../utils/cn.js';

// 'milestone' (#514 B2d): label and amber accent match DETAIL_PANEL_KINDS in
// docs/design-prototype/panel.jsx.
export type DetailPanelKind = 'voc' | 'finding' | 'task' | 'survey' | 'cluster' | 'milestone';

export interface DetailPanelHeaderProps {
  kind: DetailPanelKind;
  /**
   * Display id. Omit while the record is pending/denied/unavailable so the
   * header chrome (and its close action) still mounts without showing any
   * unavailable record data.
   */
  id?: string;
  onClose: () => void;
  extras?: React.ReactNode;
  className?: string;
}

const KIND_LABELS: Record<DetailPanelKind, string> = {
  voc: 'VOC',
  finding: 'Finding',
  task: 'Task',
  survey: 'Survey',
  cluster: 'Cluster',
  milestone: 'Milestone',
};

const KIND_ACCENT: Record<DetailPanelKind, string> = {
  voc: 'var(--color-aether-blue)',
  finding: 'var(--color-emerald)',
  task: 'var(--color-amethyst)',
  survey: 'var(--color-cyan-spark)',
  cluster: 'var(--color-amber)',
  milestone: 'var(--color-amber)',
};

export function DetailPanelHeader({
  kind,
  id,
  onClose,
  extras,
  className,
}: DetailPanelHeaderProps) {
  const isMilestone = kind === 'milestone';
  const accentColor = KIND_ACCENT[kind];

  return (
    <div
      data-kind={kind}
      className={cn(
        'sticky top-0 z-10 bg-surface-card border-b border-border-subtle',
        'flex items-stretch h-[50px]',
        className,
      )}
    >
      {!isMilestone && (
        <div aria-hidden="true" style={{ width: 4, flexShrink: 0, backgroundColor: accentColor }} />
      )}

      {/* Content row */}
      <div
        data-testid="detail-panel-header-content"
        className={cn('flex flex-1 items-center gap-3 pr-3 min-w-0', isMilestone ? 'pl-5' : 'pl-4')}
      >
        {/* Kind label + id (id only when the caller has it) */}
        <div className={cn('flex gap-2 min-w-0', isMilestone ? 'items-center' : 'items-baseline')}>
          {isMilestone ? (
            <span
              className="inline-flex h-5 shrink-0 items-center gap-1 rounded px-1.5 text-[11px] font-medium leading-none tracking-[0.01em]"
              style={{
                color: 'rgb(var(--color-amber))',
                backgroundColor: 'rgb(var(--color-amber) / 12%)',
              }}
            >
              <span
                aria-hidden="true"
                className="h-1.5 w-1.5 shrink-0 rounded-full"
                style={{ backgroundColor: 'rgb(var(--color-amber))' }}
              />
              {KIND_LABELS[kind]}
            </span>
          ) : (
            <span className="text-xs text-text-muted shrink-0 uppercase tracking-wide">
              {KIND_LABELS[kind]}
            </span>
          )}
          {id !== undefined && (
            <span className="font-mono text-xs text-text-muted leading-none">{id}</span>
          )}
        </div>

        {/* Extras slot */}
        {extras !== undefined && <div className="ml-auto flex items-center">{extras}</div>}

        {/* Close button */}
        <button
          type="button"
          onClick={onClose}
          aria-label="패널 닫기"
          className={cn(
            'flex items-center justify-center rounded p-1',
            'text-text-muted hover:text-text-primary hover:bg-surface-canvas',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
            extras === undefined && 'ml-auto',
          )}
        >
          <X size={16} />
        </button>
      </div>
    </div>
  );
}
