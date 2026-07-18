import { randomUUID } from 'node:crypto';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { type DbHandle, createDb } from '../../../db/client.js';
import { createAuditService } from '../../core/audit/audit-service.js';
import { createIdempotencyService } from '../../core/idempotency/idempotency-service.js';
import { createCheckService } from '../../permissions/check-service.js';
import { createTasksService, type TasksService } from '../service.js';

const APP_URL = process.env.DATABASE_URL ?? '';
const MIGRATE_URL = process.env.DATABASE_URL_MIGRATE ?? '';
const runIntegration = Boolean(APP_URL && MIGRATE_URL);

if (!runIntegration) {
  console.warn(
    '[create-task-display-id] skipping integration suite — set DATABASE_URL and DATABASE_URL_MIGRATE to run.',
  );
}

describe.skipIf(!runIntegration)('task display_id assignment (#142)', () => {
  let dbHandle: DbHandle;
  let migrateHandle: DbHandle;
  let tasksService: TasksService;
  const workspaceId = randomUUID();
  let adminActorId: string | null = null;
  let managedSystemId: string | null = null;

  beforeAll(async () => {
    dbHandle = createDb(APP_URL);
    migrateHandle = createDb(MIGRATE_URL);
    tasksService = createTasksService({
      db: dbHandle.db,
      auditService: createAuditService(),
      checkService: createCheckService({ db: dbHandle.db }),
      idempotencyService: createIdempotencyService(),
    });

    await migrateHandle.pool.query(`insert into core.workspaces (id, name) values ($1, $2)`, [
      workspaceId,
      'Task Display ID Test Workspace',
    ]);
    const actor = await migrateHandle.pool.query<{ id: string }>(
      `insert into core.actors (
          workspace_id, external_id, email, display_name, role_level, actor_type
        )
       values ($1, $2, $3, $4, 'admin', 'internal_member')
       returning id`,
      [
        workspaceId,
        `task-display-admin-${workspaceId}`,
        `task-display-${workspaceId}@local`,
        'Task Display Admin',
      ],
    );
    adminActorId = actor.rows[0]?.id ?? null;
    if (!adminActorId) throw new Error('seed admin actor failed');

    const ms = await migrateHandle.pool.query<{ id: string }>(
      `insert into core.managed_systems (workspace_id, slug, name)
       values ($1, $2, $3)
       returning id`,
      [workspaceId, 'task-display-ms', 'Task Display MS'],
    );
    managedSystemId = ms.rows[0]?.id ?? null;
    if (!managedSystemId) throw new Error('seed managed system failed');
  });

  afterAll(async () => {
    if (migrateHandle) {
      await migrateHandle.pool.query(`delete from core.audit_log where workspace_id = $1`, [
        workspaceId,
      ]);
      await migrateHandle.pool.query(
        `delete from core.entity_links where workspace_id = $1`,
        [workspaceId],
      );
      await migrateHandle.pool.query(
        `delete from task.tasks where workspace_id = $1`,
        [workspaceId],
      );
      await migrateHandle.pool.query(
        `delete from task_request.task_requests where workspace_id = $1`,
        [workspaceId],
      );
      if (adminActorId) {
        await migrateHandle.pool.query(`delete from core.idempotency_keys where actor_id = $1`, [
          adminActorId,
        ]);
      }
      await migrateHandle.pool.query(
        `delete from core.managed_systems where workspace_id = $1`,
        [workspaceId],
      );
      await migrateHandle.pool.query(`delete from core.actors where workspace_id = $1`, [
        workspaceId,
      ]);
      await migrateHandle.pool.query(`delete from core.display_counters where workspace_id = $1`, [
        workspaceId,
      ]);
      await migrateHandle.pool.query(`delete from core.workspaces where id = $1`, [workspaceId]);
    }
    await dbHandle?.close();
    await migrateHandle?.close();
  });

  async function seedApprovedTaskRequest(title: string): Promise<string> {
    if (!managedSystemId || !adminActorId) throw new Error('seed IDs missing');
    const res = await migrateHandle.pool.query<{ id: string }>(
      `insert into task_request.task_requests (
          workspace_id, display_id, source_type, source_id, primary_managed_system_id,
          evidence_summary, requested_outcome, requester_actor_id, status,
          reviewer_actor_id, decision_reason, decided_at
        )
       values (
          $1, core.next_display_id($1::uuid, 'task_request'), 'finding', gen_random_uuid(), $2,
          'Evidence summary', $3, $4, 'approved', $4, 'Approved in seed', now()
        )
       returning id`,
      [workspaceId, managedSystemId, title, adminActorId],
    );
    const id = res.rows[0]?.id;
    if (!id) throw new Error('seedApprovedTaskRequest failed');
    return id;
  }

  it('assigns TASK display_id values to successive task creations in one workspace', async () => {
    const firstRequestId = await seedApprovedTaskRequest('Create first display-id task');
    const secondRequestId = await seedApprovedTaskRequest('Create second display-id task');
    if (!adminActorId) throw new Error('seed admin actor missing');
    const actor = {
      actor_id: adminActorId,
      workspace_id: workspaceId,
      role_level: 'admin' as const,
    };

    const first = await tasksService.convertTaskRequest({
      actor,
      taskRequestId: firstRequestId,
      input: { title: 'First task', priority: 'medium' },
      idempotencyKey: randomUUID(),
      requestHash: `create-task-display-id:${firstRequestId}`,
    });
    const second = await tasksService.convertTaskRequest({
      actor,
      taskRequestId: secondRequestId,
      input: { title: 'Second task', priority: 'medium' },
      idempotencyKey: randomUUID(),
      requestHash: `create-task-display-id:${secondRequestId}`,
    });

    expect(first.body.display_id).toBe('TASK-1000');
    expect(second.body.display_id).toBe('TASK-1001');
  });
});
