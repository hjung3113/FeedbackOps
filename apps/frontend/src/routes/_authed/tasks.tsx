import { TaskListRoute } from '@/features/tasks/routes/TaskListRoute';
import { TaskBoardRoute } from '@/features/tasks/routes/TaskBoardRoute';
import { TaskRequestsRoute } from '@/features/tasks/routes/TaskRequestsRoute';
import { createFileRoute } from '@tanstack/react-router';
import { z } from 'zod';

const tasksSearchSchema = z
  .object({
    view: z.enum(['requests', 'backlog', 'board', 'my', 'inbox']).optional(),
    param: z.string().optional(),
    managedSystem: z.union([z.string().uuid(), z.literal('all')]).optional(),
  })
  .strict();

export const Route = createFileRoute('/_authed/tasks')({
  validateSearch: (raw) => tasksSearchSchema.parse(raw),
  component: TasksRouteShell,
});

export function TasksRouteView({ search }: { search: { view?: 'requests' | 'backlog' | 'board' | 'my' | 'inbox'; param?: string; managedSystem?: string } }) {
  const managedSystemProps = search.managedSystem !== undefined ? { managedSystem: search.managedSystem } : {};
  const selectedParamProps = search.param !== undefined ? { selectedParam: search.param } : {};
  if (search.view === 'requests') {
    return <TaskRequestsRoute {...managedSystemProps} {...selectedParamProps} />;
  }
  if (search.view === 'board') {
    return <TaskBoardRoute {...managedSystemProps} {...selectedParamProps} />;
  }
  return <TaskListRoute {...managedSystemProps} {...selectedParamProps} />;
}

function TasksRouteShell() {
  return <TasksRouteView search={Route.useSearch()} />;
}
