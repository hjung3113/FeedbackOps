import { type SeverityEnum, SeverityIndicator } from '../indicators/SeverityIndicator.js';
import { cn } from '../utils/cn.js';

export interface SeverityBadgeProps {
  severity: SeverityEnum;
  className?: string;
}

/** Korean label per severity level. */
const LABELS: Record<SeverityEnum, string> = {
  low: '낮음',
  medium: '중간',
  high: '높음',
  critical: '심각',
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
export function SeverityBadge({ severity, className }: SeverityBadgeProps) {
  const token = `--severity-${severity}`;

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold',
        className,
      )}
      style={{
        color: `rgb(var(${token}-label) / 1)`,
        backgroundColor: `rgb(var(${token}) / 0.12)`,
      }}
      data-token={token}
    >
      <SeverityIndicator severity={severity} />
      {LABELS[severity]}
    </span>
  );
}
