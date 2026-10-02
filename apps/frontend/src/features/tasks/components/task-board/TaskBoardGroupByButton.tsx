import {
  Button,
  Popover,
  PopoverContent,
  PopoverTrigger,
  RadioGroup,
  RadioGroupItem,
} from '@fops/ui';
import { Layers } from 'lucide-react';
import * as React from 'react';

export const GROUP_OPTIONS = [
  { value: 'status', label: '상태 (기본)' },
  { value: 'priority', label: '우선순위' },
  { value: 'managedSystem', label: 'Managed System' },
  { value: 'assignee', label: '담당자' },
] as const;

export type TaskBoardGroupBy = (typeof GROUP_OPTIONS)[number]['value'];

export function TaskBoardGroupByButton({
  value,
  onChange,
}: {
  value: TaskBoardGroupBy;
  onChange: (value: TaskBoardGroupBy) => void;
}) {
  const [open, setOpen] = React.useState(false);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button type="button" variant="outline" size="sm" aria-expanded={open}>
          <Layers className="h-4 w-4" />
          그룹화
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" aria-label="그룹화 옵션" className="w-52 p-1">
        <RadioGroup
          value={value}
          aria-label="그룹화"
          className="gap-1"
          onValueChange={(next) => {
            onChange(next as TaskBoardGroupBy);
            setOpen(false);
          }}
        >
          {GROUP_OPTIONS.map((option) => (
            <label
              key={option.value}
              htmlFor={`group-by-${option.value}`}
              className="flex w-full cursor-pointer items-center gap-2 rounded-sm px-2 py-1.5 text-sm text-text-primary hover:bg-surface-card"
            >
              <RadioGroupItem id={`group-by-${option.value}`} value={option.value} />
              {option.label}
            </label>
          ))}
        </RadioGroup>
      </PopoverContent>
    </Popover>
  );
}
