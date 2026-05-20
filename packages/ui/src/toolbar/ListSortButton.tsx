import * as React from 'react';
import { cn } from '../utils/cn.js';
import { Button } from '../components/Button.js';
import { Badge } from '../components/shadcn/badge.js';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '../components/shadcn/popover.js';
import { RadioGroup, RadioGroupItem } from '../components/shadcn/radio-group.js';

export interface SortOption {
  value: string;
  label: string;
}

export interface ListSortButtonProps {
  options: SortOption[];
  value: string;
  defaultValue: string;
  onChange: (next: string) => void;
  className?: string;
}

export function ListSortButton({
  options,
  value,
  defaultValue,
  onChange,
  className,
}: ListSortButtonProps) {
  const [open, setOpen] = React.useState(false);
  const isNonDefault = value !== defaultValue;
  const activeOption = options.find((o) => o.value === value);

  function handleValueChange(next: string) {
    onChange(next);
    setOpen(false);
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className={cn('gap-1.5', className)}>
          {isNonDefault && activeOption !== undefined ? (
            <>
              정렬:
              <Badge variant="secondary" className="px-1.5 py-0 text-xs">
                {activeOption.label}
              </Badge>
            </>
          ) : (
            '정렬'
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-52 p-3">
        <RadioGroup value={value} onValueChange={handleValueChange} className="gap-2">
          {options.map((option) => (
            <label
              key={option.value}
              className="flex items-center gap-2 cursor-pointer text-sm text-text-primary"
            >
              <RadioGroupItem value={option.value} />
              {option.label}
            </label>
          ))}
        </RadioGroup>
      </PopoverContent>
    </Popover>
  );
}

ListSortButton.displayName = 'ListSortButton';
