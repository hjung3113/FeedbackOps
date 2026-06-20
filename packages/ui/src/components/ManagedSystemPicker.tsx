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
        const mark = managedSystemMark(opt.label);
        const colorToken = managedSystemColorToken(opt.label);
        return (
          <ToggleGroupItem
            key={opt.id}
            value={opt.id}
            aria-label={label}
            className="gap-2 rounded-md border border-border-subtle bg-surface-canvas px-2.5 text-text-secondary shadow-subtle hover:bg-surface-row-hover data-[state=on]:border-border-selected data-[state=on]:bg-surface-row-selected data-[state=on]:text-text-primary"
          >
            <span
              aria-hidden="true"
              className="grid h-4 w-4 shrink-0 place-items-center rounded-sm font-bold leading-none text-text-on-accent"
              data-token={colorToken}
              style={{
                backgroundColor: `rgb(var(${colorToken}))`,
                fontSize: 'var(--text-system-mark)',
              }}
            >
              {mark}
            </span>
            {label}
          </ToggleGroupItem>
        );
      })}
    </ToggleGroup>
  );
}

function managedSystemMark(label: string): string {
  const normalized = label.toLowerCase();
  if (normalized.includes('tableau')) return 'TB';
  if (normalized.includes('power bi') || normalized.includes('power-bi')) return 'PB';
  if (normalized.includes('looker')) return 'LK';
  if (normalized.includes('metabase')) return 'MB';

  const parts = label.match(/[A-Za-z0-9]+/g) ?? [];
  const initials = parts.length > 1
    ? parts.slice(0, 2).map((part) => part[0]).join('')
    : (parts[0] ?? label).slice(0, 2);
  return initials.toUpperCase();
}

function managedSystemColorToken(label: string): string {
  const normalized = label.toLowerCase();
  if (normalized.includes('tableau')) return '--managed-system-tableau';
  if (normalized.includes('power bi') || normalized.includes('power-bi')) return '--managed-system-power-bi';
  if (normalized.includes('looker')) return '--managed-system-looker';
  if (normalized.includes('metabase')) return '--managed-system-metabase';
  return '--managed-system-default';
}
