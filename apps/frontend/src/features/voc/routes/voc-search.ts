// /vocs search schema — owned by the feature layer (admin/permissions
// precedent) so both the route file and VocRouteShell import one definition.
// The route file re-exports these for existing consumers (findings route,
// tests).

import { parseRouteSearch } from '@/lib/router/search';
import { vocTabEnumSchema } from '@fops/shared';
import { z } from 'zod';

export const vocSearchSchema = z
  .object({
    view: z.enum(['inbox', 'my', 'triage']).optional(),
    action: z.enum(['create']).optional(),
    selected: z.string().uuid().optional(),
    managedSystem: z.string().optional(),
    // D-1.1: shared VOC list-query schema owns every supported tab value.
    tab: vocTabEnumSchema.optional(),
    // #821 server-side text search — inbox and my views only. Mirrors the
    // backend's 100-character cap; the list endpoint owns trimming/validation.
    q: z.string().max(100).optional(),
    sort: z
      .enum([
        'created_at:desc',
        'created_at:asc',
        'severity:desc',
        'severity:asc',
        'reporter_facing_status:asc',
      ])
      .optional(),
    // filter.* keys reserved for #20 per-view filters. Declared as explicit
    // dot-keys here to keep .strict() — no open-ended passthrough.
    'filter.severity': z.string().optional(),
    'filter.reporterStatus': z.string().optional(),
    'filter.owner': z.string().optional(),
    'filter.analytics_area': z.literal('unset').optional(),
  })
  .strict(); // reject unknown query keys — prevents link-poisoning as #20 grows

export type VocSearch = z.infer<typeof vocSearchSchema>;

export function validateVocSearch(raw: unknown) {
  return parseRouteSearch(vocSearchSchema, raw);
}

// Lives here (not in VocRouteShell.tsx) so the route file's component import
// pulls nothing but the component — #982 code-splitting severs eager imports
// only when the module exports nothing else the shell needs eagerly.
export const VOC_DEFAULT_VIEW = 'inbox' as const;
