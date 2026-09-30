/// <reference types="@testing-library/jest-dom" />
import { fireEvent, render, screen } from '@testing-library/react';
import { vi } from 'vitest';
import { DatePicker } from '../../index.js';

describe('DatePicker', () => {
  it('emits a typed YYYY-MM-DD value unchanged', () => {
    const onChange = vi.fn();
    render(<DatePicker aria-label="만료일" value="" onChange={onChange} />);

    fireEvent.change(screen.getByRole('textbox', { name: '만료일' }), {
      target: { value: '2026-06-16' },
    });

    expect(onChange).toHaveBeenCalledWith('2026-06-16');
  });

  it('emits a selected calendar date unchanged', () => {
    const onChange = vi.fn();
    render(<DatePicker aria-label="날짜" value="2026-06-12" onChange={onChange} />);

    fireEvent.click(screen.getByRole('button', { name: '달력 열기' }));
    fireEvent.click(screen.getByRole('button', { name: '2026년 6월 16일' }));

    expect(onChange).toHaveBeenCalledWith('2026-06-16');
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
    expect(screen.queryByRole('grid')).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();

    fireEvent.click(trigger);
    fireEvent.keyDown(screen.getByRole('button', { name: '2026년 6월 15일' }), {
      key: 'Escape',
    });

    expect(screen.queryByRole('grid')).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });
});
