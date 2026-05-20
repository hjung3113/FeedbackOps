import * as React from 'react';
import { cn } from '../utils/cn.js';
import { SeverityIndicator, type SeverityEnum } from '../indicators/SeverityIndicator.js';

export interface SeverityBadgeProps {
  severity: SeverityEnum;
  className?: string;
}

/** Korean label per severity level. */
const LABELS: Record<SeverityEnum, string> = {
  low:      '낮음',
  medium:   '중간',
  high:     '높음',
  critical: '심각',
};

/**
 * Pill badge: SeverityIndicator prefix + Korean label.
 * Background uses `--severity-<level>` at 12 % opacity;
 * text color uses the same token directly.
 */
export function SeverityBadge({ severity, className }: SeverityBadgeProps) {
  const token = `--severity-${severity}`;

  return (
    <span
      className={cn('inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold', className)}
      style={{
        color:           `var(${token})`,
        backgroundColor: `color-mix(in srgb, var(${token}) 12%, transparent)`,
      }}
      data-token={token}
    >
      <SeverityIndicator severity={severity} />
      {LABELS[severity]}
    </span>
  );
}
