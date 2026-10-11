import { IntegrationDashboardRoute } from '@/features/integration/routes/IntegrationDashboardRoute';
import { parseRouteSearch } from '@/lib/router/search';
import { createFileRoute } from '@tanstack/react-router';
import { z } from 'zod';

export const integrationDashboardSearchSchema = z
  .object({
    managedSystem: z.union([z.string().uuid(), z.literal('all')]).optional(),
  })
  .strict();

export function validateIntegrationDashboardSearch(raw: unknown) {
  return parseRouteSearch(integrationDashboardSearchSchema, raw);
}

// #982: the router plugin skips code-splitting when the route component is an
// exported local (hasExport check). The alias keeps the shell exported for
// tests while letting the route component split into its own chunk.
const IntegrationDashboardRouteShellSplit = IntegrationDashboardRouteShell;

export const Route = createFileRoute('/_authed/integration/')({
  validateSearch: validateIntegrationDashboardSearch,
  component: IntegrationDashboardRouteShellSplit,
});

export function IntegrationDashboardRouteShell() {
  return <IntegrationDashboardRoute />;
}
