import type * as React from 'react';
import {
  SEVERITY_LABELS,
  type SeverityEnum,
  SeverityIndicator,
} from '../indicators/SeverityIndicator.js';
import { StatusBadgeFrame } from './StatusBadgeFrame.js';

export interface SeverityBadgeProps {
  severity: SeverityEnum;
  label?: string;
  ariaLabel?: string;
  className?: string;
}

export { SEVERITY_LABELS } from '../indicators/SeverityIndicator.js';

const SEVERITY_CLASS: Record<SeverityEnum, string> = {
  low: 'text-severity-low-label',
  medium: 'text-severity-medium-label',
  high: 'text-severity-high-label',
  critical: 'text-severity-critical-label',
};

/**
 * Pill badge: SeverityIndicator prefix + Korean label.
 * Background uses `--severity-<level>` at 12 % opacity;
 * text uses the paired `--severity-<level>-label` token (#525: the tokens
 * are raw RGB triplets, e.g. `165 99 0` — `var(${token})` used directly as
 * a `color` is not a valid CSS color and silently no-ops; and the raw hue
 * fails WCAG AA 4.5:1 as text at 12% tint even once the syntax is fixed, so
 * the fix is the `-label` token, not just wrapping `token` in `rgb()`).
 */
export function SeverityBadge({ severity, label, ariaLabel, className }: SeverityBadgeProps) {
  const token = `--severity-${severity}`;
  const severityClass = SEVERITY_CLASS[severity];

  return (
    <StatusBadgeFrame
      appearance="severity"
      ariaLabel={ariaLabel ?? `심각도 ${label ?? SEVERITY_LABELS[severity]}`}
      textClassName={severityClass}
      tintClassName="bg-(--status-badge-tint)"
      {...(className !== undefined ? { className } : {})}
      token={token}
      // oxlint-disable-next-line shadcn/no-inline-styles -- tint is picked from the closed severity map and keeps the exact rgb alpha measured for #525 contrast
      style={{ '--status-badge-tint': `rgb(var(${token}) / 0.12)` } as React.CSSProperties}
      indicator={<SeverityIndicator severity={severity} decorative />}
    >
      {label ?? SEVERITY_LABELS[severity]}
    </StatusBadgeFrame>
  );
}
