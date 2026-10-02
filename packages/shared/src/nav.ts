import { z } from 'zod';

// GET /nav/resolve — display id → route intent for the command palette
// (issue #731). The response carries only the record identity and where to
// navigate; no title or other record content (the palette shows the display id).

export const navRouteIntentSchema = z
  .object({
    route: z.string(),
    search: z.record(z.string()),
  })
  .strict();
export type NavRouteIntent = z.infer<typeof navRouteIntentSchema>;

export const navResolveResponseSchema = z
  .object({
    entity_type: z.enum(['voc', 'finding', 'task_request', 'task']),
    id: z.string().uuid(),
    display_id: z.string(),
    route_intent: navRouteIntentSchema,
  })
  .strict();
export type NavResolveResponse = z.infer<typeof navResolveResponseSchema>;
