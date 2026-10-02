// Task Request list managed_system_id filter (#395).
//
// Gate: DATABASE_URL + DATABASE_URL_MIGRATE + WORKSPACE_ID. The conductor runs
// this outside the sandbox.

import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { taskRequestDtoSchema } from '@fops/shared';

import { loadConfig } from '../../../config.js';
import { type DbHandle, createDb } from '../../../db/client.js';
import { buildServer } from '../../../server.js';
import { insertDevActor } from '../../../test-support/actor-fixtures.js';
import { SESSION_COOKIE_NAME, loginAs } from '../../../test-support/auth.js';
import { insertMsDirectly } from '../../../test-support/core-fixtures.js';
import { insertFindingRow } from '../../../test-support/findings-fixtures.js';
import { randomUUID, uid } from '../../../test-support/ids.js';
import {
  denyCapability,
  grantCapability,
  revokeDeny,
} from '../../../test-support/permissions-fixtures.js';
import { cleanupReadTestTables, insertVocDirectly } from '../../../test-support/voc-fixtures.js';
import { insertTaskRequestRow } from './_seed-helpers.js';

const APP_URL = process.env.DATABASE_URL ?? '';
const MIGRATE_URL = process.env.DATABASE_URL_MIGRATE ?? '';
const WORKSPACE_ID = process.env.WORKSPACE_ID ?? '';
const runIntegration = Boolean(APP_URL && MIGRATE_URL && WORKSPACE_ID);

const SLUG_PREFIX = 'it-task-req-list';

