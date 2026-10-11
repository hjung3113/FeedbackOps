import { createFileRoute, useNavigate, useSearch } from '@tanstack/react-router';
import type * as React from 'react';
import { z } from 'zod';

import { HomeScreen, type HomeTab } from '@/features/home/HomeScreen';
import { parseRouteSearch } from '@/lib/router/search';

const homeSearchSchema = z
  .object({
    managedSystem: z.string().uuid().optional(),
    tab: z.enum(['dashboard', 'inbox']).optional(),
  })
  .strict();

export function validateHomeSearch(raw: unknown) {
  return parseRouteSearch(homeSearchSchema, raw);
}

// #982: the router plugin skips code-splitting when the route component is an
// exported local (hasExport check). The alias keeps HomeRoute exported for
// tests while letting the route component split into its own chunk.
const HomeRouteSplit = HomeRoute;

export const Route = createFileRoute('/_authed/home')({
  validateSearch: validateHomeSearch,
  component: HomeRouteSplit,
});

export function HomeRoute(): React.ReactElement {
  const { managedSystem, tab } = useSearch({ strict: false }) as {
    managedSystem?: string;
    tab?: HomeTab;
  };
  const navigate = useNavigate({ from: '/home' });
  const onTabChange = (nextTab: HomeTab): void => {
    void navigate({
      search: (previous) => {
        const { tab: _previousTab, ...rest } = previous;
        return nextTab === 'inbox' ? { ...rest, tab: 'inbox' as const } : rest;
      },
    });
  };
  return (
    <HomeScreen
      {...(managedSystem !== undefined ? { managedSystemId: managedSystem } : {})}
      activeTab={tab ?? 'dashboard'}
      onTabChange={onTabChange}
    />
  );
}
