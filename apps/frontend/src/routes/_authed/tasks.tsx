import { MilestonesRoute } from '@/features/tasks/routes/MilestonesRoute';
import { TaskBoardRoute } from '@/features/tasks/routes/TaskBoardRoute';
import { TaskListRoute } from '@/features/tasks/routes/TaskListRoute';
import { TaskRequestsRoute } from '@/features/tasks/routes/TaskRequestsRoute';
import { recoverySearchFields } from '@/lib/router/recovery-search';
import { parseRouteSearch } from '@/lib/router/search';
import { listTasksQuerySchema, taskStatusSchema } from '@fops/shared';
import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { z } from 'zod';

export const tasksSearchSchema = z
  .object({
    returnTo: recoverySearchFields.returnTo,
    q: listTasksQuerySchema.shape.q,
    view: z.enum(['requests', 'backlog', 'board', 'my', 'inbox', 'milestones']).optional(),
    param: z.string().optional(),
    managedSystem: z.union([z.string().uuid(), z.literal('all')]).optional(),
    'filter.analytics_area': z.union([z.string().uuid(), z.literal('unset')]).optional(),
    status: taskStatusSchema.optional(),
    status_group: z.literal('in-flight').optional(),
    // TanStack decodes a hand-written ?overdue=true as the boolean true.
    overdue: z.preprocess((value) => (value === 'true' ? true : value), z.literal(true).optional()),
    reporter_update: z.literal('needed').optional(),
    public_update: z.literal('missing').optional(),
    reviewer: z.union([z.string().uuid(), z.literal('me')]).optional(),
    reviewerTeam: z.string().uuid().optional(),
  })
  .strict();

type TasksSearch = z.infer<typeof tasksSearchSchema>;

export function validateTasksSearch(raw: unknown) {
  return parseRouteSearch(tasksSearchSchema, raw);
}

export const Route = createFileRoute('/_authed/tasks')({
  validateSearch: validateTasksSearch,
  component: TasksRouteShell,
});

export function TasksRouteView({ search }: { search: TasksSearch }) {
  const managedSystemProps =
    search.managedSystem !== undefined ? { managedSystem: search.managedSystem } : {};
  const selectedParamProps = search.param !== undefined ? { selectedParam: search.param } : {};
  if (search.view === 'requests') {
    return (
      <TaskRequestsUrlRoute
        {...managedSystemProps}
        {...selectedParamProps}
        {...(search.reviewer === undefined ? {} : { reviewer: search.reviewer })}
        {...(search.reviewerTeam === undefined ? {} : { reviewerTeam: search.reviewerTeam })}
      />
    );
  }
  if (search.view === 'board') {
    return (
      <TaskBoardRoute
        {...managedSystemProps}
        {...selectedParamProps}
        {...(search.q === undefined ? {} : { q: search.q })}
        {...(search.public_update === 'missing' ? { publicUpdate: search.public_update } : {})}
      />
    );
  }
  if (search.view === 'milestones') {
    return <MilestonesRoute {...managedSystemProps} {...selectedParamProps} />;
  }
  const view = search.view === 'my' ? 'my' : 'backlog';
  return (
    <TaskListRoute view={view} {...managedSystemProps} {...selectedParamProps} filters={search} />
  );
}

function TasksRouteShell() {
  return <TasksRouteView search={Route.useSearch()} />;
}

function TaskRequestsUrlRoute(props: {
  managedSystem?: string;
  selectedParam?: string;
  reviewer?: string;
  reviewerTeam?: string;
}) {
  const navigate = useNavigate();
  return (
    <TaskRequestsRoute
      {...props}
      onReviewerChange={(reviewer, reviewerTeam) => {
        void navigate({
          to: '/tasks',
          search: (previous) => {
            const { reviewer: _reviewer, reviewerTeam: _team, param: _param, ...rest } = previous;
            return {
              ...rest,
              view: 'requests',
              ...(reviewer ? { reviewer } : {}),
              ...(reviewerTeam ? { reviewerTeam } : {}),
            };
          },
        });
      }}
      onSelectionChange={(id, replace) => {
        void navigate({
          to: '/tasks',
          replace,
          search: (previous) => {
            const { param: _param, ...rest } = previous;
            return { ...rest, view: 'requests', ...(id === null ? {} : { param: id }) };
          },
        });
      }}
    />
  );
}
