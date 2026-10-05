import { X } from 'lucide-react';
import type * as React from 'react';
import { StatusBadgeFrame } from '../badges/StatusBadgeFrame.js';
import { cn } from '../utils/cn.js';

// Labels and accents follow DETAIL_PANEL_KINDS in docs/design-prototype/panel.jsx.
export type DetailPanelKind =
  | 'voc'
  | 'finding'
  | 'task_request'
  | 'task'
  | 'milestone'
  | 'survey'
  | 'cluster';

export interface DetailPanelHeaderProps {
  kind: DetailPanelKind;
  /**
   * Display id. Omit while the record is pending/denied/unavailable so the
   * header chrome (and its close action) still mounts without showing any
   * unavailable record data.
   */
  id?: string;
  onClose?: () => void;
  extras?: React.ReactNode;
  className?: string;
}

const KIND_LABELS: Record<DetailPanelKind, string> = {
  voc: 'VOC',
  finding: 'Finding',
  task_request: 'Task Request',
  task: 'Task',
  survey: 'Survey',
  cluster: 'Cluster',
  milestone: 'Milestone',
};

const KIND_ACCENT: Record<DetailPanelKind, string> = {
  voc: '--color-aether-blue',
  finding: '--color-emerald',
  task_request: '--color-amber',
  task: '--color-amethyst',
  survey: '--color-cyan-spark',
  cluster: '--color-amber',
  milestone: '--color-amber',
};

export function DetailPanelHeader({
  kind,
  id,
  onClose,
  extras,
  className,
}: DetailPanelHeaderProps) {
  const isMilestone = kind === 'milestone';
  const accentToken = KIND_ACCENT[kind];

  return (
    <div
      data-kind={kind}
      style={
        {
          // oxlint-disable-next-line shadcn/no-inline-styles -- kind accent comes from the closed kind map
          '--detail-panel-kind-accent': `rgb(var(${accentToken}) / 1)`,
          // oxlint-disable-next-line shadcn/no-inline-styles -- kind tint keeps the exact rgb alpha the milestones visual spec asserts
          '--detail-panel-kind-tint': `rgb(var(${accentToken}) / 0.12)`,
        } as React.CSSProperties
      }
      className={cn(
        'sticky top-0 z-10 bg-surface-card border-b border-border-subtle',
        'flex items-stretch h-toolbar',
        className,
      )}
    >
      {!isMilestone && (
        <div aria-hidden="true" className="w-1 shrink-0 bg-(--detail-panel-kind-accent)" />
      )}

      {/* Content row */}
      <div
        data-testid="detail-panel-header-content"
        className={cn('flex flex-1 items-center gap-3 pr-3 min-w-0', isMilestone ? 'pl-5' : 'pl-4')}
      >
        {/* Kind chip + id (id only when the caller has it) */}
        <div className={cn('flex gap-2 min-w-0', isMilestone ? 'items-center' : 'items-baseline')}>
          <StatusBadgeFrame
            appearance="compact"
            textClassName="text-(--detail-panel-kind-accent)"
            tintClassName="bg-(--detail-panel-kind-tint)"
            className="leading-none tracking-kind-label"
            indicator={
              <span
                aria-hidden="true"
                className="h-1.5 w-1.5 shrink-0 rounded-(--radius-pill) bg-(--detail-panel-kind-accent)"
              />
            }
          >
            {KIND_LABELS[kind]}
          </StatusBadgeFrame>
          {id !== undefined && (
            <span className="font-mono text-xs text-text-muted leading-none">{id}</span>
          )}
        </div>

        {/* Extras slot */}
        {extras !== undefined && <div className="ml-auto flex items-center">{extras}</div>}

        {/* Close button */}
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            aria-label="패널 닫기"
            className={cn(
              'flex items-center justify-center rounded p-1',
              'text-text-muted hover:text-text-primary hover:bg-surface-canvas',
              'focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-focus-ring',
              extras === undefined && 'ml-auto',
            )}
          >
            <X size={16} />
          </button>
        )}
      </div>
    </div>
  );
}
