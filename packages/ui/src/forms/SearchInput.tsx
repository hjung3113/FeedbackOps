import * as React from 'react';
import { Search } from 'lucide-react';
import { cn } from '../utils/cn.js';
import { Input } from '../components/shadcn/input.js';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '../components/shadcn/tooltip.js';

export interface SearchInputProps {
  placeholder?: string;
  className?: string;
}

const DISABLED_TOOLTIP = '검색은 다음 슬라이스에서 제공됩니다';
const DEFAULT_PLACEHOLDER = 'VOC 검색…';

export function SearchInput({
  placeholder = DEFAULT_PLACEHOLDER,
  className,
}: SearchInputProps) {
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

SearchInput.displayName = 'SearchInput';
