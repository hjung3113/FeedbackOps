import { Search } from 'lucide-react';
import { Input } from '../components/shadcn/input.js';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '../components/shadcn/tooltip.js';
import { cn } from '../utils/cn.js';

export interface SearchInputProps {
  placeholder?: string;
  className?: string;
  /**
   * Controlled value. Only read when `onValueChange` is provided (#821).
   */
  value?: string;
  /**
   * When provided, the input renders enabled and controlled. Without it the
   * component stays the disabled placeholder (tooltip on focus) used by routes
   * whose search endpoint has not shipped yet.
   */
  onValueChange?: (value: string) => void;
  /**
   * #864: called when the user commits the draft — on Enter and on blur, in
   * controlled mode only. The current value is already with the parent via
   * `onValueChange`. Escape keeps its own clear behaviour and never commits.
   */
  onCommit?: () => void;
}

const DISABLED_TOOLTIP = '검색은 다음 슬라이스에서 제공됩니다';
const DEFAULT_PLACEHOLDER = 'VOC 검색…';

export function SearchInput({
  placeholder = DEFAULT_PLACEHOLDER,
  className,
  value,
  onValueChange,
  onCommit,
}: SearchInputProps) {
  if (onValueChange === undefined) {
    return (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            {/*
             * Tooltip-on-disabled-input pattern:
             * Disabled inputs don't fire pointer events, so the Tooltip trigger
             * is a focusable wrapper <span tabIndex={0}> that receives pointer +
             * keyboard events. The inner Input carries disabled + aria-disabled.
             */}
            <span
              tabIndex={0}
              className={cn(
                'relative inline-flex items-center cursor-not-allowed opacity-50',
                className,
              )}
              aria-label={placeholder}
            >
              <Search
                className="pointer-events-none absolute left-3 h-4 w-4 text-text-muted"
                aria-hidden="true"
              />
              <Input
                placeholder={placeholder}
                disabled
                aria-disabled="true"
                className="pl-9 cursor-not-allowed"
              />
            </span>
          </TooltipTrigger>
          <TooltipContent>{DISABLED_TOOLTIP}</TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }

  return (
    <div className={cn('relative inline-flex items-center', className)}>
      <Search
        className="pointer-events-none absolute left-3 h-4 w-4 text-text-muted"
        aria-hidden="true"
      />
      <Input
        type="search"
        value={value}
        placeholder={placeholder}
        aria-label={placeholder}
        className="pl-9"
        onChange={(event) => onValueChange(event.target.value)}
        onKeyDown={(event) => {
          // A dialog (e.g. Radix) may have already handled this Escape on
          // document capture; one key must not also clear the box.
          if (event.defaultPrevented) return;
          if (event.key === 'Enter' && onCommit !== undefined) onCommit();
          if (event.key === 'Escape' && value !== '') {
            event.preventDefault();
            onValueChange('');
          }
        }}
        {...(onCommit !== undefined ? { onBlur: () => onCommit() } : {})}
      />
    </div>
  );
}

SearchInput.displayName = 'SearchInput';
