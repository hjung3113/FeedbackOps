import * as React from 'react';
import { cn } from '../utils/cn.js';

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
  received:  '접수됨',
  reviewing: '검토 중',
  assigned:  '담당자 배정됨',
  progress:  '처리 중',
  prep:      '해결 준비 중',
  resolved:  '해결됨',
  reopened:  '다시 처리 중',
  closed:    '종료됨',
};

/**
 * Pill badge (`rounded-full`) for reporter-facing VOC status.
 * Background uses `--status-reporter-<status>` at 12 % opacity;
 * text uses the same token directly.
 */
export function ReporterStatusBadge({ status, className }: ReporterStatusBadgeProps) {
  const token = `--status-reporter-${status}`;

  return (
    <span
      className={cn('inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold', className)}
      style={{
        color:           `var(${token})`,
        backgroundColor: `color-mix(in srgb, var(${token}) 12%, transparent)`,
      }}
      data-token={token}
    >
      {LABELS[status]}
    </span>
  );
}
