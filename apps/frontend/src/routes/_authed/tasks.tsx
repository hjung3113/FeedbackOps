import { TaskListRoute } from '@/features/tasks/routes/TaskListRoute';
import { TaskBoardRoute } from '@/features/tasks/routes/TaskBoardRoute';
import { TaskRequestsRoute } from '@/features/tasks/routes/TaskRequestsRoute';
import { createFileRoute } from '@tanstack/react-router';
import { z } from 'zod';

const tasksSearchSchema = z
  .object({
    view: z.enum(['requests', 'backlog', 'board', 'my', 'inbox']).optional(),
    param: z.string().optional(),
  })
  .strict();

export const Route = createFileRoute('/_authed/tasks')({
  validateSearch: (raw) => tasksSearchSchema.parse(raw),
  component: TasksRouteShell,
});

function TasksRouteShell() {
  const search = Route.useSearch();
  if (search.view === 'requests') {
    return <TaskRequestsRoute selectedParam={search.param} />;
  }
  if (search.view === 'board') {
    return <TaskBoardRoute selectedParam={search.param} />;
  }
  return <TaskListRoute selectedParam={search.param} />;
}
