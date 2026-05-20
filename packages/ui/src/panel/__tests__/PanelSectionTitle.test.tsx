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

  it('has uppercase tracking-wide classes', () => {
    const { container } = render(<PanelSectionTitle>타이틀</PanelSectionTitle>);
    const el = container.querySelector('h3');
    expect(el).toHaveClass('uppercase');
    expect(el).toHaveClass('tracking-wide');
  });

  it('has border-t border-border-subtle classes', () => {
    const { container } = render(<PanelSectionTitle>타이틀</PanelSectionTitle>);
    const el = container.querySelector('h3');
    expect(el).toHaveClass('border-t');
    expect(el).toHaveClass('border-border-subtle');
  });

  it('applies custom className', () => {
    const { container } = render(
      <PanelSectionTitle className="custom-title">타이틀</PanelSectionTitle>,
    );
    expect(container.querySelector('h3')).toHaveClass('custom-title');
  });
});
