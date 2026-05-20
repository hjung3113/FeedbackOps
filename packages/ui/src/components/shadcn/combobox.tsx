import { Check, ChevronsUpDown } from 'lucide-react';
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
 *
 * a11y:
 *   - Trigger has aria-controls linking to the listbox.
 *   - Listbox rendered as <ul role="listbox">; each option as <li role="option">.
 *   - Search input has aria-activedescendant pointing at the highlighted option.
 *   - Keyboard: Arrow Down/Up (cycle), Enter (select), Escape (close), Home/End.
 */
import * as React from 'react';
import { cn } from '../../utils/cn.js';
import { Popover, PopoverContent, PopoverTrigger } from './popover.js';

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
  const [activeIndex, setActiveIndex] = React.useState<number>(-1);

  // Stable IDs for a11y
  const listboxId = React.useId();
  const optionIdPrefix = React.useId();

  const filtered = React.useMemo(() => {
    if (!search) return options;
    const lower = search.toLowerCase();
    return options.filter((o) => o.label.toLowerCase().includes(lower));
  }, [options, search]);

  const selected = options.find((o) => o.value === value);

  // Reset active index when filtered list changes or popover closes.
  // biome-ignore lint/correctness/useExhaustiveDependencies: intentional — filtered is a derived value from useMemo; open is a signal not a dep of setActiveIndex
  React.useEffect(() => {
    setActiveIndex(-1);
  }, [filtered, open]);

  const activeOptionId =
    activeIndex >= 0 && activeIndex < filtered.length
      ? `${optionIdPrefix}-opt-${activeIndex}`
      : undefined;

  function selectOption(option: ComboboxOption) {
    onChange(option.value);
    setOpen(false);
    setSearch('');
    setActiveIndex(-1);
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (!open) return;

    switch (e.key) {
      case 'ArrowDown': {
        e.preventDefault();
        setActiveIndex((prev) => (prev + 1 < filtered.length ? prev + 1 : 0));
        break;
      }
      case 'ArrowUp': {
        e.preventDefault();
        setActiveIndex((prev) => (prev - 1 >= 0 ? prev - 1 : filtered.length - 1));
        break;
      }
      case 'Home': {
        e.preventDefault();
        setActiveIndex(0);
        break;
      }
      case 'End': {
        e.preventDefault();
        setActiveIndex(filtered.length - 1);
        break;
      }
      case 'Enter': {
        e.preventDefault();
        if (activeIndex >= 0 && activeIndex < filtered.length) {
          const opt = filtered[activeIndex];
          if (opt) selectOption(opt);
        }
        break;
      }
      case 'Escape': {
        e.preventDefault();
        setOpen(false);
        break;
      }
    }
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          role="combobox"
          aria-expanded={open}
          aria-haspopup="listbox"
          aria-controls={open ? listboxId : undefined}
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
            onKeyDown={handleKeyDown}
            placeholder={searchPlaceholder}
            aria-autocomplete="list"
            aria-controls={listboxId}
            aria-activedescendant={activeOptionId}
            className="w-full bg-transparent text-sm text-text-primary placeholder:text-text-muted outline-none"
          />
        </div>
        <ul
          id={listboxId}
          role="listbox"
          aria-label="Options"
          className="max-h-60 overflow-y-auto py-1"
        >
          {filtered.length === 0 ? (
            <li className="px-3 py-2 text-sm text-text-muted" role="presentation">
              No results.
            </li>
          ) : (
            filtered.map((option, idx) => (
              <li
                key={option.value}
                id={`${optionIdPrefix}-opt-${idx}`}
                role="option"
                aria-selected={option.value === value}
                tabIndex={-1}
                className={cn(
                  'relative flex cursor-pointer select-none items-center rounded-sm px-2 py-1.5 text-sm text-text-primary outline-none',
                  'hover:bg-surface-card focus:bg-surface-card',
                  option.value === value && 'font-medium',
                  activeIndex === idx && 'bg-surface-card',
                )}
                onMouseEnter={() => setActiveIndex(idx)}
                onClick={() => selectOption(option)}
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
