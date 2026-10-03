// AttachButton.test.tsx — PLAN-22 C8.
//
// Pure-UI tests for the Attach toolbar button (no editor, no upload API).
// Behavior covered:
//   - accessible label + role
//   - opens the hidden file picker on click
//   - keyboard activation (Enter / Space)
//   - calls onPick with the selected File
//   - shows a loading state while onPick's promise is pending
//   - disabled prop blocks both click and keyboard activation
//   - focus-visible ring on tab-in (a11y)

import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { AttachButton } from '../toolbar/AttachButton';

function pickFile(input: HTMLInputElement, file: File): void {
  Object.defineProperty(input, 'files', {
    value: [file],
    configurable: true,
  });
  fireEvent.change(input);
}

describe('AttachButton', () => {
  it('renders with the attach icon and aria-label "첨부 파일 추가"', () => {
    render(<AttachButton onPick={vi.fn()} data-testid="attach" />);
    const btn = screen.getByRole('button', { name: '첨부 파일 추가' });
    expect(btn).toBeInTheDocument();
    // Hidden file input rendered as sibling.
    expect(screen.getByTestId('attach-input')).toBeInTheDocument();
  });

  it('opens the file picker on click', () => {
    render(<AttachButton onPick={vi.fn()} data-testid="attach" />);
    const input = screen.getByTestId('attach-input') as HTMLInputElement;
    const clickSpy = vi.spyOn(input, 'click');
    fireEvent.click(screen.getByRole('button', { name: '첨부 파일 추가' }));
    expect(clickSpy).toHaveBeenCalledTimes(1);
  });

  it('activates on Enter and Space keypress', () => {
    render(<AttachButton onPick={vi.fn()} data-testid="attach" />);
    const input = screen.getByTestId('attach-input') as HTMLInputElement;
    const clickSpy = vi.spyOn(input, 'click');
    const btn = screen.getByRole('button', { name: '첨부 파일 추가' });
    fireEvent.keyDown(btn, { key: 'Enter' });
    fireEvent.keyDown(btn, { key: ' ' });
    expect(clickSpy).toHaveBeenCalledTimes(2);
  });

  it('calls onPick with the selected File', () => {
    const onPick = vi.fn();
    render(<AttachButton onPick={onPick} data-testid="attach" />);
    const file = new File(['hello'], 'note.txt', { type: 'text/plain' });
    pickFile(screen.getByTestId('attach-input') as HTMLInputElement, file);
    expect(onPick).toHaveBeenCalledWith(file);
  });

  it('shows a loading state while onPick is pending and re-enables on resolve', async () => {
    let resolve: (() => void) | undefined;
    const onPick = vi.fn(
      () =>
        new Promise<void>((r) => {
          resolve = r;
        }),
    );
    render(<AttachButton onPick={onPick} data-testid="attach" />);
    const btn = screen.getByRole('button', { name: '첨부 파일 추가' });
    const file = new File(['x'], 'x.png', { type: 'image/png' });
    pickFile(screen.getByTestId('attach-input') as HTMLInputElement, file);

    await waitFor(() => {
      expect(btn).toHaveAttribute('aria-busy', 'true');
      expect(btn).toBeDisabled();
    });

    resolve?.();
    await waitFor(() => {
      expect(btn).not.toHaveAttribute('aria-busy');
      expect(btn).not.toBeDisabled();
    });
  });

  it('clears the input value so re-picking the same file fires onPick again', () => {
    const onPick = vi.fn();
    render(<AttachButton onPick={onPick} data-testid="attach" />);
    const input = screen.getByTestId('attach-input') as HTMLInputElement;
    const file = new File(['x'], 'x.txt', { type: 'text/plain' });
    pickFile(input, file);
    expect(input.value).toBe('');
    expect(onPick).toHaveBeenCalledTimes(1);
  });

  it('does not open the picker when disabled', () => {
    render(<AttachButton onPick={vi.fn()} disabled data-testid="attach" />);
    const input = screen.getByTestId('attach-input') as HTMLInputElement;
    const clickSpy = vi.spyOn(input, 'click');
    const btn = screen.getByRole('button', { name: '첨부 파일 추가' });
    fireEvent.click(btn);
    fireEvent.keyDown(btn, { key: 'Enter' });
    expect(clickSpy).not.toHaveBeenCalled();
    expect(btn).toBeDisabled();
  });

  it('forwards `accept` to the file input as a MIME hint', () => {
    render(
      <AttachButton onPick={vi.fn()} accept="image/png,image/jpeg" data-testid="attach" />,
    );
    expect(screen.getByTestId('attach-input')).toHaveAttribute(
      'accept',
      'image/png,image/jpeg',
    );
  });

  it('a11y: button role and focus-visible ring class present', () => {
    render(<AttachButton onPick={vi.fn()} data-testid="attach" />);
    const btn = screen.getByRole('button', { name: '첨부 파일 추가' });
    expect(btn.className).toMatch(/focus-visible:ring/);
  });
});
