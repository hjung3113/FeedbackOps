// ManagedSystemPicker — dumb component (AGENTS.md:76, ADR-0018 picker Q7).
// No fetch, no API import; the consuming route supplies pre-fetched options.
// Pack 17 / ADR-0021: rebuilt on shadcn ToggleGroup (chip pattern, spec §3.4).
// Dumb-prop contract preserved (PickerOption[], onChange(string|null)).

import { ToggleGroup, ToggleGroupItem } from './shadcn/toggle-group.js';
import { cn } from '../utils/cn.js';

export interface PickerOption {
  id: string;
  label: string;
  archived?: boolean;
}

export interface ManagedSystemPickerProps {
  options: PickerOption[];
  value: string | null;
  onChange: (id: string | null) => void;
  disabled?: boolean;
  /** When true, the rendered label appends ` (archived)` for archived rows. */
  includeArchivedInLabel?: boolean;
  /** Accessible name for the picker group (also used as aria-label fallback). */
  placeholder?: string;
  /** Test id propagated as `data-testid`. */
  testId?: string;
  className?: string;
}

export function ManagedSystemPicker(props: ManagedSystemPickerProps) {
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
    // Radix ToggleGroup type="single" emits '' when the active item is re-toggled.
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
      aria-label={placeholder ?? 'Select Managed System'}
      {...(disabled ? { 'aria-disabled': 'true' as const } : {})}
      data-testid={testId ?? 'managed-system-picker'}
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
