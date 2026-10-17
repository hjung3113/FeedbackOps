import { EvidenceRoute } from '@/features/integration/routes/EvidenceRoute';
import { parseRouteSearch } from '@/lib/router/search';
import { createFileRoute } from '@tanstack/react-router';
import { z } from 'zod';

export const evidenceSearchSchema = z
  .object({
    managedSystem: z.union([z.string().uuid(), z.literal('all')]).optional(),
    source: z.enum(['voc', 'survey_response', 'note']).optional(),
    q: z
      .string()
      .trim()
      .max(200)
      .transform((value) => value || undefined)
      .optional(),
    selected: z.string().uuid().optional(),
    cursor: z.string().min(1).optional(),
  })
  .strict();
export function validateEvidenceSearch(raw: unknown) {
  return parseRouteSearch(evidenceSearchSchema, raw);
}
export const Route = createFileRoute('/_authed/integration/evidence')({
  validateSearch: validateEvidenceSearch,
  component: EvidenceRoute,
});
