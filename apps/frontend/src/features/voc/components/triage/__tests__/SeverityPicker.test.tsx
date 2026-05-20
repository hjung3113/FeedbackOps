// SeverityPicker.test.tsx — TDD RED tests for the severity chip grid.
// Prototype ref: screen-voc-create.jsx:444-464
// 4 chips (low / medium / high / critical), color bar, tooltips, onChange.

import * as React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { SeverityPicker } from '../SeverityPicker';

describe('SeverityPicker', () => {
  it('renders all 4 severity chips', () => {
    render(<SeverityPicker value={null} onChange={vi.fn()} />);
    expect(screen.getByRole('button', { name: /low/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /medium/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /high/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /critical/i })).toBeInTheDocument();
  });

  it('calls onChange with the selected severity when a chip is clicked', () => {
    const onChange = vi.fn();
    render(<SeverityPicker value={null} onChange={onChange} />);
    fireEvent.click(screen.getByRole('button', { name: /high/i }));
    expect(onChange).toHaveBeenCalledWith('high');
  });

  it('marks the active chip with data-active="true"', () => {
    render(<SeverityPicker value="critical" onChange={vi.fn()} />);
    const criticalBtn = screen.getByRole('button', { name: /critical/i });
    expect(criticalBtn).toHaveAttribute('data-active', 'true');
    // others should not be active
    expect(screen.getByRole('button', { name: /low/i })).toHaveAttribute('data-active', 'false');
  });

  it('disables all chips when disabled prop is true', () => {
    render(<SeverityPicker value={null} onChange={vi.fn()} disabled />);
    const buttons = screen.getAllByRole('button');
    for (const btn of buttons) {
      expect(btn).toBeDisabled();
    }
  });
});
