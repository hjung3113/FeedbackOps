import { render, screen } from '@testing-library/react';
import { StatusBadgeFrame } from '../StatusBadgeFrame.js';

describe('StatusBadgeFrame', () => {
  it('keeps the leading indicator decorative while exposing its label', () => {
    render(
      <StatusBadgeFrame
        appearance="reporter"
        indicator={<span aria-hidden="true" data-testid="status-indicator" />}
      >
        접수됨
      </StatusBadgeFrame>,
    );

    expect(screen.getByText('접수됨')).toBeInTheDocument();
    expect(screen.getByTestId('status-indicator')).toHaveAttribute('aria-hidden', 'true');
  });
});
