import { sql } from 'drizzle-orm';
import {
  check,
  date,
  index,
  jsonb,
  pgSchema,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

import { actors, analyticsAreas, managedSystems, workspaces } from './core.js';
import { taskRequests } from './task-request.js';

export const taskSchema = pgSchema('task');

export const milestones = taskSchema.table(
  'milestones',
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
    why: text('why').notNull(),
    // No check() on status: the persisted set is the open G-status ADR (#514).
    status: text('status').notNull().default('planning'),
    ownerActorId: uuid('owner_actor_id')
      .notNull()
      .references(() => actors.id),
    analyticsAreaId: uuid('analytics_area_id').references(() => analyticsAreas.id),
    startDate: date('start_date').notNull(),
    targetDate: date('target_date').notNull(),
    createdBy: uuid('created_by')
      .notNull()
      .references(() => actors.id),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    workspaceDisplayUq: uniqueIndex('milestones_workspace_display_id_uq').on(
      t.workspaceId,
      t.displayId,
    ),
    workspaceStatusIdx: index('milestones_workspace_status_idx').on(t.workspaceId, t.status),
    workspaceManagedSystemIdx: index('milestones_workspace_managed_system_idx').on(
      t.workspaceId,
      t.primaryManagedSystemId,
    ),
  }),
);

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
    milestoneId: uuid('milestone_id').references(() => milestones.id, {
      onDelete: 'restrict',
    }),
    analyticsAreaId: uuid('analytics_area_id').references(() => analyticsAreas.id),
    sourceTaskRequestId: uuid('source_task_request_id').references(() => taskRequests.id),
    createdBy: uuid('created_by')
      .notNull()
      .references(() => actors.id),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    workspaceDisplayUq: uniqueIndex('tasks_workspace_display_id_uq').on(t.workspaceId, t.displayId),
    workspaceStatusIdx: index('tasks_workspace_status_idx').on(t.workspaceId, t.status),
    workspaceManagedSystemIdx: index('tasks_workspace_managed_system_idx').on(
      t.workspaceId,
      t.primaryManagedSystemId,
    ),
    workspaceAssigneeIdx: index('tasks_workspace_assignee_idx').on(
      t.workspaceId,
      t.assigneeActorId,
    ),
    // 0049 (#514 A2): partial index mirroring tasks_milestone_id_idx.
    milestoneIdIdx: index('tasks_milestone_id_idx')
      .on(t.milestoneId)
      .where(sql`${t.milestoneId} is not null`),
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

export const taskComments = taskSchema.table(
  'task_comments',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id),
    taskId: uuid('task_id')
      .notNull()
      .references(() => tasks.id, { onDelete: 'cascade' }),
    actorId: uuid('actor_id')
      .notNull()
      .references(() => actors.id),
    kind: text('kind').notNull().default('note'),
    fromStatus: text('from_status'),
    toStatus: text('to_status'),
    bodyRichContent: jsonb('body_rich_content').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    taskCreatedIdx: index('task_comments_task_created_idx').on(
      t.taskId,
      t.createdAt.desc(),
      t.id.desc(),
    ),
    kindCheck: check('task_comments_kind_check', sql`${t.kind} in ('note','status_change')`),
    statusPairCheck: check(
      'task_comments_status_pair_check',
      sql`(
        (${t.kind} = 'note' and ${t.fromStatus} is null and ${t.toStatus} is null)
        or (
          ${t.kind} = 'status_change'
          and ${t.fromStatus} in ('backlog','todo','doing','review','done','released','reopened')
          and ${t.toStatus} in ('backlog','todo','doing','review','done','released','reopened')
        )
      )`,
    ),
  }),
);
