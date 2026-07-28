import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { AppRail, railForPathname } from '../AppRail';

describe('AppRail', () => {
  it.each([
    ['/home', 'home'],
    ['/vocs?view=inbox', 'voc'],
    ['/voc-clusters', 'voc'],
    ['/findings', 'findings'],
    ['/tasks?view=board', 'tasks'],
    ['/integration/links', 'integration'],
    ['/surveys', 'surveys'],
    ['/admin/settings', 'admin'],
  ] as const)('marks %s as the active %s rail', (pathname, domain) => {
    render(<AppRail activeDomain={railForPathname(pathname)} />);
    expect(screen.getByTestId(`rail-${domain}`)).toHaveAttribute('aria-current', 'page');
  });

  it('keeps Home as the first rail entry', () => {
    expect(screen.queryByTestId('rail-home')).toBeNull();
    render(<AppRail activeDomain="home" />);
    const railButtons = screen.getAllByRole('link');
    expect(railButtons[0]).toHaveAttribute('data-testid', 'rail-home');
  });
});
