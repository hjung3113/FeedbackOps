import { cn } from '../utils/cn.js';

export interface ToolbarKickerProps {
  label: string;
  name: string;
  className?: string;
  testId?: string;
  labelTestId?: string;
  nameTestId?: string;
}

/** ADR-0020 inline route identity for dense workbench toolbars. */
export function ToolbarKicker({
  label,
  name,
  className,
  testId,
  labelTestId,
  nameTestId,
}: ToolbarKickerProps) {
  return (
    <div
      {...(testId !== undefined ? { 'data-testid': testId } : {})}
      className={cn(
        'inline-flex h-5.5 shrink-0 items-center gap-1.5 border-r border-border-subtle pr-2.5 mr-1',
        className,
      )}
    >
      <span
        {...(labelTestId !== undefined ? { 'data-testid': labelTestId } : {})}
        className="text-xs font-medium uppercase tracking-kicker text-text-muted"
      >
        {label}
      </span>
      <span className="text-caption text-text-muted" aria-hidden="true">
        ·
      </span>
      <span
        {...(nameTestId !== undefined ? { 'data-testid': nameTestId } : {})}
        className="text-sm font-semibold text-text-secondary"
      >
        {name}
      </span>
    </div>
  );
}
