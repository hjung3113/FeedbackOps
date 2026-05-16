// ManagedSystemPicker — dumb component (AGENTS.md:76, ADR-0018 picker Q7).
// No fetch, no API import; the consuming route supplies pre-fetched
// options. The native <select> primitive is kept until the shadcn
// design-token wrap lands (ADR-0016).

import type { ChangeEvent } from 'react';
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
  /** Placeholder text for the empty/"none" option. */
  placeholder?: string;
  /** Test id propagated as `data-testid`. */
  testId?: string;
  className?: string;
}

export function ManagedSystemPicker(props: ManagedSystemPickerProps) {
  function handle(e: ChangeEvent<HTMLSelectElement>) {
    const v = e.target.value;
    props.onChange(v === '' ? null : v);
  }
  return (
    <select
      className={cn('border px-2 py-1 text-sm', props.className)}
      value={props.value ?? ''}
      onChange={handle}
      disabled={props.disabled}
      data-testid={props.testId ?? 'managed-system-picker'}
    >
      <option value="">{props.placeholder ?? 'Select Managed System…'}</option>
      {props.options.map((opt) => {
        const label =
          props.includeArchivedInLabel && opt.archived ? `${opt.label} (archived)` : opt.label;
        return (
          <option key={opt.id} value={opt.id}>
            {label}
          </option>
        );
      })}
    </select>
  );
}
