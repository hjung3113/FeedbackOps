import { LinksRoute } from '@/features/integration/routes/LinksRoute';
import { ListShell } from '@fops/ui';
import { parseRouteSearch } from '@/lib/router/search';
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

export const Route = createFileRoute('/_authed/integration/links')({
  validateSearch: validateIntegrationLinksSearch,
  component: IntegrationLinksRouteShell,
});

export function IntegrationLinksRouteShell() {
  return <ListShell list={<LinksRoute />} />;
}
