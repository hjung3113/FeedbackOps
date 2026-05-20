/**
 * SeverityPicker — 4-chip grid for severity selection.
 *
 * Prototype ref: screen-voc-create.jsx:444-464
 * Token translations (PROTOTYPE-TO-PACK17.md §3.12):
 *   .severity-grid → grid grid-cols-2 gap-2
 *   .severity-pick → grid [grid-template-columns:4px_1fr_auto] gap-2.5 px-3 py-2 rounded-md bg-surface-canvas shadow-subtle
 *   .severity-pick-bar → w-1 h-full rounded-full
 *   .severity-pick-label → text-[13px] font-semibold capitalize text-text-primary
 *   active state → bg-severity-{level}/10 ring-1 ring-inset ring-severity-{level}/40
 *   .severity-pick-meta → text-xs text-text-muted leading-[1.45]
 *
 * Spec decision D-2.1 (PLAN-21): SeverityPicker uses 4 chip-buttons, not ToggleGroup,
 * because the prototype explicitly renders <button> with a color bar + label + tooltip
 * — a richer layout than ToggleGroupItem supports.
 */

import * as React from 'react';
import { cn } from '@fops/ui';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@fops/ui';

export type SeverityLevel = 'low' | 'medium' | 'high' | 'critical';

export interface SeverityPickerProps {
  value: SeverityLevel | null;
  onChange: (severity: SeverityLevel) => void;
  disabled?: boolean;
}

const SEVERITY_CONFIG: {
  level: SeverityLevel;
  tip: string;
}[] = [
  { level: 'low',      tip: '관찰만 · 운영 영향 없음' },
  { level: 'medium',   tip: '주기적 발생 · 사용성 저하' },
  { level: 'high',     tip: '주요 흐름 차단 · 빠른 대응 필요' },
  { level: 'critical', tip: '서비스 영향 · 즉시 대응' },
];

// Severity bar colors — maps to Pack 17 semantic tokens
// PROTOTYPE-TO-PACK17.md §1: severity-{level} via bg-severity-{level}
const BAR_CLASS: Record<SeverityLevel, string> = {
  low:      'bg-severity-low',
  medium:   'bg-severity-medium',
  high:     'bg-severity-high',
  critical: 'bg-severity-critical',
};

// Active chip tinted background + inset ring
const ACTIVE_CLASS: Record<SeverityLevel, string> = {
  low:      'bg-severity-low/10 ring-1 ring-inset ring-severity-low/40',
  medium:   'bg-severity-medium/10 ring-1 ring-inset ring-severity-medium/40',
  high:     'bg-severity-high/10 ring-1 ring-inset ring-severity-high/40',
  critical: 'bg-severity-critical/10 ring-1 ring-inset ring-severity-critical/40',
};

const ACTIVE_LABEL_CLASS: Record<SeverityLevel, string> = {
  low:      'text-severity-low',
  medium:   'text-severity-medium',
  high:     'text-severity-high',
  critical: 'text-severity-critical',
};

export function SeverityPicker({
  value,
  onChange,
  disabled = false,
}: SeverityPickerProps): React.ReactElement {
  return (
    <TooltipProvider delayDuration={400}>
      {/* .severity-grid: grid grid-cols-2 gap-2 */}
      <div className="grid grid-cols-2 gap-2">
        {SEVERITY_CONFIG.map(({ level, tip }) => {
          const isActive = value === level;

          return (
            <Tooltip key={level}>
              <TooltipTrigger asChild>
                {/* .severity-pick */}
                <button
                  type="button"
                  aria-label={level}
                  aria-pressed={isActive}
                  data-active={isActive ? 'true' : 'false'}
                  data-sev={level}
                  disabled={disabled}
                  onClick={() => { onChange(level); }}
                  className={cn(
                    'grid items-center gap-2.5 px-3 py-2 rounded-md bg-surface-canvas shadow-subtle text-left',
                    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring',
                    'disabled:opacity-40 disabled:pointer-events-none',
                    isActive && ACTIVE_CLASS[level],
                  )}
                  style={{ gridTemplateColumns: '4px 1fr' }}
                >
                  {/* .severity-pick-bar */}
                  <span className={cn('w-1 self-stretch rounded-full shrink-0', BAR_CLASS[level])} />

                  {/* label column */}
                  <span className="flex flex-col min-w-0">
                    {/* .severity-pick-label */}
                    <span className={cn(
                      'text-[13px] font-semibold capitalize leading-none mb-[3px]',
                      isActive ? ACTIVE_LABEL_CLASS[level] : 'text-text-primary',
                    )}>
                      {level}
                    </span>
                    {/* .severity-pick-meta */}
                    <span className="text-xs text-text-muted leading-[1.45]">{tip}</span>
                  </span>
                </button>
              </TooltipTrigger>
              <TooltipContent side="bottom" className="text-xs">
                {tip}
              </TooltipContent>
            </Tooltip>
          );
        })}
      </div>
    </TooltipProvider>
  );
}

SeverityPicker.displayName = 'SeverityPicker';
