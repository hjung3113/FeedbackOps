// AnalyticsAreaPicker — dumb component (AGENTS.md:76, grill Q7 lock).
// Identical shape to ManagedSystemPicker; the AA picker is `disabled` until
// the caller picks a Managed System and pre-filters `options` accordingly.
// Pack 17 / ADR-0021: rebuilt on shadcn ToggleGroup (chip pattern, spec §3.4).

import { ChipPicker } from './ChipPicker.js';
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
  return <ChipPicker {...props} placeholder={props.placeholder ?? 'Select Analytics Area'} testId={props.testId ?? 'analytics-area-picker'} />;
}
