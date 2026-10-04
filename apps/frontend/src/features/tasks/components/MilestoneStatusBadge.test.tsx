import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { MilestoneStatusBadge } from './MilestoneStatusBadge';

describe('MilestoneStatusBadge', () => {
  it('uses the AA danger label color while keeping the base tint and dot', () => {
    render(<MilestoneStatusBadge status="blocked" />);

    const badge = screen.getByText('차단').closest('[data-token]');
    expect(badge).toHaveAttribute('data-token', '--text-danger');
    expect(badge).toHaveStyle({ color: 'rgb(var(--text-danger-label) / 1)' });
    expect(badge).toHaveAttribute(
      'style',
      expect.stringContaining('background-color: rgb(var(--text-danger) / 0.12)'),
    );
    expect(badge?.querySelector('[aria-hidden="true"]')).toHaveAttribute(
      'style',
      expect.stringContaining('background-color: rgb(var(--text-danger) / 1)'),
    );
  });
});
