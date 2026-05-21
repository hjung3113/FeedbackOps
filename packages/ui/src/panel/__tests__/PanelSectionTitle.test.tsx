/// <reference types="@testing-library/jest-dom" />
import * as React from 'react';
import { render, screen } from '@testing-library/react';
import { PanelSectionTitle } from '../PanelSectionTitle.js';

describe('PanelSectionTitle', () => {
  it('renders children text', () => {
    render(<PanelSectionTitle>트리아지</PanelSectionTitle>);
    expect(screen.getByText('트리아지')).toBeInTheDocument();
  });

  it('renders as an h3 element for a11y', () => {
    render(<PanelSectionTitle>섹션 제목</PanelSectionTitle>);
    expect(screen.getByRole('heading', { level: 3 })).toBeInTheDocument();
  });

  it('has uppercase tracking-wide font-semibold typography classes', () => {
    const { container } = render(<PanelSectionTitle>타이틀</PanelSectionTitle>);
    const el = container.querySelector('h3');
    expect(el).toHaveClass('uppercase');
    expect(el).toHaveClass('tracking-wide');
    expect(el).toHaveClass('font-semibold');
    expect(el).toHaveClass('text-text-muted');
  });

  it('renders borderless (no border-t, no top/bottom padding) per V1b document rhythm', () => {
    const { container } = render(<PanelSectionTitle>타이틀</PanelSectionTitle>);
    const el = container.querySelector('h3');
    expect(el).not.toHaveClass('border-t');
    expect(el).not.toHaveClass('border-border-subtle');
    expect(el).not.toHaveClass('pt-4');
    expect(el).not.toHaveClass('pb-2');
    expect(el).not.toHaveClass('px-4');
  });

  it('applies 14px bottom margin (mb-3.5) for prototype rhythm', () => {
    const { container } = render(<PanelSectionTitle>타이틀</PanelSectionTitle>);
    const el = container.querySelector('h3');
    expect(el).toHaveClass('mb-3.5');
  });

  it('applies custom className', () => {
    const { container } = render(
      <PanelSectionTitle className="custom-title">타이틀</PanelSectionTitle>,
    );
    expect(container.querySelector('h3')).toHaveClass('custom-title');
  });
});
