import { z } from 'zod';

export const listSurveysQuerySchema = z
  .object({
    managed_system_id: z.union([z.string().uuid(), z.literal('all')]).optional(),
    analytics_area_id: z.union([z.string().uuid(), z.literal('unset')]).optional(),
    status: z.literal('open').optional(),
    follow_up: z.literal('needed').optional(),
  })
  .strict();
export type ListSurveysQuery = z.infer<typeof listSurveysQuerySchema>;
