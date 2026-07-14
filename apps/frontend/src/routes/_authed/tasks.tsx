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

export function TasksRouteView({ search }: { search: { view?: 'requests' | 'backlog' | 'board' | 'my' | 'inbox'; param?: string } }) {
  if (search.view === 'requests') {
    return <TaskRequestsRoute {...(search.param !== undefined ? { selectedParam: search.param } : {})} />;
  }
  if (search.view === 'board') {
    return <TaskBoardRoute {...(search.param !== undefined ? { selectedParam: search.param } : {})} />;
  }
  return <TaskListRoute {...(search.param !== undefined ? { selectedParam: search.param } : {})} />;
}

function TasksRouteShell() {
  return <TasksRouteView search={Route.useSearch()} />;
}
