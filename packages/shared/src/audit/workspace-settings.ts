// Workspace settings audit detail schemas (Slice 9 #195).
// `workspace_settings_updated` records a workspace-level policy singleton
// mutation as a change diff. Imported by audit-events.ts to register into
// AUDIT_EVENT_DETAIL_SCHEMAS.

import { z } from 'zod';

import { COVERAGE_METRIC_IDS, coverageThresholdPairSchema } from '../dashboard.js';

const coverageChangesSchema = z
  .object(
    Object.fromEntries(
      COVERAGE_METRIC_IDS.map((id) => [
        id,
        z
          .object({ from: coverageThresholdPairSchema, to: coverageThresholdPairSchema })
          .strict()
          .optional(),
      ]),
    ),
  )
  .strict()
  .refine((changes) => Object.keys(changes).length > 0, {
    message: 'at least one effective metric change is required',
  });

export const WORKSPACE_SETTINGS_AUDIT_EVENT_TYPES = ['workspace_settings_updated'] as const;

export const workspaceSettingsUpdatedDetailSchema = z
  .object({
    changes: z
      .object({
        coverage_thresholds: coverageChangesSchema.optional(),
        voc_cluster_suggestions_enabled: z
          .object({ from: z.boolean(), to: z.boolean() })
          .strict()
          .optional(),
        permission_self_approval: z
          .object({
            from: z.enum(['allowed', 'forbidden']),
            to: z.enum(['allowed', 'forbidden']),
          })
          .strict()
          .optional(),
        survey_anonymity_threshold: z
          .object({ from: z.number().int().min(5).max(50), to: z.number().int().min(5).max(50) })
          .strict()
          .optional(),
      })
      .strict()
      .refine((changes) => Object.keys(changes).length > 0, {
        message: 'changes must include at least one field',
      }),
  })
  .strict();
export type WorkspaceSettingsUpdatedDetail = z.infer<typeof workspaceSettingsUpdatedDetailSchema>;

export const WORKSPACE_SETTINGS_AUDIT_EVENT_DETAIL_SCHEMAS = {
  workspace_settings_updated: workspaceSettingsUpdatedDetailSchema,
} as const satisfies Record<(typeof WORKSPACE_SETTINGS_AUDIT_EVENT_TYPES)[number], z.ZodTypeAny>;
