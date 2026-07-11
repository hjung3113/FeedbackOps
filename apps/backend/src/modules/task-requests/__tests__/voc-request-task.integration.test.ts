// VOC / VOC Cluster -> Task Request creation (#136).
//
// Gate: DATABASE_URL + DATABASE_URL_MIGRATE + WORKSPACE_ID. The conductor runs
// this outside the sandbox after applying migration 0026.

import { randomUUID } from 'node:crypto';

import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { loadConfig } from '../../../config.js';
import { type DbHandle, createDb } from '../../../db/client.js';
import { buildServer } from '../../../server.js';
import {
  SESSION_COOKIE_NAME,
  cleanupReadTestTables,
  grantCapability,
  insertDevActor,
  insertMsDirectly,
  insertVocDirectly,
  loginAs,
  uid,
} from '../../voc/__tests__/_seed-helpers.js';
import { insertVocClusterRow } from '../../voc-clusters/__tests__/_seed-helpers.js';

const APP_URL = process.env.DATABASE_URL ?? '';
const MIGRATE_URL = process.env.DATABASE_URL_MIGRATE ?? '';
const WORKSPACE_ID = process.env.WORKSPACE_ID ?? '';
const runIntegration = Boolean(APP_URL && MIGRATE_URL && WORKSPACE_ID);

const SLUG_PREFIX = 'it-voc-request-task';

type SourceKind = 'voc' | 'voc_cluster';

