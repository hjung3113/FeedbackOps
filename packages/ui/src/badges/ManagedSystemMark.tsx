import type * as React from 'react';
import { cn } from '../utils/cn.js';

export interface ManagedSystemMarkProps {
  label: string;
  color: string;
  size: 16 | 18 | 22 | 28;
  fontSize?: string;
  className?: string;
  token?: string;
}

const SIZE_CLASS: Record<ManagedSystemMarkProps['size'], string> = {
  16: 'size-4 rounded-sm text-(length:--managed-system-mark-font-size)',
  18: 'size-4.5 rounded text-caption',
  22: 'size-5.5 rounded-md text-caption',
  28: 'size-7 rounded-md text-tiny',
};

/** Compact square identity mark for a Managed System. */
export function ManagedSystemMark({
  label,
  color,
  size,
  fontSize,
  className,
  token,
}: ManagedSystemMarkProps) {
  const style = {
    '--managed-system-mark-color': color,
    // oxlint-disable-next-line shadcn/no-inline-styles -- ManagedSystemMark receives the Managed System identity color from stored data
    ...(fontSize !== undefined ? { '--managed-system-mark-font-size': fontSize } : {}),
  } as React.CSSProperties;

  return (
    <span
      aria-hidden="true"
      className={cn(
        'inline-flex shrink-0 items-center justify-center bg-(--managed-system-mark-color) font-semibold text-white',
        SIZE_CLASS[size],
        className,
      )}
      style={style}
      {...(token !== undefined ? { 'data-token': token } : {})}
    >
      {label}
    </span>
  );
}
