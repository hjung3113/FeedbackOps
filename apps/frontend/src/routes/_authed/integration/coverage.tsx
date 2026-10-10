import { CoverageRoute } from '@/features/integration/routes/CoverageRoute';
import { parseRouteSearch } from '@/lib/router/search';
import { createFileRoute } from '@tanstack/react-router';
import { z } from 'zod';

// docs/frontend/routes-and-layout.md: /integration/coverage?managedSystem=:managedSystemId|all
export const integrationCoverageSearchSchema = z
  .object({
    managedSystem: z.union([z.string().uuid(), z.literal('all')]).optional(),
  })
  .strict();

export function validateIntegrationCoverageSearch(raw: unknown) {
  return parseRouteSearch(integrationCoverageSearchSchema, raw);
}

// #982: the router plugin skips code-splitting when the route component is an
// exported local (hasExport check). The alias keeps the shell exported for
// tests while letting the route component split into its own chunk.
const IntegrationCoverageRouteShellSplit = IntegrationCoverageRouteShell;

export const Route = createFileRoute('/_authed/integration/coverage')({
  validateSearch: validateIntegrationCoverageSearch,
  component: IntegrationCoverageRouteShellSplit,
});

export function IntegrationCoverageRouteShell() {
  return <CoverageRoute />;
}
