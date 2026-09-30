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

export const Route = createFileRoute('/_authed/integration/coverage')({
  validateSearch: validateIntegrationCoverageSearch,
  component: IntegrationCoverageRouteShell,
});

export function IntegrationCoverageRouteShell() {
  return <CoverageRoute />;
}
