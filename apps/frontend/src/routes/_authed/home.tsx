import { createFileRoute, useNavigate, useSearch } from '@tanstack/react-router';
import { z } from 'zod';
import type * as React from 'react';

import { HomeScreen, type HomeTab } from '@/features/home/HomeScreen';

const homeSearchSchema = z
  .object({
    managedSystem: z.string().uuid().optional(),
    tab: z.enum(['dashboard', 'inbox']).optional(),
  })
  .strict();

export const Route = createFileRoute('/_authed/home')({
  validateSearch: (raw) => homeSearchSchema.parse(raw),
  component: HomeRoute,
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
        const search = { ...previous };
        if (nextTab === 'inbox') search.tab = 'inbox';
        else delete search.tab;
        return search;
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
