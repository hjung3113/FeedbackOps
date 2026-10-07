import { X } from 'lucide-react';
import { useContext } from 'react';
import type * as React from 'react';
import { StatusBadgeFrame } from '../badges/StatusBadgeFrame.js';
import { cn } from '../utils/cn.js';
import {
  DetailPanelFullscreenContext,
  DetailPanelFullscreenToggle,
} from './DetailPanelFullscreenContext.js';

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

type KindAccent = { token: string; bgClass: string; textClass: string };

const KIND_ACCENT = {
  voc: { token: '--color-aether-blue', bgClass: 'bg-accent-voc', textClass: 'text-accent-voc' },
  finding: {
    token: '--color-emerald',
    bgClass: 'bg-accent-success',
    textClass: 'text-accent-success',
  },
  task_request: {
    token: '--color-amber',
    bgClass: 'bg-accent-warn',
    textClass: 'text-accent-warn',
  },
  task: { token: '--color-amethyst', bgClass: 'bg-accent-task', textClass: 'text-accent-task' },
  survey: {
    token: '--color-cyan-spark',
    bgClass: 'bg-accent-info',
    textClass: 'text-accent-info',
  },
  cluster: { token: '--color-amber', bgClass: 'bg-accent-warn', textClass: 'text-accent-warn' },
  milestone: {
    token: '--color-amber',
    bgClass: 'bg-accent-warn',
    textClass: 'text-accent-warn',
  },
} satisfies Record<DetailPanelKind, KindAccent>;

export function DetailPanelHeader({
  kind,
  id,
  onClose,
  extras,
  className,
}: DetailPanelHeaderProps) {
  const isMilestone = kind === 'milestone';
  const accent = KIND_ACCENT[kind];
  const hasFullscreenToggle = useContext(DetailPanelFullscreenContext) !== null;
  const showActions = hasFullscreenToggle || onClose !== undefined;

  return (
    <div
      data-kind={kind}
      style={
        {
          // oxlint-disable-next-line shadcn/no-inline-styles -- exact 0.12 kind tint is asserted by the milestones visual spec
          '--detail-panel-kind-tint': `rgb(var(${accent.token}) / 0.12)`,
        } as React.CSSProperties
      }
      className={cn(
        'sticky top-0 z-10 bg-surface-card border-b border-border-subtle',
        'flex items-stretch h-toolbar',
        className,
      )}
    >
      {!isMilestone && <div aria-hidden="true" className={cn('w-1 shrink-0', accent.bgClass)} />}

      {/* Content row */}
      <div
        data-testid="detail-panel-header-content"
        className={cn('flex flex-1 items-center gap-3 pr-3 min-w-0', isMilestone ? 'pl-5' : 'pl-4')}
      >
        {/* Kind chip + id (id only when the caller has it) */}
        <div className={cn('flex gap-2 min-w-0', isMilestone ? 'items-center' : 'items-baseline')}>
          <StatusBadgeFrame
            appearance="compact"
            textClassName={accent.textClass}
            tintClassName="bg-(--detail-panel-kind-tint)"
            className="leading-none tracking-kind-label"
            indicator={
              <span
                aria-hidden="true"
                className={cn('h-1.5 w-1.5 shrink-0 rounded-(--radius-pill)', accent.bgClass)}
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

        {showActions && (
          <div className={cn('flex items-center gap-1', extras === undefined && 'ml-auto')}>
            <DetailPanelFullscreenToggle />
            {onClose && (
              <button
                type="button"
                onClick={onClose}
                aria-label="패널 닫기"
                className={cn(
                  'flex items-center justify-center rounded p-1',
                  'text-text-muted hover:text-text-primary hover:bg-surface-canvas',
                  'focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-focus-ring',
                )}
              >
                <X size={16} />
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