describe.skipIf(!runIntegration)('task-request list managed_system_id filter (#395)', () => {
  let dbHandle: DbHandle;
  let migrateHandle: DbHandle;
  let app: FastifyInstance;
  let adminCookie: string;
  let adminActorId: string;
  let userActorId: string;
  let vocId: string;
  let msAId: string;
  let msBId: string;
  let requestAId: string;
  let requestBId: string;

  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    dbHandle = createDb(APP_URL);
    migrateHandle = createDb(MIGRATE_URL);
    app = await buildServer({ config: loadConfig(), dbHandle });
    await app.ready();

    adminCookie = await loginAs(app, 'mock-admin-1');

    const actors = await dbHandle.pool.query<{ id: string; external_id: string }>(
      `select id, external_id
         from core.actors
        where workspace_id = $1
          and external_id = 'mock-admin-1'`,
      [WORKSPACE_ID],
    );
    adminActorId = actors.rows.find((row) => row.external_id === 'mock-admin-1')?.id ?? '';
    // A reporter actor for the seeded VOC; mock-user-1 exists in the seed set.
    const reporters = await dbHandle.pool.query<{ id: string; external_id: string }>(
      `select id, external_id
         from core.actors
        where workspace_id = $1
          and external_id = 'mock-user-1'`,
      [WORKSPACE_ID],
    );
    userActorId = reporters.rows.find((row) => row.external_id === 'mock-user-1')?.id ?? '';
    if (!adminActorId || !userActorId) throw new Error('seed actors not found');
  });

  beforeEach(async () => {
    await cleanupFixtures();
    await seedFixtures();
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
      `delete from core.entity_links
        where workspace_id = $1
          and managed_system_id in (
            select id from core.managed_systems where workspace_id = $1 and slug like $2
          )`,
      [WORKSPACE_ID, `${SLUG_PREFIX}%`],
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
      `delete from finding.findings
        where workspace_id = $1
          and primary_managed_system_id in (
            select id from core.managed_systems where workspace_id = $1 and slug like $2
          )`,
      [WORKSPACE_ID, `${SLUG_PREFIX}%`],
    );
    await migrateHandle.pool.query(
      `delete from voc.vocs
        where workspace_id = $1
          and primary_managed_system_id in (
            select id from core.managed_systems where workspace_id = $1 and slug like $2
          )`,
      [WORKSPACE_ID, `${SLUG_PREFIX}%`],
    );
    await migrateHandle.pool.query(
      `delete from core.rate_limits
        where key like $1 || ':%'
           or key like '127.0.0.%'`,
      [WORKSPACE_ID],
    );
    await cleanupReadTestTables(dbHandle, WORKSPACE_ID, SLUG_PREFIX);
  }

  async function seedFixtures(): Promise<void> {
    msAId = await insertMsDirectly(dbHandle, WORKSPACE_ID, uid(SLUG_PREFIX), 'MS A');
    msBId = await insertMsDirectly(dbHandle, WORKSPACE_ID, uid(SLUG_PREFIX), 'MS B');
    const voc = await insertVocDirectly(
      dbHandle,
      WORKSPACE_ID,
      msAId,
      userActorId,
      'Task request filter seed VOC',
    );
    vocId = voc.id;
    const requestA = await insertTaskRequestRow(migrateHandle, {
      workspaceId: WORKSPACE_ID,
      sourceType: 'voc',
      sourceId: vocId,
      primaryManagedSystemId: msAId,
      evidenceSummary: 'MS A evidence',
      requestedOutcome: 'MS A outcome',
      requesterActorId: userActorId,
      status: 'pending_review',
    });
    const requestB = await insertTaskRequestRow(migrateHandle, {
      workspaceId: WORKSPACE_ID,
      sourceType: 'voc',
      sourceId: vocId,
      primaryManagedSystemId: msBId,
      evidenceSummary: 'MS B evidence',
      requestedOutcome: 'MS B outcome',
      requesterActorId: userActorId,
      status: 'pending_review',
    });
    requestAId = requestA.id;
    requestBId = requestB.id;
  }

  function listTaskRequests(managedSystemId?: string, cookie = adminCookie) {
    const query = managedSystemId === undefined ? '' : `?managed_system_id=${managedSystemId}`;
    return app.inject({
      method: 'GET',
      url: `/task-requests${query}`,
      headers: { cookie: `${SESSION_COOKIE_NAME}=${cookie}` },
    });
  }

  async function insertRequestedTaskLink(
    sourceType: 'finding' | 'voc',
    sourceId: string,
    requestId: string,
    managedSystemId: string,
  ): Promise<void> {
    await migrateHandle.pool.query(
      `insert into core.entity_links (
          workspace_id, source_type, source_id, target_type, target_id,
          relation_type, visibility, status, managed_system_id, created_by
        )
       values ($1, $2, $3, 'task_request', $4, 'requested_task',
               'internal_only', 'active', $5, $6)`,
      [WORKSPACE_ID, sourceType, sourceId, requestId, managedSystemId, adminActorId],
    );
  }

  function ids(body: { items: Array<{ id: string }> }): string[] {
    return body.items.map((item) => item.id);
  }

  it('AC-395-1: managed_system_id=<ms-a> returns only ms-a task requests', async () => {
    const res = await listTaskRequests(msAId);
    expect(res.statusCode).toBe(200);
    const resIds = ids(res.json<{ items: Array<{ id: string }> }>());
    expect(resIds).toContain(requestAId);
    expect(resIds).not.toContain(requestBId);
  });

  it('AC-395-2: managed_system_id=all and omitted parameter both return all task requests', async () => {
    const all = await listTaskRequests('all');
    expect(all.statusCode).toBe(200);
    const allIds = ids(all.json<{ items: Array<{ id: string }> }>());
    expect(allIds).toContain(requestAId);
    expect(allIds).toContain(requestBId);

    const omitted = await listTaskRequests();
    expect(omitted.statusCode).toBe(200);
    const omittedIds = ids(omitted.json<{ items: Array<{ id: string }> }>());
    expect(omittedIds).toContain(requestAId);
    expect(omittedIds).toContain(requestBId);
  });

  it('AC-395-3: managed_system_id=not-a-uuid fails validation with 422', async () => {
    const res = await listTaskRequests('not-a-uuid');
    expect(res.statusCode).toBe(422);
    expect(res.json<{ code: string }>().code).toBe('validation.failed');
  });

  it('returns Finding metadata and omits unreadable VOC metadata from source links', async () => {
    const finding = await insertFindingRow(migrateHandle, {
      workspaceId: WORKSPACE_ID,
      primaryManagedSystemId: msAId,
      title: 'Task Request source finding',
      summary: 'Source finding summary',
      sourceId: randomUUID(),
      evidenceCount: 7,
      createdBy: adminActorId,
    });
    const findingRequest = await insertTaskRequestRow(migrateHandle, {
      workspaceId: WORKSPACE_ID,
      sourceType: 'finding',
      sourceId: finding.id,
      primaryManagedSystemId: msAId,
      requesterActorId: userActorId,
    });
    await insertRequestedTaskLink('finding', finding.id, findingRequest.id, msAId);
    await insertRequestedTaskLink('voc', vocId, requestAId, msAId);

    const adminResponse = await listTaskRequests(msAId);
    expect(adminResponse.statusCode).toBe(200);
    const adminItems = adminResponse.json<{ items: unknown[] }>().items;
    const findingDto = taskRequestDtoSchema.parse(
      adminItems.find((item) => (item as { id?: string }).id === findingRequest.id),
    );
    expect(findingDto.source).toMatchObject({
      display_id: finding.display_id,
      title: 'Task Request source finding',
      evidence_count: 7,
    });

    const vocDto = taskRequestDtoSchema.parse(
      adminItems.find((item) => (item as { id?: string }).id === requestAId),
    );
    expect(vocDto.source).toMatchObject({
      display_id: expect.any(String),
      title: 'Task request filter seed VOC',
    });

    const { id: devActorId, externalId } = await insertDevActor(
      dbHandle,
      WORKSPACE_ID,
      uid('task-req-source'),
    );
    await grantCapability(
      dbHandle,
      WORKSPACE_ID,
      devActorId,
      'finding.manage',
      msAId,
      adminActorId,
    );
    const devCookie = await loginAs(app, externalId);
    const devResponse = await listTaskRequests(msAId, devCookie);
    expect(devResponse.statusCode).toBe(200);
    const devItems = devResponse.json<{ items: unknown[] }>().items;
    const readableFinding = taskRequestDtoSchema.parse(
      devItems.find((item) => (item as { id?: string }).id === findingRequest.id),
    );
    expect(readableFinding.source?.display_id).toBe(finding.display_id);

    const unreadableVoc = taskRequestDtoSchema.parse(
      devItems.find((item) => (item as { id?: string }).id === requestAId),
    );
    expect(unreadableVoc.source).toMatchObject({ type: 'voc' });
    expect(unreadableVoc.source).not.toHaveProperty('display_id');
    expect(unreadableVoc.source).not.toHaveProperty('title');
  });

  it.each([
    { scope: 'Managed-System-scoped', managedSystemId: () => msAId },
    { scope: 'workspace-wide', managedSystemId: () => null },
  ])(
    'omits source VOC text for a non-reporter Admin with a $scope voc.read deny',
    async ({ managedSystemId }) => {
      await insertRequestedTaskLink('voc', vocId, requestAId, msAId);

      const reader = await insertDevActor(dbHandle, WORKSPACE_ID, uid('task-req-admin-voc'));
      await migrateHandle.pool.query("update core.actors set role_level = 'admin' where id = $1", [
        reader.id,
      ]);
      const readerCookie = await loginAs(app, reader.externalId);

      const readableResponse = await listTaskRequests(msAId, readerCookie);
      expect(readableResponse.statusCode).toBe(200);
      const readableItem = taskRequestDtoSchema.parse(
        readableResponse
          .json<{ items: unknown[] }>()
          .items.find((item) => (item as { id?: string }).id === requestAId),
      );
      expect(readableItem.source).toMatchObject({
        display_id: expect.any(String),
        title: 'Task request filter seed VOC',
      });

      const denyId = await denyCapability(
        dbHandle,
        WORKSPACE_ID,
        reader.id,
        'voc.read',
        managedSystemId(),
        adminActorId,
      );
      try {
        const deniedResponse = await listTaskRequests(msAId, readerCookie);
        expect(deniedResponse.statusCode).toBe(200);
        const deniedItem = taskRequestDtoSchema.parse(
          deniedResponse
            .json<{ items: unknown[] }>()
            .items.find((item) => (item as { id?: string }).id === requestAId),
        );
        expect(deniedItem.source).toMatchObject({ type: 'voc' });
        expect(deniedItem.source).not.toHaveProperty('display_id');
        expect(deniedItem.source).not.toHaveProperty('title');
        expect(deniedResponse.body).not.toContain('Task request filter seed VOC');
      } finally {
        await revokeDeny(dbHandle, denyId, adminActorId);
      }
    },
  );
});
