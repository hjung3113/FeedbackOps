/**
 * Combobox — command-less pattern (ADR-0021 C1b).
 *
 * Uses Popover + a native <input> for search + a filtered listbox.
 * Does NOT use cmdk / @radix-ui/react-command. cmdk is installed on the
 * tree for future CommandMenu (C3 wiring), but is NOT consumed here.
 *
 * Prop contract:
 *   options   — array of { value: string; label: string } items
 *   value     — currently selected value (string | null)
 *   onChange  — called with the newly selected value string
 *   placeholder — trigger placeholder text (optional, default "Select…")
 *   searchPlaceholder — search input placeholder (optional, default "Search…")
 *   className — forwarded to the trigger button
 */
import * as React from 'react';
import { Check, ChevronsUpDown } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from './popover.js';
import { cn } from '../../utils/cn.js';

export interface ComboboxOption {
  value: string;
  label: string;
}

export interface ComboboxProps {
  options: ComboboxOption[];
  value: string | null;
  onChange: (value: string) => void;
  placeholder?: string;
  searchPlaceholder?: string;
  className?: string;
}

export function Combobox({
  options,
  value,
  onChange,
  placeholder = 'Select…',
  searchPlaceholder = 'Search…',
  className,
}: ComboboxProps) {
  const [open, setOpen] = React.useState(false);
  const [search, setSearch] = React.useState('');

  const filtered = React.useMemo(() => {
    if (!search) return options;
    const lower = search.toLowerCase();
    return options.filter((o) => o.label.toLowerCase().includes(lower));
  }, [options, search]);

  const selected = options.find((o) => o.value === value);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          role="combobox"
          aria-expanded={open}
          aria-haspopup="listbox"
          className={cn(
            'flex h-10 w-full items-center justify-between rounded-md border border-border-subtle bg-surface-field px-3 py-2 text-sm text-text-primary',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2',
            'disabled:cursor-not-allowed disabled:opacity-50',
            !selected && 'text-text-muted',
            className,
          )}
        >
          <span className="truncate">{selected ? selected.label : placeholder}</span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0">
        <div className="border-b border-border-subtle px-3 py-2">
          <input
            autoFocus
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={searchPlaceholder}
            className="w-full bg-transparent text-sm text-text-primary placeholder:text-text-muted outline-none"
          />
        </div>
        <ul
          role="listbox"
          className="max-h-60 overflow-y-auto py-1"
          aria-label="Options"
        >
          {filtered.length === 0 ? (
            <li className="px-3 py-2 text-sm text-text-muted">No results.</li>
          ) : (
            filtered.map((option) => (
              <li
                key={option.value}
                role="option"
                aria-selected={option.value === value}
                className={cn(
                  'relative flex cursor-pointer select-none items-center rounded-sm px-2 py-1.5 text-sm text-text-primary outline-none',
                  'hover:bg-surface-card focus:bg-surface-card',
                  option.value === value && 'font-medium',
                )}
                onClick={() => {
                  onChange(option.value);
                  setOpen(false);
                  setSearch('');
                }}
              >
                <Check
                  className={cn(
                    'mr-2 h-4 w-4 shrink-0',
                    option.value === value ? 'opacity-100' : 'opacity-0',
                  )}
                />
                {option.label}
              </li>
            ))
          )}
        </ul>
      </PopoverContent>
    </Popover>
  );
}
Combobox.displayName = 'Combobox';
