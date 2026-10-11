import { z } from 'zod';

export const listPageSchema = z
  .object({
    has_more: z.boolean(),
    cursor: z.string().optional(),
    total: z.number().int().nonnegative().optional(),
  })
  .strict();
export type ListPage = z.infer<typeof listPageSchema>;