describe.skipIf(!runIntegration)('voc request-task source creation (#136)', () => {
  let dbHandle: DbHandle;
  let migrateHandle: DbHandle;
  let app: FastifyInstance;
  let adminCookie: string;
  let userCookie: string;
  let adminActorId: string;
  let userActorId: string;

  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    dbHandle = createDb(APP_URL);
    migrateHandle = createDb(MIGRATE_URL);
    app = await buildServer({ config: loadConfig(), dbHandle });
    await app.ready();

    adminCookie = await loginAs(app, 'mock-admin-1');
    userCookie = await loginAs(app, 'mock-user-1');

    const actors = await dbHandle.pool.query<{ id: string; external_id: string }>(
      `select id, external_id
         from core.actors
        where workspace_id = $1
          and external_id in ('mock-admin-1', 'mock-user-1')`,
      [WORKSPACE_ID],
    );
    adminActorId = actors.rows.find((row) => row.external_id === 'mock-admin-1')?.id ?? '';
    userActorId = actors.rows.find((row) => row.external_id === 'mock-user-1')?.id ?? '';
    if (!adminActorId || !userActorId) throw new Error('seed actors not found');
  });

  beforeEach(async () => {
    await cleanupFixtures();
  });

  afterAll(async () => {
    await cleanupFixtures();
    await app?.close();
    await dbHandle?.close();
    await migrateHandle?.close();
  });

  async function cleanupFixtures(): Promise<void> {
    if (!migrateHandle) return;
    await migrateHandle.pool.query(
      `delete from core.audit_log
        where workspace_id = $1
          and event_type in (
            'task_request_created_from_voc',
            'task_request_created_from_voc_cluster',
            'entity_link.created'
          )`,
      [WORKSPACE_ID],
    );
    await migrateHandle.pool.query(
      `delete from core.entity_links
        where workspace_id = $1
          and relation_type = 'requested_task'
          and source_type in ('voc', 'voc_cluster')`,
      [WORKSPACE_ID],
    );
    await migrateHandle.pool.query(
      `delete from task_request.task_requests
        where workspace_id = $1
          and primary_managed_system_id in (
            select id from core.managed_systems where workspace_id = $1 and slug like $2
          )`,
      [WORKSPACE_ID, `${SLUG_PREFIX}%`],
    );
    await migrateHandle.pool.query(
      `delete from permission.permission_grants
        where workspace_id = $1
          and actor_id in (
            select id from core.actors
             where workspace_id = $1
               and (external_id like 'mock-dev-read-%' or external_id = 'mock-user-1')
          )`,
      [WORKSPACE_ID],
    );
    await migrateHandle.pool.query(
      `delete from core.idempotency_keys
        where actor_id in (
          select id from core.actors
           where workspace_id = $1
             and (
               external_id in ('mock-admin-1', 'mock-user-1')
               or external_id like 'mock-dev-read-%'
             )
        )`,
      [WORKSPACE_ID],
    );
    await migrateHandle.pool.query(
      `delete from core.rate_limits
        where key like $1 || ':%'
           or key like '127.0.0.%'`,
      [WORKSPACE_ID],
    );
    await migrateHandle.pool.query(
      `delete from voc_cluster.voc_cluster_members
        where cluster_id in (
          select id from voc_cluster.voc_clusters where workspace_id = $1
        )`,
      [WORKSPACE_ID],
    );
    await migrateHandle.pool.query('delete from voc_cluster.voc_clusters where workspace_id = $1', [
      WORKSPACE_ID,
    ]);
    await cleanupReadTestTables(dbHandle, WORKSPACE_ID, SLUG_PREFIX);
  }

  async function seedVocSource(): Promise<{ id: string; msId: string }> {
    const msId = await insertMsDirectly(dbHandle, WORKSPACE_ID, uid(SLUG_PREFIX), 'VOC Request MS');
    const voc = await insertVocDirectly(
      dbHandle,
      WORKSPACE_ID,
      msId,
      userActorId,
      'VOC source for task request',
    );
    return { id: voc.id, msId };
  }

  async function seedClusterSource(): Promise<{ id: string; msId: string }> {
    const msId = await insertMsDirectly(
      dbHandle,
      WORKSPACE_ID,
      uid(SLUG_PREFIX),
      'Cluster Request MS',
    );
    const cluster = await insertVocClusterRow(migrateHandle, {
      workspaceId: WORKSPACE_ID,
      title: 'Cluster source for task request',
      summary: 'Repeated timeout complaints',
      status: 'confirmed',
      primaryManagedSystemId: msId,
      createdBy: adminActorId,
    });
    return { id: cluster.id, msId };
  }

  function requestTask(
    cookie: string,
    source: SourceKind,
    sourceId: string,
    idempotencyKey = randomUUID(),
  ) {
    const path =
      source === 'voc'
        ? `/vocs/${sourceId}/request-task`
        : `/voc-clusters/${sourceId}/request-task`;
    return app.inject({
      method: 'POST',
      url: path,
      headers: {
        cookie: `${SESSION_COOKIE_NAME}=${cookie}`,
        'content-type': 'application/json',
        'idempotency-key': idempotencyKey,
      },
      payload: {
        evidence_summary: `${source} evidence summary`,
        requested_outcome: `${source} requested outcome`,
      },
    });
  }

  function listTaskRequests(cookie: string) {
    return app.inject({
      method: 'GET',
      url: '/task-requests?status=pending_review',
      headers: { cookie: `${SESSION_COOKIE_NAME}=${cookie}` },
    });
  }

  async function assertCreatedRequest(input: {
    source: SourceKind;
    sourceId: string;
    taskRequestId: string;
    msId: string;
  }): Promise<void> {
    const sourceColumn = input.source === 'voc' ? 'source_voc_id' : 'source_voc_cluster_id';
    const auditType =
      input.source === 'voc'
        ? 'task_request_created_from_voc'
        : 'task_request_created_from_voc_cluster';

    const rows = await dbHandle.pool.query<{
      source_type: string;
      source_id: string;
      status: string;
      primary_managed_system_id: string;
    }>(
      `select source_type, source_id, status, primary_managed_system_id
         from task_request.task_requests
        where id = $1 and workspace_id = $2`,
      [input.taskRequestId, WORKSPACE_ID],
    );
    expect(rows.rows[0]).toMatchObject({
      source_type: input.source,
      source_id: input.sourceId,
      status: 'pending_review',
      primary_managed_system_id: input.msId,
    });

    const link = await dbHandle.pool.query<{ id: string }>(
      `select id
         from core.entity_links
        where workspace_id = $1
          and source_type = $2
          and source_id = $3
          and target_type = 'task_request'
          and target_id = $4
          and relation_type = 'requested_task'
          and status = 'active'`,
      [WORKSPACE_ID, input.source, input.sourceId, input.taskRequestId],
    );
    expect(link.rowCount).toBe(1);

    const audit = await dbHandle.pool.query<{ detail: Record<string, unknown> }>(
      `select detail
         from core.audit_log
        where workspace_id = $1
          and event_type = $2
          and subject_id = $3`,
      [WORKSPACE_ID, auditType, input.taskRequestId],
    );
    expect(audit.rowCount).toBe(1);
    expect(audit.rows[0]?.detail).toMatchObject({
      task_request_id: input.taskRequestId,
      [sourceColumn]: input.sourceId,
      primary_managed_system_id: input.msId,
      source_type: input.source,
    });
  }

  it.each([['voc', seedVocSource] as const, ['voc_cluster', seedClusterSource] as const])(
    'POST /%s request-task creates a pending_review request, source link, audit, and queue item',
    async (source, seed) => {
      const seeded = await seed();

      const res = await requestTask(adminCookie, source, seeded.id);
      expect(res.statusCode).toBe(201);
      const body = res.json<{
        id: string;
        source_type: SourceKind;
        source: { type: SourceKind; id: string; relation_type: string; link_id: string };
      }>();
      expect(body).toMatchObject({
        source_type: source,
        source_id: seeded.id,
        primary_managed_system_id: seeded.msId,
        status: 'pending_review',
        source: {
          type: source,
          id: seeded.id,
          relation_type: 'requested_task',
        },
      });

      await assertCreatedRequest({
        source,
        sourceId: seeded.id,
        taskRequestId: body.id,
        msId: seeded.msId,
      });

      const queue = await listTaskRequests(adminCookie);
      expect(queue.statusCode).toBe(200);
      const queueItem = queue
        .json<{ items: Array<{ id: string; source?: { type: SourceKind } }> }>()
        .items.find((item) => item.id === body.id);
      expect(queueItem).toMatchObject({
        id: body.id,
        source: { type: source },
      });
    },
  );

  it('POST /vocs/:id/request-task is idempotent and requires VOC triage authority', async () => {
    const seeded = await seedVocSource();
    const key = randomUUID();

    const first = await requestTask(adminCookie, 'voc', seeded.id, key);
    const second = await requestTask(adminCookie, 'voc', seeded.id, key);
    expect(first.statusCode).toBe(201);
    expect(second.statusCode).toBe(201);
    expect(second.json()).toEqual(first.json());

    const count = await dbHandle.pool.query<{ n: number }>(
      `select count(*)::int as n
         from task_request.task_requests
        where workspace_id = $1
          and source_type = 'voc'
          and source_id = $2`,
      [WORKSPACE_ID, seeded.id],
    );
    expect(count.rows[0]?.n).toBe(1);

    const denied = await requestTask(userCookie, 'voc', seeded.id);
    expect(denied.statusCode).toBe(403);
    expect(denied.json<{ code: string }>().code).toBe('permission.denied');
  });

  it('POST /voc-clusters/:id/request-task is idempotent and requires cluster authority', async () => {
    const seeded = await seedClusterSource();
    const key = randomUUID();

    const first = await requestTask(adminCookie, 'voc_cluster', seeded.id, key);
    const second = await requestTask(adminCookie, 'voc_cluster', seeded.id, key);
    expect(first.statusCode).toBe(201);
    expect(second.statusCode).toBe(201);
    expect(second.json()).toEqual(first.json());

    const count = await dbHandle.pool.query<{ n: number }>(
      `select count(*)::int as n
         from task_request.task_requests
        where workspace_id = $1
          and source_type = 'voc_cluster'
          and source_id = $2`,
      [WORKSPACE_ID, seeded.id],
    );
    expect(count.rows[0]?.n).toBe(1);

    const { id: devId, externalId } = await insertDevActor(dbHandle, WORKSPACE_ID, uid('cluster'));
    await grantCapability(
      dbHandle,
      WORKSPACE_ID,
      devId,
      'finding.manage',
      seeded.msId,
      adminActorId,
    );
    const devCookie = await loginAs(app, externalId);
    const allowed = await requestTask(devCookie, 'voc_cluster', seeded.id);
    expect(allowed.statusCode).toBe(201);

    const denied = await requestTask(userCookie, 'voc_cluster', seeded.id);
    expect(denied.statusCode).toBe(403);
    expect(denied.json<{ code: string }>().code).toBe('permission.denied');
  });

  it('unknown VOC and unknown VOC Cluster return not_found', async () => {
    const unknownVoc = await requestTask(adminCookie, 'voc', randomUUID());
    expect(unknownVoc.statusCode).toBe(404);
    expect(unknownVoc.json<{ code: string }>().code).toBe('not_found.record');

    const unknownCluster = await requestTask(adminCookie, 'voc_cluster', randomUUID());
    expect(unknownCluster.statusCode).toBe(404);
    expect(unknownCluster.json<{ code: string }>().code).toBe('not_found.record');
  });
});
