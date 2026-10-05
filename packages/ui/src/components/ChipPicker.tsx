import { ManagedSystemMark } from '../badges/ManagedSystemMark.js';
import { managedSystemMarkColor, managedSystemMarkToken } from '../badges/managed-system-mark.js';
import { cn } from '../utils/cn.js';
import { ToggleGroup, ToggleGroupItem } from './shadcn/toggle-group.js';

export interface PickerOption {
  id: string;
  label: string;
  slug?: string;
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
            {isManagedSystem && (
              <ManagedSystemMark
                label={managedSystemMark(option.label)}
                color={managedSystemMarkColor(option.slug)}
                size={16}
                fontSize="var(--text-system-mark)"
                token={managedSystemMarkToken(option.slug)}
                className="font-bold leading-none text-text-on-accent"
              />
            )}
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
