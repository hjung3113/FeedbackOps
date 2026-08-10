import { z } from 'zod';

import { reporterFacingStatusEnumSchema, severityEnumSchema } from './list-item.js';

// Filter keys use dot notation (e.g. `filter.severity`) because Fastify query
// params are flat strings. The route layer passes the raw query object directly
// to this schema — zod reads the literal key `'filter.severity'` from the flat
// record. This avoids a preprocessing step and keeps Fastify's query typings
// simple. The dot keys are documented here so readers don't mistake them for
// nested objects.

function commaListOf<T extends z.ZodTypeAny>(itemSchema: T) {
  return z
    .string()
    .transform((s) =>
      // Drop empty tokens that arise from trailing/leading commas.
      s
        .split(',')
        .map((t) => t.trim())
        .filter((t) => t.length > 0),
    )
    .pipe(
      z
        .array(itemSchema)
        .max(10, 'filter may contain at most 10 comma-separated values'),
    );
}

export const vocTabEnumSchema = z.enum([
  'untriaged',
  'high',
  'unassigned',
  'similar',
  'no-link',
  'high-no-link',
  'waiting',
]);

export const listVocsQuerySchema = z.object({
  // view is required — the route determines which data set to return.
  view: z.enum(['inbox', 'my', 'triage']),
  // 'all' means no MS filter; a UUID narrows to a single MS.
  // view=my rejects 'all' at the service layer (422) — not enforced here.
  managed_system_id: z
    .union([z.string().uuid(), z.literal('all')])
    .optional(),
  tab: vocTabEnumSchema.optional(),
  // Dot-key filter fields — Fastify query params are flat strings.
  'filter.severity': commaListOf(severityEnumSchema).optional(),
  'filter.reporter_facing_status': commaListOf(reporterFacingStatusEnumSchema).optional(),
  'filter.owner': z.enum(['assigned', 'unassigned']).optional(),
  // Sort whitelist is enforced here; mapped to drizzle column + direction in
  // repo layer via a fixed SORT_COLUMN_MAP dict (never string-interpolated).
  sort: z
    .enum([
      'created_at:desc',
      'created_at:asc',
      'severity:asc',
      'severity:desc',
      'reporter_facing_status:asc',
    ])
    .optional(),
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).optional().default(50),
});
export type ListVocsQuery = z.infer<typeof listVocsQuerySchema>;
