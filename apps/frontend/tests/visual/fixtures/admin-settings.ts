import { z } from 'zod';

export const adminSettingsFixtureSchema = z.object({
  permission_self_approval: z.enum(['allowed', 'forbidden']),
  survey_anonymity_threshold: z.number().int().min(5).max(50),
});

export const adminSettingsPatchSchema = adminSettingsFixtureSchema
  .partial()
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
  permission_self_approval: 'forbidden',
  survey_anonymity_threshold: 9,
});
