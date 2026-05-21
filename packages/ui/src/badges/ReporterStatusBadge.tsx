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

  return (
    <span
      className={cn(
        // Pill proportions per `.review/title-reference.png`:
        //   - px-2.5 py-1  — slightly taller pill than the 0.5 y-pad so the dot
        //     and the label both sit centred with breathing room.
        //   - gap-1.5      — 6 px between dot and label.
        'inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold',
        className,
      )}
      style={{
        // Tokens in `packages/ui/src/styles/tokens.css` are raw RGB triplets
        // (e.g. `0 169 224`), so we MUST wrap them in `rgb(... / <alpha>)`
        // to produce a valid CSS color. Using `var(--token)` directly silently
        // resolves to an invalid value and the pill renders un-tinted (#000
        // text on transparent background) — visible as "뱃지 없음" in
        // `.review/title-reference.png` review.
        color:           `rgb(var(${token}) / 1)`,
        backgroundColor: `rgb(var(${token}) / 0.14)`,
      }}
      data-token={token}
    >
      <span
        aria-hidden="true"
        className="inline-block h-1.5 w-1.5 rounded-full"
        style={{ backgroundColor: `rgb(var(${token}) / 1)` }}
      />
      {LABELS[status]}
    </span>
  );
}
