import { cn } from '../utils/cn.js';

export type SeverityEnum = 'low' | 'medium' | 'high' | 'critical';

export interface SeverityIndicatorProps {
  severity: SeverityEnum | null;
  label?: string;
  decorative?: boolean;
  className?: string;
}

/** Korean label per severity level. */
export const SEVERITY_LABELS: Record<SeverityEnum, string> = {
  low: '낮음',
  medium: '중간',
  high: '높음',
  critical: '심각',
};

/** Number of filled bars per severity level. */
const FILL_COUNT: Record<SeverityEnum, number> = {
  low: 1,
  medium: 2,
  high: 3,
  critical: 3,
};

const SEVERITY_BAR_CLASS: Record<SeverityEnum, string> = {
  low: 'bg-severity-low',
  medium: 'bg-severity-medium',
  high: 'bg-severity-high',
  critical: 'bg-severity-critical',
};

/**
 * 3-bar vertical indicator. Each bar is 4 px wide × 16 px tall.
 * Filled bars use `--severity-<level>`. Dimmed bars use the same color
 * at 30% opacity. `critical` uses the same 3-bar fill as `high` but
 * the color token shifts to `--severity-critical`.
 */
export function SeverityIndicator({
  severity,
  className,
  label,
  decorative = false,
}: SeverityIndicatorProps) {
  const filled = severity === null ? 0 : FILL_COUNT[severity];
  return (
    <span
      className={cn('inline-flex items-end gap-0.5', className)}
      role={decorative ? undefined : 'img'}
      aria-hidden={decorative || undefined}
      aria-label={
        decorative
          ? undefined
          : (label ?? `심각도 ${severity === null ? '미지정' : SEVERITY_LABELS[severity]}`)
      }
      data-severity={severity ?? 'unset'}
    >
      {([0, 1, 2] as const).map((i) => {
        const isFilled = i < filled;
        return (
          <span
            key={i}
            className={cn(
              'inline-block h-4 w-1',
              // oxlint-disable-next-line shadcn/no-arbitrary-values -- the three-bar severity indicator uses a one-pixel corner radius
              'rounded-[1px]',
              severity === null ? 'bg-border-strong' : SEVERITY_BAR_CLASS[severity],
              isFilled ? 'opacity-100' : 'opacity-30',
            )}
            data-filled={isFilled ? 'true' : 'false'}
            data-token={severity === null ? undefined : `--severity-${severity}`}
          />
        );
      })}
    </span>
  );
}
