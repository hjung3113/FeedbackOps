/// <reference types="@testing-library/jest-dom" />
import * as React from 'react';
import { render, screen } from '@testing-library/react';
import { OutlineBadge } from '../OutlineBadge.js';

describe('OutlineBadge', () => {
  it('renders children', () => {
    render(<OutlineBadge>VOC-1234</OutlineBadge>);
    expect(screen.getByText('VOC-1234')).toBeInTheDocument();
  });

  it('forwards className', () => {
    render(<OutlineBadge className="custom-class">Label</OutlineBadge>);
    const el = screen.getByText('Label');
    expect(el.className).toContain('custom-class');
  });

  it('forwards arbitrary HTML attributes', () => {
    render(<OutlineBadge data-testid="my-badge">Badge</OutlineBadge>);
    expect(screen.getByTestId('my-badge')).toBeInTheDocument();
  });
});
