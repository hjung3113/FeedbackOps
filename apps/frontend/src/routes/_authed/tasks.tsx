import { MilestonesRoute } from '@/features/tasks/routes/MilestonesRoute';
import { TaskBoardRoute } from '@/features/tasks/routes/TaskBoardRoute';
import { TaskListRoute } from '@/features/tasks/routes/TaskListRoute';
import { TaskRequestsRoute } from '@/features/tasks/routes/TaskRequestsRoute';
import { createFileRoute } from '@tanstack/react-router';
import { z } from 'zod';

export const tasksSearchSchema = z
  .object({
    view: z.enum(['requests', 'backlog', 'board', 'my', 'inbox', 'milestones']).optional(),
    param: z.string().optional(),
    managedSystem: z.union([z.string().uuid(), z.literal('all')]).optional(),
    public_update: z.literal('missing').optional(),
  })
  .strict();

type TasksSearch = z.infer<typeof tasksSearchSchema>;

export const Route = createFileRoute('/_authed/tasks')({
  validateSearch: (raw) => tasksSearchSchema.parse(raw),
  component: TasksRouteShell,
});

export function TasksRouteView({ search }: { search: TasksSearch }) {
  const managedSystemProps =
    search.managedSystem !== undefined ? { managedSystem: search.managedSystem } : {};
  const selectedParamProps = search.param !== undefined ? { selectedParam: search.param } : {};
  if (search.view === 'requests') {
    return <TaskRequestsRoute {...managedSystemProps} {...selectedParamProps} />;
  }
  if (search.view === 'board') {
    return (
      <TaskBoardRoute
        {...managedSystemProps}
        {...selectedParamProps}
        {...(search.public_update === 'missing' ? { publicUpdate: search.public_update } : {})}
      />
    );
  }
  if (search.view === 'milestones') {
    return <MilestonesRoute {...managedSystemProps} {...selectedParamProps} />;
  }
  return <TaskListRoute {...managedSystemProps} {...selectedParamProps} />;
}

function TasksRouteShell() {
  return <TasksRouteView search={Route.useSearch()} />;
}
