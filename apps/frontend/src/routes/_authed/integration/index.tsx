import { IntegrationDashboardRoute } from '@/features/integration/routes/IntegrationDashboardRoute';
import { createFileRoute } from '@tanstack/react-router';
import { z } from 'zod';

export const integrationDashboardSearchSchema = z
  .object({
    managedSystem: z.union([z.string().uuid(), z.literal('all')]).optional(),
  })
  .strict();

export const Route = createFileRoute('/_authed/integration/')({
  validateSearch: (raw) => integrationDashboardSearchSchema.parse(raw),
  component: IntegrationDashboardRouteShell,
});

export function IntegrationDashboardRouteShell() {
  return <IntegrationDashboardRoute />;
}
