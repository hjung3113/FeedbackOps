import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { MilestoneStatusBadge } from './MilestoneStatusBadge';

describe('MilestoneStatusBadge', () => {
  it('keeps the blocked state token and decorative dot', () => {
    render(<MilestoneStatusBadge status="blocked" />);

    const badge = screen.getByText('차단').closest('[data-token]');
    expect(badge).toHaveAttribute('data-token', '--text-danger');
    expect(badge?.querySelector('[aria-hidden="true"]')).toHaveAttribute('aria-hidden', 'true');
  });
});
