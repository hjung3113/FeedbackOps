// ManagedSystemPicker — dumb component (AGENTS.md:76, ADR-0018 picker Q7).
// No fetch, no API import; the consuming route supplies pre-fetched options.
// Pack 17 / ADR-0021: rebuilt on shadcn ToggleGroup (chip pattern, spec §3.4).
// Dumb-prop contract preserved (PickerOption[], onChange(string|null)).

import { ChipPicker, type PickerOption } from './ChipPicker.js';

export type { PickerOption } from './ChipPicker.js';

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
  return <ChipPicker {...props} placeholder={props.placeholder ?? 'Select Managed System'} testId={props.testId ?? 'managed-system-picker'} variant="managed-system" />;
}
