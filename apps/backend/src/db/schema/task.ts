import { sql } from 'drizzle-orm';
import { check, date, index, pgSchema, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';

import { actors, analyticsAreas, managedSystems, workspaces } from './core.js';
import { taskRequests } from './task-request.js';

export const taskSchema = pgSchema('task');

export const tasks = taskSchema.table(
  'tasks',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id),
    displayId: text('display_id').notNull(),
    primaryManagedSystemId: uuid('primary_managed_system_id')
      .notNull()
      .references(() => managedSystems.id),
    title: text('title').notNull(),
    status: text('status').notNull().default('backlog'),
    priority: text('priority').notNull().default('medium'),
    assigneeActorId: uuid('assignee_actor_id').references(() => actors.id),
    dueDate: date('due_date'),
    // Milestone domain is deferred for MVP. Keep nullable UUID placeholder
    // without FK until FR-TASK-004 introduces the table.
    milestoneId: uuid('milestone_id'),
    analyticsAreaId: uuid('analytics_area_id').references(() => analyticsAreas.id),
    sourceTaskRequestId: uuid('source_task_request_id').references(() => taskRequests.id),
    createdBy: uuid('created_by')
      .notNull()
      .references(() => actors.id),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    workspaceDisplayUq: uniqueIndex('tasks_workspace_display_id_uq').on(
      t.workspaceId,
      t.displayId,
    ),
    workspaceStatusIdx: index('tasks_workspace_status_idx').on(t.workspaceId, t.status),
    workspaceManagedSystemIdx: index('tasks_workspace_managed_system_idx').on(
      t.workspaceId,
      t.primaryManagedSystemId,
    ),
    workspaceAssigneeIdx: index('tasks_workspace_assignee_idx').on(
      t.workspaceId,
      t.assigneeActorId,
    ),
    statusCheck: check(
      'tasks_status_check',
      sql`${t.status} in ('backlog','todo','doing','review','done','released','reopened')`,
    ),
    priorityCheck: check(
      'tasks_priority_check',
      sql`${t.priority} in ('low','medium','high','urgent')`,
    ),
  }),
);
