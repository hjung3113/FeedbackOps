import * as React from 'react';
import { X } from 'lucide-react';
import { cn } from '../utils/cn.js';

export type DetailPanelKind = 'voc' | 'finding' | 'task' | 'survey' | 'cluster';

export interface DetailPanelHeaderProps {
  kind: DetailPanelKind;
  id: string;
  onClose: () => void;
  extras?: React.ReactNode;
  className?: string;
}

const KIND_LABELS: Record<DetailPanelKind, string> = {
  voc:     'VOC',
  finding: 'Finding',
  task:    'Task',
  survey:  'Survey',
  cluster: 'Cluster',
};

const KIND_ACCENT: Record<DetailPanelKind, string> = {
  voc:     'var(--color-aether-blue)',
  finding: 'var(--color-emerald)',
  task:    'var(--color-amethyst)',
  survey:  'var(--color-cyan-spark)',
  cluster: 'var(--color-amber)',
};

export function DetailPanelHeader({
  kind,
  id,
  onClose,
  extras,
  className,
}: DetailPanelHeaderProps) {
  const accentColor = KIND_ACCENT[kind];

  return (
    <div
      data-kind={kind}
      className={cn(
        'sticky top-0 z-10 bg-surface-card border-b border-border-subtle',
        'flex items-stretch min-h-[48px]',
        className,
      )}
    >
      {/* 4px accent stripe on the left */}
      <div
        aria-hidden="true"
        style={{ width: 4, flexShrink: 0, backgroundColor: accentColor }}
      />

      {/* Content row */}
      <div className="flex flex-1 items-center gap-3 px-3 py-2 min-w-0">
        {/* Kind label + id */}
        <div className="flex items-baseline gap-2 min-w-0">
          <span className="text-xs text-text-muted shrink-0 uppercase tracking-wide">
            {KIND_LABELS[kind]}
          </span>
          <span className="font-mono text-lg text-text-primary leading-none">
            {id}
          </span>
        </div>

        {/* Extras slot */}
        {extras !== undefined && (
          <div className="ml-auto flex items-center">{extras}</div>
        )}

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
