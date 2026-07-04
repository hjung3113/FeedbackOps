import { TaskRequestsRoute } from '@/features/tasks/routes/TaskRequestsRoute';
import { createFileRoute } from '@tanstack/react-router';
import { z } from 'zod';

const tasksSearchSchema = z
  .object({
    view: z.literal('requests').optional(),
    param: z.string().optional(),
  })
  .strict();

export const Route = createFileRoute('/_authed/tasks')({
  validateSearch: (raw) => tasksSearchSchema.parse(raw),
  component: TasksRouteShell,
});

function TasksRouteShell() {
  const search = Route.useSearch();
  return <TaskRequestsRoute selectedParam={search.param} />;
}
