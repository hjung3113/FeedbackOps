import { ToggleGroup, ToggleGroupItem } from './shadcn/toggle-group.js';
import { cn } from '../utils/cn.js';

export interface PickerOption {
  id: string;
  label: string;
  archived?: boolean;
}

interface ChipPickerProps {
  options: PickerOption[];
  value: string | null;
  onChange: (id: string | null) => void;
  disabled?: boolean;
  includeArchivedInLabel?: boolean;
  placeholder?: string;
  testId?: string;
  className?: string;
  /** Private appearance switch used only by the package-local wrappers. */
  variant?: 'managed-system' | 'analytics-area';
}

export function ChipPicker({
  options,
  value,
  onChange,
  disabled,
  includeArchivedInLabel,
  placeholder,
  testId,
  className,
  variant = 'analytics-area',
}: ChipPickerProps) {
  const isManagedSystem = variant === 'managed-system';

  return (
    <ToggleGroup
      type="single"
      value={value ?? ''}
      onValueChange={(next) => onChange(next === '' ? null : next)}
      {...(disabled ? { disabled: true } : {})}
      variant="outline"
      size="sm"
      aria-label={placeholder}
      {...(disabled ? { 'aria-disabled': 'true' as const } : {})}
      data-testid={testId}
      className={cn('flex flex-wrap justify-start gap-2', className)}
    >
      {options.map((option) => {
        const label = includeArchivedInLabel && option.archived
          ? `${option.label} (archived)`
          : option.label;

        return (
          <ToggleGroupItem
            key={option.id}
            value={option.id}
            aria-label={label}
            className={isManagedSystem
              ? 'gap-2 rounded-md border border-border-subtle bg-surface-canvas px-2.5 text-text-secondary shadow-subtle hover:bg-surface-row-hover data-[state=on]:border-border-selected data-[state=on]:bg-surface-row-selected data-[state=on]:text-text-primary'
              : 'rounded-pill border border-border-subtle px-3 data-[state=on]:bg-accent-primary data-[state=on]:text-text-inverse data-[state=on]:border-accent-primary'}
          >
            {isManagedSystem && <ManagedSystemMark label={option.label} />}
            {label}
          </ToggleGroupItem>
        );
      })}
    </ToggleGroup>
  );
}

function ManagedSystemMark({ label }: { label: string }) {
  const mark = managedSystemMark(label);
  const colorToken = managedSystemColorToken(label);

  return (
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
