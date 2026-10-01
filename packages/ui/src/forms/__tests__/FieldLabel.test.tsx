/// <reference types="@testing-library/jest-dom" />
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { FieldLabel } from '../FieldLabel.js';

describe('FieldLabel', () => {
  it('renders children', () => {
    render(<FieldLabel>이메일 주소</FieldLabel>);
    expect(screen.getByText('이메일 주소')).toBeInTheDocument();
  });

  it('renders a red asterisk when required is true', () => {
    render(<FieldLabel required>필수 항목</FieldLabel>);
    // The asterisk is rendered with aria-hidden, find it by its text content
    const asterisk = document.querySelector('[aria-hidden="true"]');
    expect(asterisk).not.toBeNull();
    expect(asterisk?.textContent).toBe('*');
  });

  it('does not render an asterisk when required is false', () => {
    render(<FieldLabel required={false}>선택 항목</FieldLabel>);
    const asterisks = document.querySelectorAll('[aria-hidden="true"]');
    // No asterisk span should be present
    const asteriskSpans = Array.from(asterisks).filter((el) => el.textContent === '*');
    expect(asteriskSpans).toHaveLength(0);
  });

  it('renders the tip trigger element when tip prop is provided', () => {
    render(<FieldLabel tip="도움말 내용">레이블</FieldLabel>);
    expect(screen.getByTestId('field-label-tip-trigger')).toBeInTheDocument();
  });

  it('opens help from keyboard focus and closes it with Escape without affecting the field', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();

    render(
      <form
        onSubmit={(event) => {
          event.preventDefault();
          onSubmit();
        }}
      >
        <button type="button">앞 컨트롤</button>
        <FieldLabel htmlFor="field-input" tip="도움말 내용">
          레이블
        </FieldLabel>
        <input id="field-input" />
      </form>,
    );

    const tipTrigger = screen.getByRole('button', { name: '도움말: 도움말 내용' });
    await user.tab();
    expect(screen.getByRole('button', { name: '앞 컨트롤' })).toHaveFocus();
    await user.tab();
    expect(tipTrigger).toHaveFocus();
    expect(tipTrigger).toHaveAttribute('type', 'button');
    expect(tipTrigger).toHaveClass('focus-visible:ring-focus-ring');
    expect(await screen.findByRole('tooltip')).toHaveTextContent('도움말 내용');

    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('tooltip')).not.toBeInTheDocument());

    await user.click(screen.getByText('레이블', { selector: 'label' }));
    expect(screen.getByRole('textbox')).toHaveFocus();
    await user.click(tipTrigger);
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('does not render a tip trigger when tip is not provided', () => {
    render(<FieldLabel>레이블</FieldLabel>);
    expect(screen.queryByTestId('field-label-tip-trigger')).toBeNull();
  });

  it('forwards className and other props to the underlying Label', () => {
    render(
      <FieldLabel className="custom-class" htmlFor="input-id">
        레이블
      </FieldLabel>,
    );
    const label = screen.getByText('레이블').closest('label');
    expect(label).toHaveAttribute('for', 'input-id');
    expect(label?.className).toContain('custom-class');
  });
});
