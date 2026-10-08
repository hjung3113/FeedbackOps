/// <reference types="@testing-library/jest-dom" />
import { createEvent, fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from '../../components/shadcn/dialog.js';
import { SearchInput } from '../SearchInput.js';

describe('SearchInput', () => {
  it('renders an input element', () => {
    render(<SearchInput />);
    expect(screen.getByRole('textbox')).toBeInTheDocument();
  });

  it('input has disabled attribute', () => {
    render(<SearchInput />);
    const input = screen.getByRole('textbox');
    expect(input).toBeDisabled();
  });

  it('input has aria-disabled="true"', () => {
    render(<SearchInput />);
    const input = screen.getByRole('textbox');
    expect(input).toHaveAttribute('aria-disabled', 'true');
  });

  it('renders default Korean placeholder', () => {
    render(<SearchInput />);
    const input = screen.getByRole('textbox');
    expect(input).toHaveAttribute('placeholder', 'VOC 검색…');
  });

  it('accepts custom placeholder', () => {
    render(<SearchInput placeholder="검색..." />);
    const input = screen.getByRole('textbox');
    expect(input).toHaveAttribute('placeholder', '검색...');
  });

  it('wrapper span has tabIndex=0 (tooltip focusable wrapper)', () => {
    const { container } = render(<SearchInput />);
    const wrapper = container.querySelector('span[tabindex="0"]');
    expect(wrapper).not.toBeNull();
  });

  it('wrapper span has cursor-not-allowed class', () => {
    const { container } = render(<SearchInput />);
    const wrapper = container.querySelector('span[tabindex="0"]');
    expect(wrapper?.className).toContain('cursor-not-allowed');
  });

  it('renders a Search icon (svg)', () => {
    const { container } = render(<SearchInput />);
    const svg = container.querySelector('svg');
    expect(svg).not.toBeNull();
  });
});

describe('SearchInput controlled mode (#821)', () => {
  it('renders an enabled search input labelled by the placeholder', () => {
    render(<SearchInput placeholder="필터, 키워드…" value="" onValueChange={() => {}} />);
    const input = screen.getByRole('searchbox', { name: '필터, 키워드…' });
    expect(input).toBeEnabled();
    expect(input).toHaveAttribute('type', 'search');
    expect(input).toHaveAttribute('placeholder', '필터, 키워드…');
  });

  it('keeps the search icon in controlled mode', () => {
    const { container } = render(<SearchInput value="" onValueChange={() => {}} />);
    expect(container.querySelector('svg')).not.toBeNull();
  });

  it('calls onValueChange when the value changes', () => {
    const onValueChange = vi.fn();
    const { rerender } = render(<SearchInput value="" onValueChange={onValueChange} />);
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: '로그인' } });
    expect(onValueChange).toHaveBeenCalledWith('로그인');

    // Controlled value flows back through the prop.
    rerender(<SearchInput value="로그인" onValueChange={onValueChange} />);
    expect(screen.getByRole('searchbox')).toHaveValue('로그인');
  });

  it('Escape on a non-empty value clears it and prevents default', () => {
    const onValueChange = vi.fn();
    render(<SearchInput value="로그인" onValueChange={onValueChange} />);
    const input = screen.getByRole('searchbox');
    const event = createEvent.keyDown(input, { key: 'Escape' });
    const preventedDefault = !fireEvent(input, event);
    expect(preventedDefault).toBe(true);
    expect(onValueChange).toHaveBeenCalledWith('');
  });

  it('Escape on an empty value does nothing', () => {
    const onValueChange = vi.fn();
    render(<SearchInput value="" onValueChange={onValueChange} />);
    fireEvent.keyDown(screen.getByRole('searchbox'), { key: 'Escape' });
    expect(onValueChange).not.toHaveBeenCalled();
  });

  it('inside a Radix Dialog, one Escape closes the dialog and does not clear the box', () => {
    const valueChanges: string[] = [];
    function DialogHarness() {
      const [open, setOpen] = useState(true);
      const [value, setValue] = useState('로그인');
      return (
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogContent>
            <DialogTitle>대화상자</DialogTitle>
            <DialogDescription>대화상자 안의 검색 상자</DialogDescription>
            <SearchInput
              placeholder="대화상자 검색…"
              value={value}
              onValueChange={(next) => {
                valueChanges.push(next);
                setValue(next);
              }}
            />
          </DialogContent>
        </Dialog>
      );
    }
    render(<DialogHarness />);

    fireEvent.keyDown(screen.getByRole('searchbox', { name: '대화상자 검색…' }), {
      key: 'Escape',
    });

    // The dialog dismissed; the search box kept its value — one key did not
    // do both jobs.
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(valueChanges).toEqual([]);
  });
});

describe('SearchInput onCommit (#864)', () => {
  it.each([
    ['Enter', (input: HTMLElement) => fireEvent.keyDown(input, { key: 'Enter' })],
    ['blur', (input: HTMLElement) => fireEvent.blur(input)],
  ])('calls onCommit on %s', (_trigger, commit) => {
    const onCommit = vi.fn();
    render(<SearchInput value="로그인" onValueChange={() => {}} onCommit={onCommit} />);
    commit(screen.getByRole('searchbox'));
    expect(onCommit).toHaveBeenCalledTimes(1);
  });

  it('does not call onCommit while typing', () => {
    const onCommit = vi.fn();
    const onValueChange = vi.fn();
    render(<SearchInput value="" onValueChange={onValueChange} onCommit={onCommit} />);
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: '로그인' } });
    expect(onValueChange).toHaveBeenCalledWith('로그인');
    expect(onCommit).not.toHaveBeenCalled();
  });

  it('Escape clears the box but does not call onCommit', () => {
    const onCommit = vi.fn();
    const onValueChange = vi.fn();
    render(<SearchInput value="로그인" onValueChange={onValueChange} onCommit={onCommit} />);
    fireEvent.keyDown(screen.getByRole('searchbox'), { key: 'Escape' });
    expect(onValueChange).toHaveBeenCalledWith('');
    expect(onCommit).not.toHaveBeenCalled();
  });
});
