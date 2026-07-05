import * as React from 'react';
import { Checkbox } from '../components/shadcn/checkbox.js';
import { cn } from '../utils/cn.js';

export type ObjectRowSeverity = 'low' | 'medium' | 'high' | 'critical';
export type ObjectRowDensity = 'compact' | 'default' | 'expanded';

export interface ObjectRowProps {
  id?: string;
  title: React.ReactNode;
  meta?: React.ReactNode;
  badges?: React.ReactNode;
  trailing?: React.ReactNode;
  icon?: React.ReactNode;
  severity?: ObjectRowSeverity;
  selected?: boolean;
  density?: ObjectRowDensity;
  selectable?: boolean;
  checked?: boolean;
  onCheckedChange?: (checked: boolean) => void;
  onClick?: React.MouseEventHandler<HTMLDivElement>;
  className?: string;
  children?: React.ReactNode;
}

const densityClassName: Record<ObjectRowDensity, string> = {
  compact:  'min-h-row-compact px-5 py-1.5',
  default:  'min-h-row-default px-5 py-2.5',
  expanded: 'min-h-row-expanded px-5 py-3.5',
};

export const ObjectRow = React.forwardRef<HTMLDivElement, ObjectRowProps>(
  (
    {
      id,
      title,
      meta,
      badges,
      trailing,
      icon,
      severity,
      selected = false,
      density = 'default',
      selectable = false,
      checked = false,
      onCheckedChange,
      onClick,
      className,
      children,
    },
    ref,
  ) => {
    const clickableProps = onClick
      ? {
          role:    'button',
          tabIndex: 0,
          onKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
            if (event.key === 'Enter' || event.key === ' ') {
              event.preventDefault();
              event.currentTarget.click();
            }
          },
        }
      : {};

    return (
      <div
        ref={ref}
        className={cn(
          'relative grid grid-cols-[auto_1fr_auto] items-center gap-3 border-b border-border-subtle transition-colors duration-75',
          selected ? 'bg-surface-row-selected' : 'hover:bg-surface-row-hover',
          onClick && 'cursor-pointer',
          densityClassName[density],
          className,
        )}
        onClick={onClick}
        {...clickableProps}
      >
        {selected && (
          <span
            aria-hidden="true"
            className="absolute inset-y-0 left-0 w-0.5 bg-border-selected"
            data-testid="object-row-selected-bar"
          />
        )}

        <div className="flex shrink-0 items-center gap-2.5">
          {severity && (
            <span
              aria-hidden="true"
              className="h-4 w-[3px] shrink-0 rounded-pill"
              style={{ backgroundColor: `rgb(var(--severity-${severity}) / 1)` }}
              data-token={`--severity-${severity}`}
            />
          )}
          {selectable && (
            <Checkbox
              aria-label={id ? `Select ${id}` : 'Select row'}
              checked={checked}
              onClick={(event) => event.stopPropagation()}
              onCheckedChange={(nextChecked) => onCheckedChange?.(nextChecked === true)}
            />
          )}
          {icon && <span className="flex shrink-0 text-text-muted">{icon}</span>}
        </div>

        <div className="flex min-w-0 flex-col gap-1">
          <div className="flex min-w-0 items-center gap-2">
            {id && <span className="shrink-0 font-mono text-xs text-text-muted">{id}</span>}
            <span className="truncate text-sm font-medium text-text-primary">{title}</span>
          </div>

          {(badges || meta) && (
            <div className="flex flex-wrap items-center gap-2 text-xs text-text-muted">
              {badges}
              {meta}
            </div>
          )}

          {children}
        </div>

        {trailing && (
          <div className="flex shrink-0 items-center gap-2">
            {trailing}
          </div>
        )}
      </div>
    );
  },
);
ObjectRow.displayName = 'ObjectRow';
