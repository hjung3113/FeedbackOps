// AnalyticsAreaPicker — dumb component (AGENTS.md:76, grill Q7 lock).
// Identical shape to ManagedSystemPicker; the AA picker is `disabled` until
// the caller picks a Managed System and pre-filters `options` accordingly.
// Pack 17 / ADR-0021: rebuilt on shadcn ToggleGroup (chip pattern, spec §3.4).

import { ToggleGroup, ToggleGroupItem } from './shadcn/toggle-group.js';
import { cn } from '../utils/cn.js';
import type { PickerOption } from './ManagedSystemPicker.js';

export interface AnalyticsAreaPickerProps {
  options: PickerOption[];
  value: string | null;
  onChange: (id: string | null) => void;
  disabled?: boolean;
  includeArchivedInLabel?: boolean;
  placeholder?: string;
  testId?: string;
  className?: string;
}

export function AnalyticsAreaPicker(props: AnalyticsAreaPickerProps) {
  const {
    options,
    value,
    onChange,
    disabled,
    includeArchivedInLabel,
    placeholder,
    testId,
    className,
  } = props;

  function handleValueChange(next: string) {
    onChange(next === '' ? null : next);
  }

  return (
    <ToggleGroup
      type="single"
      value={value ?? ''}
      onValueChange={handleValueChange}
      {...(disabled ? { disabled: true } : {})}
      variant="outline"
      size="sm"
      aria-label={placeholder ?? 'Select Analytics Area'}
      {...(disabled ? { 'aria-disabled': 'true' as const } : {})}
      data-testid={testId ?? 'analytics-area-picker'}
      className={cn('flex flex-wrap justify-start gap-2', className)}
    >
      {options.map((opt) => {
        const label =
          includeArchivedInLabel && opt.archived ? `${opt.label} (archived)` : opt.label;
        return (
          <ToggleGroupItem
            key={opt.id}
            value={opt.id}
            aria-label={label}
            className="rounded-pill border border-border-subtle px-3 data-[state=on]:bg-accent-primary data-[state=on]:text-text-inverse data-[state=on]:border-accent-primary"
          >
            {label}
          </ToggleGroupItem>
        );
      })}
    </ToggleGroup>
  );
}
