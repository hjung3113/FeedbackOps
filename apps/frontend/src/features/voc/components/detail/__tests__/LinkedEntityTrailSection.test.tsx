import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { LinkedEntityTrailSection } from '../LinkedEntityTrailSection';

describe('<LinkedEntityTrailSection>', () => {
  it('renders section title', () => {
    render(<LinkedEntityTrailSection />);
    expect(screen.getByText('관련 엔티티')).toBeInTheDocument();
  });

  it('renders LinkedEntityTrail (empty nodes placeholder)', () => {
    const { container } = render(<LinkedEntityTrailSection />);
    // LinkedEntityTrail with nodes=[] — container should be present, no entity nodes
    expect(container.firstChild).not.toBeNull();
  });
});
