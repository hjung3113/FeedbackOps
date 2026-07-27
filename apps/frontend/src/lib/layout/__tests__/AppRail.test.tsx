import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { AppRail, railForPathname } from '../AppRail';

describe('AppRail', () => {
  it.each([
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
});
