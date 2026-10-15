import { randomUUID } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { loadConfig } from '../../../config.js';
import { type DbHandle, createDb } from '../../../db/client.js';
import { buildServer } from '../../../server.js';
import { insertActorRow } from '../../../test-support/actor-fixtures.js';
import { SESSION_COOKIE_NAME, loginAs } from '../../../test-support/auth.js';
import { insertMsDirectly } from '../../../test-support/core-fixtures.js';
import { insertFindingRow } from '../../../test-support/findings-fixtures.js';
import { grantCapability } from '../../../test-support/permissions-fixtures.js';
import {
  cleanupSystemRecoveryFixtures,
  deleteRecoveryFixtureParents,
} from '../../../test-support/recovery-fixtures.js';
import { insertTaskRequestRow, insertTaskRow } from '../../../test-support/task-fixtures.js';
import {
  cleanupTestActorsByExternalIdPrefix,
  insertVocDirectly,
} from '../../../test-support/voc-fixtures.js';

const APP_URL = process.env.DATABASE_URL ?? '';
const MIGRATE_URL = process.env.DATABASE_URL_MIGRATE ?? '';
const WORKSPACE_ID = process.env.WORKSPACE_ID ?? '';
const PREFIX = 'it-1174-detach';

describe.skipIf(!APP_URL || !MIGRATE_URL || !WORKSPACE_ID)('detach and relink (#1174a)', () => {
  let handle: DbHandle;
  let migrate: DbHandle;
  let app: FastifyInstance;
  let admin: string;
  let developer: string;
  const cookies: Record<string, string> = {};

  const headers = (actor = 'admin') => ({ cookie: `${SESSION_COOKIE_NAME}=${cookies[actor]}` });
  const detach = (id: string, actor = 'admin') =>
    app.inject({
      method: 'PATCH',
      url: `/entity-links/${id}`,
      headers: headers(actor),
      payload: { reason: 'Remove execution/evidence' },
    });
  const link = (findingId: string, taskId: string) =>
    app.inject({
      method: 'POST',
      url: `/findings/${findingId}/link-task`,
      headers: { ...headers(), 'idempotency-key': randomUUID() },
      payload: { task_id: taskId },
    });
  async function executionNone(ms: string) {
    const response = await app.inject({
      method: 'GET',
      url: `/findings?managed_system_id=${ms}&execution=none`,
      headers: headers(),
    });
    expect(response.statusCode).toBe(200);
    return response.json<{ items: { id: string }[] }>().items.map((item) => item.id);
  }
  async function fixture(status: 'active' | 'draft' = 'active') {
    const ms = await insertMsDirectly(
      handle,
      WORKSPACE_ID,
      `${PREFIX}-${randomUUID()}`,
      'Detach MS',
    );
    const voc = await insertVocDirectly(handle, WORKSPACE_ID, ms, admin, 'Detach VOC');
    const finding = await insertFindingRow(migrate, {
      workspaceId: WORKSPACE_ID,
      primaryManagedSystemId: ms,
      sourceId: voc.id,
      status,
      createdBy: admin,
    });
    const task = await insertTaskRow(migrate, {
      workspaceId: WORKSPACE_ID,
      primaryManagedSystemId: ms,
      createdBy: admin,
    });
    return { ms, voc: voc.id, finding: finding.id, task: task.id };
  }
  async function seedLink(
    ms: string,
    sourceType: string,
    sourceId: string,
    targetType: string,
    targetId: string,
    relation: string,
  ) {
    const result = await migrate.pool.query<{ id: string }>(
      `insert into core.entity_links (workspace_id,source_type,source_id,target_type,target_id,relation_type,visibility,status,managed_system_id,created_by)
       values ($1,$2,$3,$4,$5,$6,'internal_only','active',$7,$8) returning id`,
      [WORKSPACE_ID, sourceType, sourceId, targetType, targetId, relation, ms, admin],
    );
    const row = result.rows[0];
    if (!row) throw new Error('seed link missing');
    return row.id;
  }
  async function activeTaskLinks(finding: string) {
    return (
      await handle.pool.query<{ id: string; target_id: string }>(
        `select id,target_id from core.entity_links_app where workspace_id=$1 and source_type='finding' and source_id=$2 and target_type='task' and relation_type='requested_task' and status='active'`,
        [WORKSPACE_ID, finding],
      )
    ).rows;
  }
  async function projection(finding: string) {
    const response = await app.inject({
      method: 'GET',
      url: `/findings/${finding}`,
      headers: headers(),
    });
    expect(response.statusCode).toBe(200);
    return response.json().linked_task_id;
  }

  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    handle = createDb(APP_URL);
    migrate = createDb(MIGRATE_URL);
    app = await buildServer({ config: loadConfig(), dbHandle: handle });
    await app.ready();
    for (const role of ['admin', 'developer'] as const) {
      const actor = await insertActorRow(handle, {
        workspaceId: WORKSPACE_ID,
        externalId: `${PREFIX}-${role}`,
        roleLevel: role,
      });
      if (role === 'admin') admin = actor.id;
      else developer = actor.id;
      cookies[role] = await loginAs(app, `${PREFIX}-${role}`);
    }
  });
  beforeEach(async () => {
    await handle.pool.query('delete from permission.permission_grants where actor_id=$1', [
      developer,
    ]);
    await handle.pool.query(
      'delete from permission.permission_denies where actor_id=any($1::uuid[])',
      [[admin, developer]],
    );
    await handle.pool.query('delete from core.rate_limits where key=any($1::text[])', [
      [`${WORKSPACE_ID}:${admin}`, `${WORKSPACE_ID}:${developer}`],
    ]);
  });
  afterAll(async () => {
    await cleanupSystemRecoveryFixtures(migrate, WORKSPACE_ID, `${PREFIX}%`);
    for (const [table, column] of [
      ['core.entity_links', 'managed_system_id'],
      ['finding.findings', 'primary_managed_system_id'],
      ['task.tasks', 'primary_managed_system_id'],
      ['task_request.task_requests', 'primary_managed_system_id'],
      ['voc.vocs', 'primary_managed_system_id'],
    ]) {
      await migrate.pool.query(
        `delete from ${table} where workspace_id=$1 and ${column} in (select id from core.managed_systems where workspace_id=$1 and slug like $2)`,
        [WORKSPACE_ID, `${PREFIX}%`],
      );
    }
    for (const table of ['permission.permission_grants', 'permission.permission_denies']) {
      await migrate.pool.query(`delete from ${table} where actor_id=any($1::uuid[])`, [
        [admin, developer],
      ]);
    }
    await deleteRecoveryFixtureParents(
      migrate,
      'delete from core.managed_systems where workspace_id=$1 and slug like $2',
      [WORKSPACE_ID, `${PREFIX}%`],
    );
    await cleanupTestActorsByExternalIdPrefix(migrate, WORKSPACE_ID, PREFIX);
    await app.close();
    await handle.close();
    await migrate.close();
  });

  it.each(['voc-finding', 'finding-task'] as const)(
    'requires target creation capability for %s detach',
    async (tuple) => {
      const f = await fixture();
      for (const capability of ['voc.read', 'finding.read']) {
        await grantCapability(handle, WORKSPACE_ID, developer, capability, f.ms, admin);
      }
      const id =
        tuple === 'voc-finding'
          ? await seedLink(f.ms, 'voc', f.voc, 'finding', f.finding, 'evidence_of')
          : await seedLink(f.ms, 'finding', f.finding, 'task', f.task, 'requested_task');
      const denied = await detach(id, 'developer');
      expect(denied.statusCode).toBe(404);
      expect(denied.json().code).toBe('not_found.record');
      expect(
        (await handle.pool.query('select status from core.entity_links_app where id=$1', [id]))
          .rows,
      ).toEqual([{ status: 'active' }]);
      expect(
        (
          await migrate.pool.query(
            "select id from core.audit_log where subject_id=$1 and event_type='entity_link.detached'",
            [id],
          )
        ).rows,
      ).toEqual([]);
      await grantCapability(handle, WORKSPACE_ID, developer, 'finding.manage', f.ms, admin);
      const allowed = await detach(id, 'developer');
      expect(allowed.statusCode).toBe(200);
      expect(allowed.json()).toMatchObject({ id, status: 'detached' });
      expect(
        (
          await migrate.pool.query(
            "select id from core.audit_log where subject_id=$1 and event_type='entity_link.detached'",
            [id],
          )
        ).rows,
      ).toHaveLength(1);
      expect((await detach(id, 'developer')).statusCode).toBe(409);
    },
  );

  it('keeps command-only tuples non-disclosing even for an Admin', async () => {
    const f = await fixture();
    const request = await insertTaskRequestRow(migrate, {
      workspaceId: WORKSPACE_ID,
      sourceType: 'voc',
      sourceId: f.voc,
      primaryManagedSystemId: f.ms,
      requesterActorId: admin,
    });
    const id = await seedLink(f.ms, 'voc', f.voc, 'task_request', request.id, 'requested_task');
    const response = await detach(id);
    expect(response.statusCode).toBe(404);
    expect(response.json().code).toBe('not_found.record');
    expect(
      (await handle.pool.query('select status from core.entity_links_app where id=$1', [id])).rows,
    ).toEqual([{ status: 'active' }]);
  });

  it.each(['same', 'different'] as const)(
    're-enters the execution queue after detach and relinks a %s Task with a fresh key',
    async (variant) => {
      const f = await fixture();
      expect((await link(f.finding, f.task)).statusCode).toBe(200);
      expect(await executionNone(f.ms)).not.toContain(f.finding);
      const initial = (await activeTaskLinks(f.finding))[0];
      if (!initial) throw new Error('initial Task link missing');
      expect((await detach(initial.id)).statusCode).toBe(200);
      expect(await projection(f.finding)).toBeNull();
      expect(await executionNone(f.ms)).toContain(f.finding);
      const next =
        variant === 'same'
          ? f.task
          : (
              await insertTaskRow(migrate, {
                workspaceId: WORKSPACE_ID,
                primaryManagedSystemId: f.ms,
                createdBy: admin,
              })
            ).id;
      const response = await link(f.finding, next);
      expect(response.statusCode).toBe(200);
      expect(response.json().linked_task_id).toBe(next);
      const active = await activeTaskLinks(f.finding);
      expect(active).toHaveLength(1);
      expect(active[0]?.target_id).toBe(next);
      expect(active[0]?.id).not.toBe(initial.id);
      expect(await executionNone(f.ms)).not.toContain(f.finding);
      expect((await link(f.finding, next)).statusCode).toBe(200);
      expect(await activeTaskLinks(f.finding)).toEqual(active);
      const other = await insertTaskRow(migrate, {
        workspaceId: WORKSPACE_ID,
        primaryManagedSystemId: f.ms,
        createdBy: admin,
      });
      const rejected = await link(f.finding, other.id);
      expect(rejected.statusCode).toBe(422);
      expect(rejected.json()).toMatchObject({
        code: 'validation.failed',
        detail: { fields: [{ path: ['linked_task_id'], code: 'already_linked' }] },
      });
    },
  );

  it.each(['same', 'different'] as const)(
    'repairs a stale non-null projection when linking a %s Task',
    async (variant) => {
      const f = await fixture();
      await migrate.pool.query('update finding.findings set linked_task_id=$1 where id=$2', [
        f.task,
        f.finding,
      ]);
      const next =
        variant === 'same'
          ? f.task
          : (
              await insertTaskRow(migrate, {
                workspaceId: WORKSPACE_ID,
                primaryManagedSystemId: f.ms,
                createdBy: admin,
              })
            ).id;
      const response = await link(f.finding, next);
      expect(response.statusCode).toBe(200);
      expect(response.json().linked_task_id).toBe(next);
      expect(await projection(f.finding)).toBe(next);
      expect((await activeTaskLinks(f.finding)).map((row) => row.target_id)).toEqual([next]);
    },
  );

  it.each(['draft', 'task-request'] as const)(
    'preserves execution=none exclusion for %s after Task detach',
    async (variant) => {
      const f = await fixture(variant === 'draft' ? 'draft' : 'active');
      if (variant === 'task-request') {
        const request = await insertTaskRequestRow(migrate, {
          workspaceId: WORKSPACE_ID,
          sourceId: f.finding,
          primaryManagedSystemId: f.ms,
          requesterActorId: admin,
        });
        await seedLink(f.ms, 'finding', f.finding, 'task_request', request.id, 'requested_task');
      }
      expect((await link(f.finding, f.task)).statusCode).toBe(200);
      const active = (await activeTaskLinks(f.finding))[0];
      if (!active) throw new Error('Task link missing');
      expect((await detach(active.id)).statusCode).toBe(200);
      expect(await projection(f.finding)).toBeNull();
      expect(await executionNone(f.ms)).not.toContain(f.finding);
    },
  );
});
