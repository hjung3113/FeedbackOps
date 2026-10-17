import { RequestAccessButton } from '@/features/admin/permissions/request-access-button';
import type { RenderRecoveryAccess } from '@/features/integration/public';
import { IntegrationDashboardRoute } from '@/features/integration/routes/IntegrationDashboardRoute';
import { recoverySearchFields } from '@/lib/router/recovery-search';
import { parseRouteSearch } from '@/lib/router/search';
import { createFileRoute } from '@tanstack/react-router';
import { z } from 'zod';

export const integrationDashboardSearchSchema = z
  .object({
    ...recoverySearchFields,
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

const renderRequestAccess: RenderRecoveryAccess = (permission, returnTo) => (
  <RequestAccessButton
    capability={permission.permission}
    managedSystemId={permission.managed_system_id}
    returnRouteIntent={returnTo}
  />
);

export function IntegrationDashboardRouteShell() {
  return <IntegrationDashboardRoute renderRequestAccess={renderRequestAccess} />;
}
