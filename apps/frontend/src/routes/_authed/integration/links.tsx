import { LinksRoute } from '@/features/integration/routes/LinksRoute';
import { parseRouteSearch } from '@/lib/router/search';
import { ListShell } from '@fops/ui';
import { createFileRoute } from '@tanstack/react-router';
import { z } from 'zod';

export const integrationLinksSearchSchema = z
  .object({
    status: z.enum(['active', 'stale', 'detached', 'revoked']).optional(),
    type: z.enum(['related_to']).optional(),
    managedSystem: z.string().optional(),
  })
  .strict();

export function validateIntegrationLinksSearch(raw: unknown) {
  return parseRouteSearch(integrationLinksSearchSchema, raw);
}

// #982: the router plugin skips code-splitting when the route component is an
// exported local (hasExport check). The alias keeps the shell exported for
// tests while letting the route component split into its own chunk.
const IntegrationLinksRouteShellSplit = IntegrationLinksRouteShell;

export const Route = createFileRoute('/_authed/integration/links')({
  validateSearch: validateIntegrationLinksSearch,
  component: IntegrationLinksRouteShellSplit,
});

export function IntegrationLinksRouteShell() {
  return <ListShell list={<LinksRoute />} />;
}
