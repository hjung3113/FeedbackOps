import { LinksRoute } from '@/features/integration/routes/LinksRoute';
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

export const Route = createFileRoute('/_authed/integration/links')({
  validateSearch: (raw) => integrationLinksSearchSchema.parse(raw),
  component: IntegrationLinksRouteShell,
});

export function IntegrationLinksRouteShell() {
  return <ListShell list={<LinksRoute />} />;
}
