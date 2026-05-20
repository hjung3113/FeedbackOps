// reporter-status-labels.ts — Korean label map for all 8 ReporterFacingStatus values.
// Labels verbatim from docs/design-prototype/data.js ReporterStatusLabels.
//
// C4.1 (slice3 #21)

import type { ReporterFacingStatusEnum } from '@fops/shared';

/**
 * Canonical picker order from prototype:
 *   received → reviewing → assigned → progress → prep → resolved → reopened → closed
 */
export const REPORTER_FACING_STATUS_ALL: ReporterFacingStatusEnum[] = [
  'received',
  'reviewing',
  'assigned',
  'progress',
  'prep',
  'resolved',
  'reopened',
  'closed',
];

/**
 * Korean display labels verbatim from prototype data.js ReporterStatusLabels.
 * Matches the labels rendered by <ReporterStatusBadge> in @fops/ui.
 */
export const REPORTER_STATUS_LABELS: Record<ReporterFacingStatusEnum, string> = {
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
 * Returns the Korean label for a reporter-facing status.
 * Throws on unknown status to surface programming errors early.
 */
export function getReporterStatusLabel(status: ReporterFacingStatusEnum): string {
  const label = REPORTER_STATUS_LABELS[status];
  if (label === undefined) {
    throw new Error(`Unknown reporter-facing status: "${String(status)}"`);
  }
  return label;
}
