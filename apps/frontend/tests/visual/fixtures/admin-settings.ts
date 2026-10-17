import { z } from 'zod';

import {
  coverageThresholdsPatchSchema,
  coverageThresholdsSchema,
  resolveCoverageThresholds,
} from '@fops/shared';

export const adminSettingsFixtureSchema = z.object({
  voc_cluster_suggestions_enabled: z.boolean(),
  coverage_thresholds: coverageThresholdsSchema,
  permission_self_approval: z.enum(['allowed', 'forbidden']),
  survey_anonymity_threshold: z.number().int().min(5).max(50),
});

// Mirrors the server PATCH: partial per-metric Coverage map, min one field.
export const adminSettingsPatchSchema = adminSettingsFixtureSchema
  .partial()
  .extend({ coverage_thresholds: coverageThresholdsPatchSchema.optional() })
  .refine(
    (value) => Object.keys(value).length > 0,
    'workspace settings patch must include a changed field',
  );

export type AdminSettingsVisualScenario =
  | 'default'
  | 'editing'
  | 'locked'
  | 'no-permission'
  | 'error'
  | 'settings-self-approval-scoped';

export const adminSettingsVisualScenarios = z
  .array(
    z.enum([
      'default',
      'editing',
      'locked',
      'no-permission',
      'error',
      'settings-self-approval-scoped',
    ]),
  )
  .parse([
    'default',
    'editing',
    'locked',
    'no-permission',
    'error',
    'settings-self-approval-scoped',
  ]);

export const adminSettingsFixture = adminSettingsFixtureSchema.parse({
  coverage_thresholds: resolveCoverageThresholds(),
  voc_cluster_suggestions_enabled: false,
  permission_self_approval: 'forbidden',
  survey_anonymity_threshold: 9,
});
