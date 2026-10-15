import { z } from 'zod';

export const vocOwnerCandidatesSchema = z
  .object({
    actors: z.array(
      z
        .object({
          id: z.string().uuid(),
          display_name: z.string(),
          eligible: z.boolean(),
        })
        .strict(),
    ),
  })
  .strict();

export type VocOwnerCandidates = z.infer<typeof vocOwnerCandidatesSchema>;
