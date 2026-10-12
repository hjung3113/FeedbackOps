import { z } from 'zod';

export const responsibilityDefaultFailureSchema = z
  .object({
    workspace_id: z.string().uuid(),
    managed_system_id: z.string().uuid(),
    workflow: z.enum(['voc', 'finding', 'task_request', 'task']),
    responsibility: z.enum(['owner', 'reviewer']),
    rule: z.enum(['managed_system_owner', 'managed_system_reviewer', 'analytics_area_owner']),
    category: z.enum([
      'missing',
      'invalid_pair',
      'foreign_workspace',
      'archived_team',
      'ineligible_actor',
    ]),
  })
  .strict();
export type ResponsibilityDefaultFailure = z.infer<typeof responsibilityDefaultFailureSchema>;

export const managedSystemDefaultDiagnosticsSchema = z
  .object({
    items: z.array(
      responsibilityDefaultFailureSchema
        .omit({ workspace_id: true })
        .extend({
          origin: z.enum(['configuration', 'creation_failure']),
          count: z.number().int().positive(),
          last_failed_at: z.string().datetime().nullable(),
        })
        .strict(),
    ),
  })
  .strict();
export type ManagedSystemDefaultDiagnostics = z.infer<typeof managedSystemDefaultDiagnosticsSchema>;

/** Admin registry candidates; eligibility remains a server decision. */
const defaultCandidateSchema = z
  .object({
    id: z.string().uuid(),
    display_name: z.string(),
    eligible: z.boolean(),
  })
  .strict();
export const managedSystemDefaultCandidatesSchema = z
  .object({
    owners: z.array(defaultCandidateSchema),
    reviewers: z.array(defaultCandidateSchema),
  })
  .strict();
export type ManagedSystemDefaultCandidates = z.infer<typeof managedSystemDefaultCandidatesSchema>;
