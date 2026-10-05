import { render, screen } from '@testing-library/react';
import { ProgressMeter } from '../ProgressMeter.js';

describe('ProgressMeter', () => {
  it('preserves plain, labeled, and decorative accessibility semantics', () => {
    const { rerender, container } = render(
      <ProgressMeter value={42} semantics={{ role: 'meter', label: 'Coverage' }} />,
    );

    expect(screen.getByRole('meter', { name: 'Coverage' })).toHaveAttribute('aria-valuenow', '42');
    expect(container.firstElementChild?.firstElementChild).toHaveStyle({
      '--progress-meter-width': '42%',
    });

    rerender(<ProgressMeter value={80} />);
    expect(screen.queryByRole('meter')).not.toBeInTheDocument();
    expect(container.firstElementChild).not.toHaveAttribute('aria-hidden');

    rerender(<ProgressMeter value={25} semantics="decorative" />);
    expect(container.firstElementChild).toHaveAttribute('aria-hidden', 'true');
  });
});
