import type * as React from 'react';
import { StatusBadgeFrame } from './StatusBadgeFrame.js';

/**
 * Reporter-facing VOC status enum — mirrors `reporterFacingStatusEnumSchema`
 * from `@fops/shared/vocs/list-item`.
 */
export type ReporterFacingStatusEnum =
  | 'received'
  | 'reviewing'
  | 'assigned'
  | 'progress'
  | 'prep'
  | 'resolved'
  | 'reopened'
  | 'closed';

export interface ReporterStatusBadgeProps {
  status: ReporterFacingStatusEnum;
  className?: string;
}

/**
 * Korean labels verbatim from `ReporterStatusLabels` in
 * `docs/design-prototype/data.js`.
 */
const LABELS: Record<ReporterFacingStatusEnum, string> = {
  received: '접수됨',
  reviewing: '검토 중',
  assigned: '담당자 배정됨',
  progress: '처리 중',
  prep: '해결 준비 중',
  resolved: '해결됨',
  reopened: '다시 처리 중',
  closed: '종료됨',
};

const STATUS_CLASS: Record<ReporterFacingStatusEnum, { text: string; dot: string }> = {
  received: { text: 'text-status-reporter-received-label', dot: 'bg-status-reporter-received' },
  reviewing: { text: 'text-status-reporter-reviewing-label', dot: 'bg-status-reporter-reviewing' },
  assigned: { text: 'text-status-reporter-assigned-label', dot: 'bg-status-reporter-assigned' },
  progress: { text: 'text-status-reporter-progress-label', dot: 'bg-status-reporter-progress' },
  prep: { text: 'text-status-reporter-prep-label', dot: 'bg-status-reporter-prep' },
  resolved: { text: 'text-status-reporter-resolved-label', dot: 'bg-status-reporter-resolved' },
  reopened: { text: 'text-status-reporter-reopened-label', dot: 'bg-status-reporter-reopened' },
  closed: { text: 'text-status-reporter-closed-label', dot: 'bg-status-reporter-closed' },
};

/**
 * Pill badge (`rounded-full`) for reporter-facing VOC status.
 *
 * Visual contract (per `.review/title-reference.png`):
 *   - a soft tinted pill background — `--status-reporter-<status>` at ~18 % opacity
 *     so the pill is unambiguously a pill, not naked muted text;
 *   - a leading 6 px solid dot in the same token, so the status is scannable
 *     before reading the label;
 *   - the label text uses the same token directly.
 */
export function ReporterStatusBadge({ status, className }: ReporterStatusBadgeProps) {
  const token = `--status-reporter-${status}`;
  const statusClass = STATUS_CLASS[status];

  return (
    <StatusBadgeFrame
      appearance="reporter"
      textClassName={statusClass.text}
      tintClassName="bg-(--status-badge-tint)"
      {...(className !== undefined ? { className } : {})}
      style={{ '--status-badge-tint': `rgb(var(${token}) / 0.14)` } as React.CSSProperties}
      token={token}
      indicator={
        <span
          aria-hidden="true"
          className={`inline-block h-1.5 w-1.5 rounded-full ${statusClass.dot}`}
        />
      }
    >
      {LABELS[status]}
    </StatusBadgeFrame>
  );
}
