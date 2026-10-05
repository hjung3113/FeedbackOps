import { render, screen } from '@testing-library/react';
import { ToolbarKicker } from '../ToolbarKicker.js';

describe('ToolbarKicker', () => {
  it('renders the route label, name, and decorative separator', () => {
    render(<ToolbarKicker label="콘솔" name="Triage" />);

    expect(screen.getByText('콘솔')).toBeInTheDocument();
    expect(screen.getByText('Triage')).toBeInTheDocument();
    expect(screen.getByText('·')).toHaveAttribute('aria-hidden', 'true');
  });
});
