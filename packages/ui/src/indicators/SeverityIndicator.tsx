import * as React from 'react';
import { cn } from '../utils/cn.js';

export type SeverityEnum = 'low' | 'medium' | 'high' | 'critical';

export interface SeverityIndicatorProps {
  severity: SeverityEnum;
  className?: string;
}

/** Number of filled bars per severity level. */
const FILL_COUNT: Record<SeverityEnum, number> = {
  low: 1,
  medium: 2,
  high: 3,
  critical: 3,
};

/**
 * 3-bar vertical indicator. Each bar is 4 px wide × 16 px tall.
 * Filled bars use `--severity-<level>`. Dimmed bars use the same color
 * at 30% opacity. `critical` uses the same 3-bar fill as `high` but
 * the color token shifts to `--severity-critical`.
 */
export function SeverityIndicator({ severity, className }: SeverityIndicatorProps) {
  const filled = FILL_COUNT[severity];
  const tokenVar = `var(--severity-${severity})`;

  return (
    <span
      className={cn('inline-flex items-end gap-[2px]', className)}
      aria-label={severity}
      data-severity={severity}
    >
      {([0, 1, 2] as const).map((i) => {
        const isFilled = i < filled;
        return (
          <span
            key={i}
            style={{
              display: 'inline-block',
              width: 4,
              height: 16,
              borderRadius: 1,
              backgroundColor: tokenVar,
              opacity: isFilled ? 1 : 0.3,
            }}
            data-filled={isFilled ? 'true' : 'false'}
            data-token={`--severity-${severity}`}
          />
        );
      })}
    </span>
  );
}
