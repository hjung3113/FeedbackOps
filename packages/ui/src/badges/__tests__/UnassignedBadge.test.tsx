import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { UnassignedBadge } from '../UnassignedBadge';

describe('UnassignedBadge', () => {
  it('uses the Korean owner label and danger tone by default', () => {
    render(<UnassignedBadge />);

    expect(screen.getByText('담당자 없음')).toHaveClass(
      'bg-accent-danger/10',
      'text-accent-danger',
    );
  });

  it('accepts the reviewer label', () => {
    render(<UnassignedBadge label="검토자 없음" />);

    expect(screen.getByText('검토자 없음')).toBeInTheDocument();
  });
});
