/// <reference types="@testing-library/jest-dom" />
import { act, fireEvent, render, screen } from '@testing-library/react';
import { vi } from 'vitest';
import { DatePicker } from '../../index.js';

describe('DatePicker', () => {
  it('emits a typed YYYY-MM-DD value unchanged', () => {
    const onChange = vi.fn();
    render(<DatePicker aria-label="만료일" value="" onChange={onChange} />);

    expect(screen.getByRole('textbox', { name: '만료일' })).toHaveAttribute(
      'placeholder',
      'YYYY-MM-DD',
    );
    fireEvent.change(screen.getByRole('textbox', { name: '만료일' }), {
      target: { value: '2026-06-16' },
    });

    expect(onChange).toHaveBeenCalledWith('2026-06-16');
  });

  it('uses a caller-provided placeholder', () => {
    render(
      <DatePicker aria-label="날짜" placeholder="날짜를 입력하세요" value="" onChange={vi.fn()} />,
    );

    expect(screen.getByRole('textbox', { name: '날짜' })).toHaveAttribute(
      'placeholder',
      '날짜를 입력하세요',
    );
  });

  it.each(['2026-', '2026-06', '2026-02-30'])(
    'keeps malformed typed date %s out of onChange and shows its error after blur',
    (value) => {
      const onChange = vi.fn();
      const onValidityChange = vi.fn();
      render(
        <DatePicker
          aria-label="날짜"
          aria-invalid={false}
          value="2026-06-12"
          onChange={onChange}
          onValidityChange={onValidityChange}
        />,
      );

      const input = screen.getByRole('textbox', { name: '날짜' });
      fireEvent.change(input, { target: { value } });

      expect(onChange).not.toHaveBeenCalled();
      expect(onValidityChange).toHaveBeenLastCalledWith(false);
      expect(input).toHaveAttribute('aria-invalid', 'true');
      expect(input).not.toBeValid();
      expect(screen.queryByText('날짜를 YYYY-MM-DD 형식으로 입력하세요.')).not.toBeInTheDocument();

      fireEvent.blur(input);

      expect(screen.getByText('날짜를 YYYY-MM-DD 형식으로 입력하세요.')).toBeInTheDocument();
      expect(input.getAttribute('aria-describedby')).toContain('datepicker-error');
    },
  );

  it('shows the error when a native form submit is attempted without a blur', () => {
    const onSubmit = vi.fn((event: { preventDefault: () => void }) => event.preventDefault());
    render(
      <form onSubmit={onSubmit}>
        <DatePicker aria-label="날짜" value="" onChange={vi.fn()} />
      </form>,
    );
    const input = screen.getByRole('textbox', { name: '날짜' });
    input.focus();
    fireEvent.change(input, { target: { value: '2026-0' } });
    expect(screen.queryByText('날짜를 YYYY-MM-DD 형식으로 입력하세요.')).not.toBeInTheDocument();

    act(() => {
      (input.closest('form') as HTMLFormElement).requestSubmit();
    });

    expect(onSubmit).not.toHaveBeenCalled();
    expect(input).toHaveFocus();
    expect(input).toHaveAccessibleDescription('날짜를 YYYY-MM-DD 형식으로 입력하세요.');
  });

  it('emits a selected calendar date unchanged', () => {
    const onChange = vi.fn();
    render(<DatePicker aria-label="날짜" value="2026-06-12" onChange={onChange} />);

    fireEvent.click(screen.getByRole('button', { name: '달력 열기' }));
    fireEvent.click(screen.getByRole('button', { name: '2026년 6월 16일' }));

    expect(onChange).toHaveBeenCalledWith('2026-06-16');
  });

  it('uses the registered selected-row surface token for the selected day', () => {
    render(<DatePicker aria-label="날짜" value="2026-06-12" onChange={vi.fn()} />);

    fireEvent.click(screen.getByRole('button', { name: '달력 열기' }));

    expect(screen.getByRole('button', { name: '2026년 6월 12일' })).toHaveClass(
      'aria-pressed:bg-surface-row-selected',
    );
  });

  it.each([
    ['', ''],
    [null, null],
  ] as const)('clears the selected date to the caller empty value %s', (emptyValue, expected) => {
    const onChange = vi.fn();
    render(
      <DatePicker
        aria-label="날짜"
        value="2026-06-12"
        emptyValue={emptyValue}
        onChange={onChange}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: '날짜 지우기' }));

    expect(onChange).toHaveBeenCalledWith(expected);
    expect(screen.getByRole('textbox', { name: '날짜' })).toHaveValue('');
  });

  it('disables calendar dates outside min and max and keeps typed out-of-range dates invalid', () => {
    const onChange = vi.fn();
    render(
      <DatePicker
        aria-label="날짜"
        value="2026-06-15"
        min="2026-06-10"
        max="2026-06-20"
        onChange={onChange}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: '달력 열기' }));
    expect(screen.getByRole('button', { name: '2026년 6월 9일' })).toBeDisabled();
    expect(screen.getByRole('button', { name: '2026년 6월 10일' })).toBeEnabled();
    expect(screen.getByRole('button', { name: '2026년 6월 21일' })).toBeDisabled();
    fireEvent.change(screen.getByRole('textbox', { name: '날짜' }), {
      target: { value: '2026-06-21' },
    });

    expect(onChange).toHaveBeenCalledWith('2026-06-21');
    expect(screen.getByRole('textbox', { name: '날짜' })).not.toBeValid();
  });

  it('moves by day and month, selects with Enter, and restores focus after Escape', () => {
    const onChange = vi.fn();
    render(<DatePicker aria-label="날짜" value="2026-06-15" onChange={onChange} />);
    const trigger = screen.getByRole('button', { name: '달력 열기' });

    fireEvent.click(trigger);
    expect(screen.getByRole('table')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '2026년 6월 15일' })).toHaveFocus();
    fireEvent.keyDown(screen.getByRole('button', { name: '2026년 6월 15일' }), {
      key: 'ArrowRight',
    });
    expect(screen.getByRole('button', { name: '2026년 6월 16일' })).toHaveFocus();
    fireEvent.keyDown(screen.getByRole('button', { name: '2026년 6월 16일' }), {
      key: 'PageDown',
    });
    expect(screen.getByRole('button', { name: '2026년 7월 16일' })).toHaveFocus();
    fireEvent.keyDown(screen.getByRole('button', { name: '2026년 7월 16일' }), {
      key: 'PageUp',
    });
    fireEvent.keyDown(screen.getByRole('button', { name: '2026년 6월 16일' }), {
      key: 'Enter',
    });

    expect(onChange).toHaveBeenCalledWith('2026-06-16');
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();

    fireEvent.click(trigger);
    expect(screen.getByRole('table')).toBeInTheDocument();
    fireEvent.keyDown(screen.getByRole('button', { name: '2026년 6월 15일' }), {
      key: 'Escape',
    });

    expect(screen.queryByRole('table')).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });

  it.each([
    { start: '2026-01-01', key: 'ArrowLeft', destination: '2025년 12월 31일' },
    { start: '2025-12-31', key: 'ArrowRight', destination: '2026년 1월 1일' },
  ])('moves across the year boundary from $start with $key', ({ start, key, destination }) => {
    render(<DatePicker aria-label="날짜" value={start} onChange={vi.fn()} />);

    fireEvent.click(screen.getByRole('button', { name: '달력 열기' }));
    fireEvent.keyDown(screen.getByRole('button', { name: formatDayLabel(start) }), { key });

    expect(screen.getByRole('button', { name: destination })).toHaveFocus();
  });

  it.each([
    { value: '2026-06-10', key: 'ArrowLeft', edge: '2026년 6월 10일' },
    { value: '2026-06-20', key: 'ArrowRight', edge: '2026년 6월 20일' },
  ])('clamps keyboard movement at the $key range edge', ({ value, key, edge }) => {
    render(
      <DatePicker
        aria-label="날짜"
        value={value}
        min="2026-06-10"
        max="2026-06-20"
        onChange={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: '달력 열기' }));
    fireEvent.keyDown(screen.getByRole('button', { name: edge }), { key });

    expect(screen.getByRole('button', { name: edge })).toHaveFocus();
  });

  it('keeps focus on an outside field when the calendar is dismissed there', () => {
    render(
      <>
        <DatePicker aria-label="날짜" value="2026-06-15" onChange={vi.fn()} />
        <input aria-label="다음 입력" />
      </>,
    );
    const outsideInput = screen.getByRole('textbox', { name: '다음 입력' });

    fireEvent.click(screen.getByRole('button', { name: '달력 열기' }));
    expect(screen.getByRole('table')).toBeInTheDocument();
    act(() => outsideInput.focus());
    fireEvent.pointerDown(outsideInput);

    expect(screen.queryByRole('table')).not.toBeInTheDocument();
    expect(outsideInput).toHaveFocus();
  });
});

function formatDayLabel(value: string): string {
  const [year, month, day] = value.split('-').map(Number);
  return `${year}년 ${month}월 ${day}일`;
}
