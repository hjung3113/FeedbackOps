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

export const Route = createFileRoute('/_authed/integration/')({
  validateSearch: validateIntegrationDashboardSearch,
  component: IntegrationDashboardRouteShell,
});

export function IntegrationDashboardRouteShell() {
  return <IntegrationDashboardRoute />;
}
