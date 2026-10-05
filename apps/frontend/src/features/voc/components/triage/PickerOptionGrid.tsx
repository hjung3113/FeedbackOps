import { cn } from '@fops/ui';
import * as React from 'react';

export interface PickerOptionGridProps {
  columns: 'owner' | 'severity';
  children: React.ReactElement<{ className?: string; style?: React.CSSProperties }>;
}

const GRID_COLUMNS: Record<PickerOptionGridProps['columns'], string> = {
  owner: '18px 1fr auto',
  severity: '4px 1fr auto',
};

/** Applies the shared option-grid templates to the existing interactive row. */
export function PickerOptionGrid({ columns, children }: PickerOptionGridProps) {
  return React.cloneElement(children, {
    className: cn(children.props.className, 'grid-cols-(--picker-option-grid-columns)'),
    style: {
      ...children.props.style,
      '--picker-option-grid-columns': GRID_COLUMNS[columns],
    } as React.CSSProperties,
  });
}
