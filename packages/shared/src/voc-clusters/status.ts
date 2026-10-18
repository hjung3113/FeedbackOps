import { z } from 'zod';

export const vocClusterStatusSchema = z.enum(['draft', 'confirmed']);
export type VocClusterStatus = z.infer<typeof vocClusterStatusSchema>;
