import { z } from 'zod';

/**
 * List-findings query contract. Lives outside routes.ts so other modules
 * (saved-views) can validate against the Findings list contract without
 * importing an HTTP route module (#391).
 */
export const listFindingsQuerySchema = z
  .object({
    managed_system_id: z.string().uuid().optional(),
  })
  .strict();
