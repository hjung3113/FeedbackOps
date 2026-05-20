/// <reference types="@testing-library/jest-dom" />
import * as React from 'react';
import { render, screen } from '@testing-library/react';
import { FieldRow } from '../FieldRow.js';

describe('FieldRow', () => {
  it('renders label text', () => {
    render(<FieldRow label="담당자">Alice</FieldRow>);
    expect(screen.getByText('담당자')).toBeInTheDocument();
  });

  it('renders children value', () => {
    render(<FieldRow label="심각도">높음</FieldRow>);
    expect(screen.getByText('높음')).toBeInTheDocument();
  });

  it('label has text-text-muted class', () => {
    const { container } = render(<FieldRow label="라벨">값</FieldRow>);
    const label = container.querySelector('.text-text-muted');
    expect(label).not.toBeNull();
    expect(label).toHaveTextContent('라벨');
  });

  it('value side has text-right class', () => {
    const { container } = render(<FieldRow label="라벨">값</FieldRow>);
    const value = container.querySelector('.text-right');
    expect(value).not.toBeNull();
  });

  it('applies custom className to row', () => {
    const { container } = render(<FieldRow label="l" className="custom-row">v</FieldRow>);
    expect(container.firstElementChild).toHaveClass('custom-row');
  });

  it('renders ReactNode children', () => {
    render(
      <FieldRow label="상태">
        <span data-testid="node-val">활성</span>
      </FieldRow>,
    );
    expect(screen.getByTestId('node-val')).toBeInTheDocument();
  });
});
