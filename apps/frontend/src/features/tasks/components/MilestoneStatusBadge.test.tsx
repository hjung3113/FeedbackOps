import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { MilestoneStatusBadge } from './MilestoneStatusBadge';

describe('MilestoneStatusBadge', () => {
  it('keeps the blocked label token, exact tint, and decorative dot', () => {
    render(<MilestoneStatusBadge status="blocked" />);

    const badge = screen.getByText('차단').closest('[data-token]') as HTMLElement;
    expect(badge).toHaveAttribute('data-token', '--text-danger');
    expect(badge).toHaveClass('text-text-danger-label');
    expect(badge.style.getPropertyValue('--status-badge-tint')).toBe(
      'rgb(var(--text-danger) / 0.12)',
    );
    expect(badge?.querySelector('[aria-hidden="true"]')).toHaveAttribute('aria-hidden', 'true');
  });
});
