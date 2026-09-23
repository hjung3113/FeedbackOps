import { z } from 'zod';

// List filters + selection are URL state (docs/frontend/routes-and-layout.md
// §URL State Rules): /admin/analytics-areas?managedSystem=:uuid&includeArchived=true&selected=:uuid.
// Defaults (all MS / archived hidden / nothing selected) are omitted from the
// URL. Keys are camelCase URL keys; the API keeps its own snake_case params.
export const analyticsAreasSearchSchema = z
  .object({
    managedSystem: z.string().uuid().optional(),
    includeArchived: z.boolean().optional(),
    selected: z.string().uuid().optional(),
  })
  .strict();

export type AnalyticsAreasSearch = z.infer<typeof analyticsAreasSearchSchema>;
