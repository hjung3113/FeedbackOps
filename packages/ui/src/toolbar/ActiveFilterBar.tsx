import { X } from 'lucide-react';
import { Button } from '../components/Button.js';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '../components/shadcn/tooltip.js';
import { cn } from '../utils/cn.js';

export interface ActiveFilterBarProps {
  items: { key: string; label: string; onRemove: () => void }[];
  onClearAll: () => void;
  className?: string;
}

export function ActiveFilterBar({ items, onClearAll, className }: ActiveFilterBarProps) {
  if (items.length === 0) return null;
  return (
    <TooltipProvider>
      <fieldset
        aria-label="적용된 필터"
        className={cn('flex flex-wrap items-center gap-2 text-xs', className)}
      >
        {items.map(({ key, label, onRemove }) => (
          <span
            key={key}
            className="inline-flex items-center gap-1 rounded-md bg-accent-primary/10 pl-2 text-accent-primary"
          >
            {label}
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  type="button"
                  variant="subtle"
                  size="icon-xs"
                  className="text-current hover:bg-accent-primary/10"
                  aria-label={`${label} 필터 제거`}
                  onClick={onRemove}
                >
                  <X className="size-3" aria-hidden="true" />
                </Button>
              </TooltipTrigger>
              <TooltipContent size="sm">{`${label} 필터 제거`}</TooltipContent>
            </Tooltip>
          </span>
        ))}
        <button
          type="button"
          onClick={onClearAll}
          className="rounded-sm text-xs text-accent-primary hover:underline focus-visible:outline focus-visible:outline-focus-ring"
        >
          필터 초기화
        </button>
      </fieldset>
    </TooltipProvider>
  );
}
