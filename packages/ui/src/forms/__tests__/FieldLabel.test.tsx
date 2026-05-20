/// <reference types="@testing-library/jest-dom" />
import * as React from 'react';
import { render, screen } from '@testing-library/react';
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
    const asteriskSpans = Array.from(asterisks).filter(
      (el) => el.textContent === '*',
    );
    expect(asteriskSpans).toHaveLength(0);
  });

  it('renders the tip trigger element when tip prop is provided', () => {
    render(<FieldLabel tip="도움말 내용">레이블</FieldLabel>);
    expect(screen.getByTestId('field-label-tip-trigger')).toBeInTheDocument();
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
