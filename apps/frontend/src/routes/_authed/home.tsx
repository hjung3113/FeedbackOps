import { createFileRoute, useSearch } from '@tanstack/react-router';
import { z } from 'zod';
import type * as React from 'react';

import { HomeScreen } from '@/features/home/HomeScreen';

const homeSearchSchema = z.object({ managedSystem: z.string().uuid().optional() }).strict();

export const Route = createFileRoute('/_authed/home')({
  validateSearch: (raw) => homeSearchSchema.parse(raw),
  component: HomeRoute,
});

export function HomeRoute(): React.ReactElement {
  const { managedSystem } = useSearch({ strict: false }) as { managedSystem?: string };
  return <HomeScreen {...(managedSystem !== undefined ? { managedSystemId: managedSystem } : {})} />;
}
