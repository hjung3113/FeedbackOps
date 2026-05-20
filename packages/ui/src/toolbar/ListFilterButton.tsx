import * as React from 'react';
import { cn } from '../utils/cn.js';
import { Button } from '../components/Button.js';
import { Badge } from '../components/shadcn/badge.js';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '../components/shadcn/popover.js';
import { Checkbox } from '../components/shadcn/checkbox.js';

export interface FilterCategory {
  key: string;
  label: string;
  options: { value: string; label: string }[];
}

export interface ListFilterButtonProps {
  categories: FilterCategory[];
  values: Record<string, string[]>;
  onChange: (next: Record<string, string[]>) => void;
  className?: string;
}

function totalCount(values: Record<string, string[]>): number {
  return Object.values(values).reduce((sum, arr) => sum + arr.length, 0);
}

export function ListFilterButton({
  categories,
  values,
  onChange,
  className,
}: ListFilterButtonProps) {
  const [open, setOpen] = React.useState(false);
  const count = totalCount(values);

  function handleToggle(categoryKey: string, optionValue: string, checked: boolean) {
    const current = values[categoryKey] ?? [];
    const next = checked
      ? [...current, optionValue]
      : current.filter((v) => v !== optionValue);

    const nextValues: Record<string, string[]> = { ...values };
    if (next.length === 0) {
      delete nextValues[categoryKey];
    } else {
      nextValues[categoryKey] = next;
    }
    onChange(nextValues);
  }

  function handleReset() {
    onChange({});
    setOpen(false);
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className={cn('gap-1.5', className)}>
          필터
          {count > 0 && (
            <Badge variant="secondary" className="px-1.5 py-0 text-xs">
              {count}
            </Badge>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-64 p-3">
        <div className="flex flex-col gap-4">
          {categories.map((category) => {
            const selected = values[category.key] ?? [];
            return (
              <div key={category.key} className="flex flex-col gap-2">
                <p className="text-xs font-semibold text-text-muted uppercase tracking-wide">
                  {category.label}
                </p>
                {category.options.map((option) => {
                  const isChecked = selected.includes(option.value);
                  return (
                    <label
                      key={option.value}
                      className="flex items-center gap-2 cursor-pointer text-sm text-text-primary"
                    >
                      <Checkbox
                        checked={isChecked}
                        onCheckedChange={(checked) =>
                          handleToggle(category.key, option.value, checked === true)
                        }
                      />
                      {option.label}
                    </label>
                  );
                })}
              </div>
            );
          })}
        </div>
        <div className="mt-4 border-t border-border-subtle pt-3">
          <button
            type="button"
            className="text-xs text-accent-primary hover:underline"
            onClick={handleReset}
          >
            필터 초기화
          </button>
        </div>
      </PopoverContent>
    </Popover>
  );
}

ListFilterButton.displayName = 'ListFilterButton';
