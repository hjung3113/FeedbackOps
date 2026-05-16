// AnalyticsAreaPicker — dumb component (AGENTS.md:76, grill Q7 lock).
// Identical shape to ManagedSystemPicker; the AA picker is `disabled` until
// the caller picks a Managed System and pre-filters `options` accordingly.

import type { ChangeEvent } from 'react';
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
      data-testid={props.testId ?? 'analytics-area-picker'}
    >
      <option value="">{props.placeholder ?? 'Select Analytics Area…'}</option>
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
