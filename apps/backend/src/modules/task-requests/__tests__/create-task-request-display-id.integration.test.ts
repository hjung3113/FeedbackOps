import { randomUUID } from 'node:crypto';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { type DbHandle, createDb } from '../../../db/client.js';
import { createAuditService } from '../../core/audit/audit-service.js';
import { insertFindingRow } from '../../findings/__tests__/_seed-helpers.js';
import { createIdempotencyService } from '../../core/idempotency/idempotency-service.js';
import { createCheckService } from '../../permissions/check-service.js';
import { createTaskRequestsService, type TaskRequestsService } from '../service.js';

const APP_URL = process.env.DATABASE_URL ?? '';
const MIGRATE_URL = process.env.DATABASE_URL_MIGRATE ?? '';
const runIntegration = Boolean(APP_URL && MIGRATE_URL);

if (!runIntegration) {
  console.warn(
    '[create-task-request-display-id] skipping integration suite — set DATABASE_URL and DATABASE_URL_MIGRATE to run.',
  );
}

describe.skipIf(!runIntegration)('task request display_id assignment (#142)', () => {
  let dbHandle: DbHandle;
  let migrateHandle: DbHandle;
  let taskRequestsService: TaskRequestsService;
  const workspaceId = randomUUID();
  let adminActorId: string | null = null;
  let managedSystemId: string | null = null;
  let findingId: string | null = null;

  beforeAll(async () => {
    dbHandle = createDb(APP_URL);
    migrateHandle = createDb(MIGRATE_URL);
    taskRequestsService = createTaskRequestsService({
      db: dbHandle.db,
      auditService: createAuditService(),
      checkService: createCheckService({ db: dbHandle.db }),
      idempotencyService: createIdempotencyService(),
    });

    await migrateHandle.pool.query(`insert into core.workspaces (id, name) values ($1, $2)`, [
      workspaceId,
      'Task Request Display ID Test Workspace',
    ]);
    const actor = await migrateHandle.pool.query<{ id: string }>(
      `insert into core.actors (
          workspace_id, external_id, email, display_name, role_level, actor_type
        )
       values ($1, $2, $3, $4, 'admin', 'internal_member')
       returning id`,
      [
        workspaceId,
        `task-request-display-admin-${workspaceId}`,
        `task-request-display-${workspaceId}@local`,
        'Task Request Display Admin',
      ],
    );
    adminActorId = actor.rows[0]?.id ?? null;
    if (!adminActorId) throw new Error('seed admin actor failed');

    const ms = await migrateHandle.pool.query<{ id: string }>(
      `insert into core.managed_systems (workspace_id, slug, name)
       values ($1, $2, $3)
       returning id`,
      [workspaceId, 'task-request-display-ms', 'Task Request Display MS'],
    );
    managedSystemId = ms.rows[0]?.id ?? null;
    if (!managedSystemId) throw new Error('seed managed system failed');

    const finding = await insertFindingRow(migrateHandle, {
      workspaceId,
      primaryManagedSystemId: managedSystemId,
      title: 'Task request source finding',
      summary: 'Task request source finding summary',
      sourceId: randomUUID(),
      status: 'active',
      createdBy: adminActorId,
    });
    findingId = finding.id;
  });

  afterAll(async () => {
    if (migrateHandle) {
      await migrateHandle.pool.query(`delete from core.audit_log where workspace_id = $1`, [
        workspaceId,
      ]);
      await migrateHandle.pool.query(`delete from core.entity_links where workspace_id = $1`, [
        workspaceId,
      ]);
      await migrateHandle.pool.query(
        `delete from task_request.task_requests where workspace_id = $1`,
        [workspaceId],
      );
      await migrateHandle.pool.query(`delete from finding.findings where workspace_id = $1`, [
        workspaceId,
      ]);
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

  it('assigns REQ display_id values to successive task request creations in one workspace', async () => {
    if (!adminActorId || !findingId) throw new Error('seed IDs missing');
    const actor = {
      actor_id: adminActorId,
      workspace_id: workspaceId,
      role_level: 'admin' as const,
    };

    const first = await taskRequestsService.createFromFinding({
      actor,
      findingId,
      input: {
        evidence_summary: 'First evidence summary',
        requested_outcome: 'First requested outcome',
      },
      idempotencyKey: randomUUID(),
      requestHash: 'create-task-request-display-id:first',
    });
    const second = await taskRequestsService.createFromFinding({
      actor,
      findingId,
      input: {
        evidence_summary: 'Second evidence summary',
        requested_outcome: 'Second requested outcome',
      },
      idempotencyKey: randomUUID(),
      requestHash: 'create-task-request-display-id:second',
    });

    expect(first.body.display_id).toBe('REQ-1000');
    expect(second.body.display_id).toBe('REQ-1001');
  });
});
