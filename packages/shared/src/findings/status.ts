import { z } from 'zod';

export const findingStatusSchema = z.enum([
  'draft',
  'active',
  'not_actionable',
  'converted',
  'archived',
]);
export type FindingStatus = z.infer<typeof findingStatusSchema>;
