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

  it('AC-981: walks opt-in pages in full-list order with exact first-page total', async () => {
    const headers = { cookie: `${SESSION_COOKIE_NAME}=${adminCookie}` };
    const full = await app.inject({
      method: 'GET',
      url: `/task-requests?managed_system_id=${msAId}`,
      headers,
    });
    expect(Object.keys(full.json())).toEqual(['items']);
    const expected = full.json<{ items: Array<{ id: string }> }>().items.map((row) => row.id);
    const walked: string[] = [];
    let cursor: string | undefined;
    do {
      const params = new URLSearchParams({ managed_system_id: msAId, limit: '2' });
      if (cursor !== undefined) params.set('cursor', cursor);
      const response = await app.inject({
        method: 'GET',
        url: `/task-requests?${params}`,
        headers,
      });
      expect(response.statusCode).toBe(200);
      const body = response.json<{
        items: Array<{ id: string }>;
        page: { total?: number; has_more: boolean; cursor?: string };
      }>();
      expect(body.page.total).toBe(cursor === undefined ? expected.length : undefined);
      walked.push(...body.items.map((row) => row.id));
      expect(body.page.has_more).toBe(walked.length < expected.length);
      expect(body.page.cursor !== undefined).toBe(body.page.has_more);
      cursor = body.page.cursor;
    } while (cursor !== undefined);
    expect(walked).toEqual(expected);
    expect(new Set(walked).size).toBe(walked.length);
  });

  it.each(['limit=101', 'limit=2&cursor=bad'])(
    'AC-981: rejects invalid paging %s',
    async (query) => {
      const response = await app.inject({
        method: 'GET',
        url: `/task-requests?${query}`,
        headers: { cookie: `${SESSION_COOKIE_NAME}=${adminCookie}` },
      });
      expect(response.statusCode).toBe(422);
      expect(response.json()).toEqual({
        code: 'validation.failed',
        message: query.includes('cursor') ? 'invalid cursor' : 'invalid query parameters',
        detail: {
          fields: [
            {
              path: [query.includes('cursor') ? 'cursor' : 'limit'],
              code: query.includes('cursor') ? 'invalid_cursor' : 'too_big',
            },
          ],
        },
      });
    },
  );

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
    expect(Object.keys(omitted.json())).toEqual(['items']);
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

  it('returns source VOC metadata to its Developer reporter without voc.read', async () => {
    const developer = await insertDevActor(dbHandle, WORKSPACE_ID, uid('task-req-reporter'));
    await grantCapability(
      dbHandle,
      WORKSPACE_ID,
      developer.id,
      'finding.manage',
      msAId,
      adminActorId,
    );
    const voc = await insertVocDirectly(
      dbHandle,
      WORKSPACE_ID,
      msAId,
      developer.id,
      'Developer reporter source VOC',
    );
    const request = await insertTaskRequestRow(migrateHandle, {
      workspaceId: WORKSPACE_ID,
      sourceType: 'voc',
      sourceId: voc.id,
      primaryManagedSystemId: msAId,
      requesterActorId: developer.id,
    });
    await insertRequestedTaskLink('voc', voc.id, request.id, msAId);
    const cookie = await loginAs(app, developer.externalId);
    const response = await listTaskRequests(msAId, cookie);
    expect(response.statusCode).toBe(200);
    const item = taskRequestDtoSchema.parse(
      response
        .json<{ items: unknown[] }>()
        .items.find((row) => (row as { id?: string }).id === request.id),
    );
    expect(item.source).toMatchObject({
      type: 'voc',
      id: voc.id,
      relation_type: 'requested_task',
      link_id: expect.any(String),
      display_id: expect.any(String),
      title: 'Developer reporter source VOC',
    });
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
  it('AC-981: visibility precedes limit, cursor walks exact order, and explicit deny applies in both modes', async () => {
    for (let i = 0; i < 4; i += 1) {
      await insertTaskRequestRow(migrateHandle, {
        workspaceId: WORKSPACE_ID,
        primaryManagedSystemId: msAId,
        sourceType: 'voc',
        sourceId: vocId,
        evidenceSummary: 'page',
        requestedOutcome: `Page A ${i}`,
        requesterActorId: userActorId,
        status: i === 0 ? 'approved' : 'pending_review',
      });
    }
    await insertTaskRequestRow(migrateHandle, {
      workspaceId: WORKSPACE_ID,
      primaryManagedSystemId: msBId,
      sourceType: 'voc',
      sourceId: vocId,
      evidenceSummary: 'page',
      requestedOutcome: 'Newest B',
      requesterActorId: userActorId,
      status: 'pending_review',
    });
    await migrateHandle.pool.query(
      "update task_request.task_requests set created_at = '2026-01-01 00:00:00.123456+00' where workspace_id = $1 and primary_managed_system_id = $2",
      [WORKSPACE_ID, msAId],
    );
    const developer = await insertDevActor(dbHandle, WORKSPACE_ID, uid('page-scope'));
    await grantCapability(
      dbHandle,
      WORKSPACE_ID,
      developer.id,
      'finding.manage',
      msAId,
      adminActorId,
    );
    const cookie = await loginAs(app, developer.externalId);
    const headers = { cookie: `${SESSION_COOKIE_NAME}=${cookie}` };
    const full = await app.inject({ method: 'GET', url: '/task-requests', headers });
    expect(full.statusCode).toBe(200);
    expect(Object.keys(full.json())).toEqual(['items']);
    const expected = full.json<{
      items: Array<{ id: string; primary_managed_system_id: string }>;
    }>().items;
    expect(expected.length).toBeGreaterThan(2);
    expect(expected.map((item) => item.id)).toEqual(
      expected
        .map((item) => item.id)
        .sort()
        .reverse(),
    );
    expect(expected.every((item) => item.primary_managed_system_id === msAId)).toBe(true);
    const walked: string[] = [];
    let cursor: string | undefined;
    do {
      const params = new URLSearchParams({ limit: '2' });
      if (cursor !== undefined) params.set('cursor', cursor);
      const response = await app.inject({
        method: 'GET',
        url: `/task-requests?${params}`,
        headers,
      });
      expect(response.statusCode).toBe(200);
      const body = response.json<{
        items: Array<{ id: string }>;
        page: { has_more: boolean; cursor?: string; total?: number };
      }>();
      expect(body.items).toHaveLength(Math.min(2, expected.length - walked.length));
      expect(body.page.total).toBe(cursor === undefined ? expected.length : undefined);
      walked.push(...body.items.map((item) => item.id));
      expect(body.page.has_more).toBe(walked.length < expected.length);
      expect(body.page.cursor !== undefined).toBe(body.page.has_more);
      cursor = body.page.cursor;
    } while (cursor !== undefined);
    expect(walked).toEqual(expected.map((item) => item.id));
    expect(new Set(walked).size).toBe(expected.length);
    await grantCapability(
      dbHandle,
      WORKSPACE_ID,
      developer.id,
      'finding.manage',
      msBId,
      adminActorId,
    );
    const denyId = await denyCapability(
      dbHandle,
      WORKSPACE_ID,
      developer.id,
      'finding.manage',
      msBId,
      adminActorId,
    );
    try {
      for (const query of ['', '?limit=2']) {
        const denied = await app.inject({ method: 'GET', url: `/task-requests${query}`, headers });
        expect(denied.statusCode).toBe(200);
        expect(
          denied
            .json()
            .items.every(
              (item: { primary_managed_system_id: string }) =>
                item.primary_managed_system_id === msAId,
            ),
        ).toBe(true);
        if (query) expect(denied.json().page.total).toBe(expected.length);
      }
    } finally {
      await revokeDeny(dbHandle, denyId, adminActorId);
    }
  });

  it('AC-981 detail matches list source and hides missing or unmanageable records with identical 404', async () => {
    await insertRequestedTaskLink('voc', vocId, requestAId, msAId);
    const headers = { cookie: `${SESSION_COOKIE_NAME}=${adminCookie}` };
    const listed = await listTaskRequests(msAId);
    const detail = await app.inject({
      method: 'GET',
      url: `/task-requests/${requestAId}`,
      headers,
    });
    expect(detail.statusCode).toBe(200);
    expect(taskRequestDtoSchema.parse(detail.json())).toEqual(
      listed.json().items.find((item: { id: string }) => item.id === requestAId),
    );
    const developer = await insertDevActor(dbHandle, WORKSPACE_ID, uid('detail-scope'));
    const cookie = await loginAs(app, developer.externalId);
    const deniedHeaders = { cookie: `${SESSION_COOKIE_NAME}=${cookie}` };
    const hidden = await app.inject({
      method: 'GET',
      url: `/task-requests/${requestAId}`,
      headers: deniedHeaders,
    });
    const missing = await app.inject({
      method: 'GET',
      url: `/task-requests/${randomUUID()}`,
      headers: deniedHeaders,
    });
    expect(hidden.statusCode).toBe(404);
    expect(missing.statusCode).toBe(404);
    expect(hidden.json()).toEqual(missing.json());
    expect(hidden.json().code).toBe('not_found.record');
  });

  it('AC-981 summary counts visible statuses and filtered pages contain only the requested status', async () => {
    for (let index = 0; index < 3; index += 1) {
      await insertTaskRequestRow(migrateHandle, {
        workspaceId: WORKSPACE_ID,
        primaryManagedSystemId: msAId,
        sourceType: 'voc',
        sourceId: vocId,
        evidenceSummary: 'approved',
        requestedOutcome: 'approved',
        requesterActorId: userActorId,
        status: 'approved',
      });
    }
    const developer = await insertDevActor(dbHandle, WORKSPACE_ID, uid('status-scope'));
    await grantCapability(
      dbHandle,
      WORKSPACE_ID,
      developer.id,
      'finding.manage',
      msAId,
      adminActorId,
    );
    const cookie = await loginAs(app, developer.externalId);
    const headers = { cookie: `${SESSION_COOKIE_NAME}=${cookie}` };
    const summary = await app.inject({ method: 'GET', url: '/task-requests?limit=1', headers });
    expect(summary.statusCode).toBe(200);
    expect(summary.json().page.total).toBe(4);
    expect(summary.json().page.status_counts).toEqual({
      pending_review: 1,
      approved: 3,
      rejected: 0,
      needs_more_evidence: 0,
      converted: 0,
    });
    const walked: string[] = [];
    let cursor: string | undefined;
    do {
      const query = new URLSearchParams({ limit: '2', status: 'approved' });
      if (cursor !== undefined) query.set('cursor', cursor);
      const filtered = await app.inject({ method: 'GET', url: `/task-requests?${query}`, headers });
      expect(filtered.statusCode).toBe(200);
      const body = filtered.json();
      expect(body.items.every((item: { status: string }) => item.status === 'approved')).toBe(true);
      expect(body.page.status_counts).toBeUndefined();
      if (cursor === undefined) {
        expect(body.page.total).toBe(3);
        expect(body.items).toHaveLength(2);
        expect(body.page.has_more).toBe(true);
      } else {
        expect(body.page.total).toBeUndefined();
        expect(body.page.has_more).toBe(false);
        expect(body.page.cursor).toBeUndefined();
      }
      walked.push(...body.items.map((item: { id: string }) => item.id));
      cursor = body.page.cursor;
    } while (cursor !== undefined);
    expect(walked).toHaveLength(3);
    expect(new Set(walked).size).toBe(3);
  });
});
