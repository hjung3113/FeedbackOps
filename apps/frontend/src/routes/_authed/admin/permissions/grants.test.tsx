import { QueryClient } from '@tanstack/react-query';
import { createRouter } from '@tanstack/react-router';
import { render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';

import { routeTree } from '@/routeTree.gen';

vi.mock('../../../../features/admin/permissions/permission-gate', () => ({
  PermissionGate: ({ capability, children }: { capability: string; children: ReactNode }) => (
    <div data-testid="permission-gate" data-capability={capability}>
      {children}
    </div>
  ),
}));
vi.mock('../../../../features/admin/permissions/permission-grants-screen', () => ({
  PermissionGrantsScreen: () => <div data-testid="permission-grants-screen" />,
}));

import { validatePermissionGrantsSearch } from '../../../../features/admin/permissions/permission-grants-search';
import { PermissionGrantsConsolePage } from './grants';

const ID = '11111111-1111-4111-8111-111111111111';

describe('/admin/permissions/grants route', () => {
  it('is registered in the route tree and validates only the deny tab and UUID selection', () => {
    const router = createRouter({ routeTree, context: { queryClient: new QueryClient() } });
    const matches = router.matchRoutes('/admin/permissions/grants', {});

    expect(matches.at(-1)?.routeId).toBe('/_authed/admin/permissions/grants');
    expect(validatePermissionGrantsSearch({ tab: 'grants', selected: ID })).toEqual({
      selected: ID,
    });
    expect(validatePermissionGrantsSearch({ tab: 'denies', selected: ID })).toEqual({
      tab: 'denies',
      selected: ID,
    });
    expect(validatePermissionGrantsSearch({ tab: 'unknown', selected: 'bad' })).toEqual({});
  });

  it('renders the screen inside the workspace.admin PermissionGate', () => {
    render(<PermissionGrantsConsolePage />);

    expect(screen.getByTestId('permission-gate')).toHaveAttribute(
      'data-capability',
      'workspace.admin',
    );
    expect(screen.getByTestId('permission-grants-screen')).toBeInTheDocument();
  });
});
