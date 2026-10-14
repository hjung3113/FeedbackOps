import { render, screen } from '@testing-library/react';
import { expect, it } from 'vitest';
import { IntegrationJumpCard } from '../components/IntegrationDashboardCards';
it.each(['', '&managedSystem=a1111111-1111-4111-8111-111111111111'])(
  'keeps the primary anchor and renders a sibling Area link %s',
  (scope) => {
    render(
      <IntegrationJumpCard
        href="/integration/coverage"
        title="Coverage"
        description="coverage"
        icon={null}
        testId="coverage-card"
        secondaryLink={{
          href: `/integration/coverage?view=areas${scope}`,
          label: 'Analytics Area별 현황',
        }}
      />,
    );
    const primary = screen.getByTestId('coverage-card');
    const secondary = screen.getByRole('link', { name: 'Analytics Area별 현황' });
    expect(primary).toHaveAttribute('href', '/integration/coverage');
    expect(secondary).toHaveAttribute('href', `/integration/coverage?view=areas${scope}`);
    expect(primary.contains(secondary)).toBe(false);
    expect(primary.parentElement).toHaveClass('relative');
    expect(secondary).toHaveClass('absolute', 'bottom-4', 'right-4');
    expect(secondary.querySelector('svg')).toHaveAttribute('aria-hidden', 'true');
  },
);
