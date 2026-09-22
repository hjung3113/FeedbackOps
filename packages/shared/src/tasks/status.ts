import { z } from 'zod';

export const taskStatusSchema = z.enum([
  'backlog',
  'todo',
  'doing',
  'review',
  'done',
  'released',
  'reopened',
]);
export type TaskStatus = z.infer<typeof taskStatusSchema>;
