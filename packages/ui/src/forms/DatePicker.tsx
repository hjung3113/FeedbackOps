import { CalendarDays, ChevronLeft, ChevronRight, X } from 'lucide-react';
import * as React from 'react';
import { Popover, PopoverContent, PopoverTrigger } from '../components/shadcn/popover.js';
import { cn } from '../utils/cn.js';

const DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
const monthFormatter = new Intl.DateTimeFormat('ko-KR', {
  year: 'numeric',
  month: 'long',
  timeZone: 'UTC',
});
const weekdayFormatter = new Intl.DateTimeFormat('ko-KR', {
  weekday: 'short',
  timeZone: 'UTC',
});
const weekdays = Array.from({ length: 7 }, (_, index) =>
  weekdayFormatter.format(makeUtcDate(2023, 1, index + 1)),
);

export interface DatePickerProps
  extends Omit<
    React.InputHTMLAttributes<HTMLInputElement>,
    'type' | 'value' | 'onChange' | 'min' | 'max'
  > {
  value: string | null;
  onChange: (value: string | null) => void;
  min?: string;
  max?: string;
  emptyValue?: '' | null;
}

export function DatePicker({
  value,
  onChange,
  min,
  max,
  emptyValue = '',
  className,
  disabled = false,
  'aria-invalid': ariaInvalid,
  ...inputProps
}: DatePickerProps) {
  const [draft, setDraft] = React.useState(value ?? '');
  const initialDate = parseDate(value) ?? clampToRange(today(), min, max);
  const [visibleMonth, setVisibleMonth] = React.useState(() => startOfMonth(initialDate));
  const [activeDate, setActiveDate] = React.useState(() => formatDate(initialDate));
  const [open, setOpen] = React.useState(false);
  const inputRef = React.useRef<HTMLInputElement>(null);
  const triggerRef = React.useRef<HTMLButtonElement>(null);
  const calendarRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    setDraft(value ?? '');
    const parsed = parseDate(value);
    if (parsed) {
      setVisibleMonth(startOfMonth(parsed));
      setActiveDate(formatDate(parsed));
    }
  }, [value]);

  React.useEffect(() => {
    inputRef.current?.setCustomValidity(getValidationMessage(draft, min, max));
  }, [draft, min, max]);

  React.useEffect(() => {
    if (open) {
      calendarRef.current?.querySelector<HTMLButtonElement>(`[data-date="${activeDate}"]`)?.focus();
    }
  }, [activeDate, open]);

  const wasOpenRef = React.useRef(open);
  React.useEffect(() => {
    if (wasOpenRef.current && !open) triggerRef.current?.focus();
    wasOpenRef.current = open;
  }, [open]);

  function handleChange(event: React.ChangeEvent<HTMLInputElement>) {
    const nextValue = event.target.value;
    setDraft(nextValue);
    if (nextValue === '') {
      onChange(emptyValue);
    } else if (isValidDate(nextValue)) {
      // Native date inputs keep a valid typed date in the value even when min
      // or max makes it invalid for submission. The custom validity below
      // preserves that constraint while callers retain the entered value.
      onChange(nextValue);
    }
  }

  function selectDate(date: Date) {
    const nextValue = formatDate(date);
    setDraft(nextValue);
    setActiveDate(nextValue);
    setVisibleMonth(startOfMonth(date));
    onChange(nextValue);
    setOpen(false);
  }

  function focusDate(date: Date) {
    const nextDate = clampToRange(date, min, max);
    setActiveDate(formatDate(nextDate));
    setVisibleMonth(startOfMonth(nextDate));
  }

  function handleDayKeyDown(event: React.KeyboardEvent<HTMLButtonElement>, date: Date) {
    let nextDate: Date | null = null;
    switch (event.key) {
      case 'ArrowLeft':
        nextDate = addDays(date, -1);
        break;
      case 'ArrowRight':
        nextDate = addDays(date, 1);
        break;
      case 'ArrowUp':
        nextDate = addDays(date, -7);
        break;
      case 'ArrowDown':
        nextDate = addDays(date, 7);
        break;
      case 'PageUp':
        nextDate = addMonths(date, -1);
        break;
      case 'PageDown':
        nextDate = addMonths(date, 1);
        break;
      case 'Enter':
      case ' ':
        event.preventDefault();
        selectDate(date);
        return;
      case 'Escape':
        event.preventDefault();
        setOpen(false);
        return;
      default:
        return;
    }
    event.preventDefault();
    if (nextDate) focusDate(nextDate);
  }

  const monthYear = visibleMonth.getUTCFullYear();
  const month = visibleMonth.getUTCMonth();
  const firstWeekday = makeUtcDate(monthYear, month + 1, 1).getUTCDay();
  const daysInMonth = makeUtcDate(monthYear, month + 2, 0).getUTCDate();
  const cellCount = Math.ceil((firstWeekday + daysInMonth) / 7) * 7;
  const days = Array.from({ length: cellCount }, (_, index) => {
    const day = index - firstWeekday + 1;
    return day < 1 || day > daysInMonth ? null : makeUtcDate(monthYear, month + 1, day);
  });
  const validationMessage = getValidationMessage(draft, min, max);

  return (
    <div
      className={cn(
        'flex h-10 w-full items-center rounded-md border border-border-subtle bg-surface-field px-3 py-2 text-sm text-text-primary',
        'focus-within:outline-none focus-within:ring-2 focus-within:ring-focus-ring focus-within:ring-offset-2',
        disabled && 'cursor-not-allowed opacity-50',
        validationMessage && 'border-accent-danger',
        className,
      )}
      data-invalid={validationMessage ? 'true' : undefined}
    >
      <input
        ref={inputRef}
        type="text"
        inputMode="numeric"
        value={draft}
        onChange={handleChange}
        pattern="\d{4}-\d{2}-\d{2}"
        disabled={disabled}
        min={min}
        max={max}
        aria-invalid={ariaInvalid ?? (validationMessage ? true : undefined)}
        className="h-full min-w-0 flex-1 bg-transparent text-text-primary outline-none placeholder:text-text-muted"
        {...inputProps}
      />
      {draft !== '' ? (
        <button
          type="button"
          aria-label="날짜 지우기"
          className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded text-text-muted hover:bg-surface-card hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring"
          disabled={disabled}
          onClick={() => {
            setDraft('');
            onChange(emptyValue);
            inputRef.current?.focus();
          }}
        >
          <X aria-hidden="true" className="h-4 w-4" />
        </button>
      ) : null}
      <Popover
        open={open}
        onOpenChange={(nextOpen) => {
          if (nextOpen) {
            const nextDate = clampToRange(parseDate(value) ?? today(), min, max);
            setVisibleMonth(startOfMonth(nextDate));
            setActiveDate(formatDate(nextDate));
          }
          setOpen(nextOpen);
        }}
      >
        <PopoverTrigger asChild>
          <button
            ref={triggerRef}
            type="button"
            aria-label="달력 열기"
            className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded text-text-muted hover:bg-surface-card hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring"
            disabled={disabled}
          >
            <CalendarDays aria-hidden="true" className="h-4 w-4" />
          </button>
        </PopoverTrigger>
        <PopoverContent
          align="end"
          className="w-72 p-3"
          onOpenAutoFocus={(event) => event.preventDefault()}
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            triggerRef.current?.focus();
          }}
        >
          <div ref={calendarRef}>
            <div className="mb-2 flex items-center justify-between">
              <button
                type="button"
                aria-label="이전 달"
                className="inline-flex h-8 w-8 items-center justify-center rounded-md text-text-secondary hover:bg-surface-card focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring"
                onClick={() => focusDate(addMonths(visibleMonth, -1))}
              >
                <ChevronLeft aria-hidden="true" className="h-4 w-4" />
              </button>
              <span aria-live="polite" className="text-sm font-medium text-text-primary">
                {monthFormatter.format(visibleMonth)}
              </span>
              <button
                type="button"
                aria-label="다음 달"
                className="inline-flex h-8 w-8 items-center justify-center rounded-md text-text-secondary hover:bg-surface-card focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring"
                onClick={() => focusDate(addMonths(visibleMonth, 1))}
              >
                <ChevronRight aria-hidden="true" className="h-4 w-4" />
              </button>
            </div>
            <table
              className="w-full border-collapse"
              aria-label={monthFormatter.format(visibleMonth)}
            >
              <thead>
                <tr className="text-center">
                  {weekdays.map((weekday) => (
                    <th
                      key={weekday}
                      scope="col"
                      className="py-1 text-xs font-normal text-text-muted"
                    >
                      {weekday}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {Array.from({ length: cellCount / 7 }, (_, weekIndex) => {
                  const week = days.slice(weekIndex * 7, weekIndex * 7 + 7);
                  const firstDate = week.find((date): date is Date => date !== null);
                  if (!firstDate) return null;
                  return (
                    <tr key={formatDate(firstDate)} className="text-center">
                      {week.map((date, dayIndex) => {
                        if (!date) {
                          return (
                            <td
                              key={`empty-${weekdays[dayIndex]}`}
                              aria-hidden="true"
                              className="py-0.5"
                            />
                          );
                        }
                        const dateValue = formatDate(date);
                        const isDisabled = !isInRange(dateValue, min, max);
                        return (
                          <td key={dateValue} className="py-0.5">
                            <button
                              type="button"
                              data-date={dateValue}
                              aria-label={formatDateLabel(date)}
                              aria-current={dateValue === formatDate(today()) ? 'date' : undefined}
                              tabIndex={dateValue === activeDate ? 0 : -1}
                              disabled={isDisabled}
                              aria-pressed={dateValue === value}
                              className="inline-flex h-8 w-8 items-center justify-center rounded-md text-sm text-text-primary hover:bg-surface-card focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring aria-[current=date]:font-semibold aria-[pressed=true]:bg-surface-selected aria-[pressed=true]:text-text-primary disabled:cursor-not-allowed disabled:opacity-40"
                              onClick={() => selectDate(date)}
                              onKeyDown={(event) => handleDayKeyDown(event, date)}
                            >
                              {date.getUTCDate()}
                            </button>
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}

function makeUtcDate(year: number, month: number, day: number): Date {
  const date = new Date(0);
  date.setUTCHours(0, 0, 0, 0);
  date.setUTCFullYear(year, month - 1, day);
  return date;
}

function parseDate(value: string | null | undefined): Date | null {
  if (!value) return null;
  const match = DATE_PATTERN.exec(value);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const parsed = makeUtcDate(year, month, day);
  return parsed.getUTCFullYear() === year &&
    parsed.getUTCMonth() === month - 1 &&
    parsed.getUTCDate() === day
    ? parsed
    : null;
}

function isValidDate(value: string): boolean {
  return parseDate(value) !== null;
}

function formatDate(date: Date): string {
  const year = String(date.getUTCFullYear()).padStart(4, '0');
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  const day = String(date.getUTCDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function formatDateLabel(date: Date): string {
  return `${date.getUTCFullYear()}년 ${date.getUTCMonth() + 1}월 ${date.getUTCDate()}일`;
}

function startOfMonth(date: Date): Date {
  return makeUtcDate(date.getUTCFullYear(), date.getUTCMonth() + 1, 1);
}

function addDays(date: Date, amount: number): Date {
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() + amount);
  return next;
}

function addMonths(date: Date, amount: number): Date {
  const year = date.getUTCFullYear();
  const month = date.getUTCMonth() + amount;
  const targetMonthStart = makeUtcDate(year, month + 1, 1);
  const lastDay = makeUtcDate(
    targetMonthStart.getUTCFullYear(),
    targetMonthStart.getUTCMonth() + 2,
    0,
  ).getUTCDate();
  return makeUtcDate(
    targetMonthStart.getUTCFullYear(),
    targetMonthStart.getUTCMonth() + 1,
    Math.min(date.getUTCDate(), lastDay),
  );
}

function today(): Date {
  const localDate = new Date();
  return makeUtcDate(localDate.getFullYear(), localDate.getMonth() + 1, localDate.getDate());
}

function isInRange(value: string, min?: string, max?: string): boolean {
  return (!min || value >= min) && (!max || value <= max);
}

function clampToRange(date: Date, min?: string, max?: string): Date {
  const value = formatDate(date);
  if (min && value < min) return parseDate(min) ?? date;
  if (max && value > max) return parseDate(max) ?? date;
  return date;
}

function getValidationMessage(value: string, min?: string, max?: string): string {
  if (value === '') return '';
  if (!isValidDate(value)) return '날짜를 YYYY-MM-DD 형식으로 입력하세요.';
  if (min && value < min) return '최소 날짜보다 빠른 날짜를 선택할 수 없습니다.';
  if (max && value > max) return '최대 날짜보다 늦은 날짜를 선택할 수 없습니다.';
  return '';
}
