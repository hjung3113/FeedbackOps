import { render, screen } from '@testing-library/react';
import { ManagedSystemMark } from '../ManagedSystemMark.js';

describe('ManagedSystemMark', () => {
  it('renders the supplied initials decoratively at the requested size', () => {
    render(
      <ManagedSystemMark label="PB" color="rgb(var(--managed-system-power-bi) / 1)" size={22} />,
    );

    expect(screen.getByText('PB')).toHaveAttribute('aria-hidden', 'true');
  });
});
