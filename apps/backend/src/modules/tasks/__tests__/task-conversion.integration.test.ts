// Task conversion and link-existing flow (#134).
//
// Gate: DATABASE_URL + DATABASE_URL_MIGRATE + WORKSPACE_ID. The conductor runs
// this outside the sandbox after applying migration 0025.

import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';

import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { loadConfig } from '../../../config.js';
import { type DbHandle, createDb } from '../../../db/client.js';
import { buildServer } from '../../../server.js';
import { insertFindingRow } from '../../findings/__tests__/_seed-helpers.js';
import { insertTaskRequestRow } from '../../task-requests/__tests__/_seed-helpers.js';
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
import { insertTaskRow } from './_seed-helpers.js';

const APP_URL = process.env.DATABASE_URL ?? '';
const MIGRATE_URL = process.env.DATABASE_URL_MIGRATE ?? '';
const WORKSPACE_ID = process.env.WORKSPACE_ID ?? '';
const runIntegration = Boolean(APP_URL && MIGRATE_URL && WORKSPACE_ID);

const SLUG_PREFIX = 'it-task-convert';

describe.skipIf(!runIntegration)('task conversion and link-existing (#134)', () => {
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
            'task_created_from_request',
            'task_linked_to_request',
            'task_request_approved',
            'entity_link.created'
          )`,
      [WORKSPACE_ID],
    );
    await migrateHandle.pool.query(
      `delete from core.entity_links
        where workspace_id = $1
          and managed_system_id in (
            select id from core.managed_systems where workspace_id = $1 and slug like $2
          )`,
      [WORKSPACE_ID, `${SLUG_PREFIX}%`],
    );
    await migrateHandle.pool.query(
      `delete from task.tasks
        where workspace_id = $1
          and primary_managed_system_id in (
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
      `delete from permission.permission_grants
        where workspace_id = $1
          and actor_id in (
            select id from core.actors
             where workspace_id = $1
               and external_id like 'mock-dev-read-%'
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
    await cleanupReadTestTables(dbHandle, WORKSPACE_ID, SLUG_PREFIX);
  }

  async function seedFinding(msId: string, title = 'Seed finding'): Promise<string> {
    const row = await insertFindingRow(migrateHandle, {
      workspaceId: WORKSPACE_ID,
      primaryManagedSystemId: msId,
      title,
      summary: 'Finding source summary',
      sourceId: randomUUID(),
      confidence: 'medium',
      status: 'active',
      createdBy: adminActorId,
    });
    return row.id;
  }

  async function seedApprovedTaskRequest(
    input: {
      msId?: string;
      status?: 'pending_review' | 'approved' | 'rejected' | 'needs_more_evidence' | 'converted';
      requesterActorId?: string;
      findingTitle?: string;
    } = {},
  ): Promise<{ id: string; msId: string; findingId: string; findingLinkId: string }> {
    const msId =
      input.msId ??
      (await insertMsDirectly(dbHandle, WORKSPACE_ID, uid(SLUG_PREFIX), 'Task Convert MS'));
    const findingId = await seedFinding(msId, input.findingTitle);
    const request = await insertTaskRequestRow(migrateHandle, {
      workspaceId: WORKSPACE_ID,
      sourceId: findingId,
      primaryManagedSystemId: msId,
      evidenceSummary: 'Evidence summary',
      requestedOutcome: 'Stabilize export pipeline',
      requesterActorId: input.requesterActorId ?? userActorId,
      status: input.status ?? 'approved',
      reviewerActorId: adminActorId,
      decisionReason: 'Approved in seed',
      decided: true,
    });
    const id = request.id;
    const link = await migrateHandle.pool.query<{ id: string }>(
      `insert into core.entity_links (
          workspace_id, source_type, source_id, target_type, target_id,
          relation_type, visibility, status, managed_system_id, created_by
        )
       values ($1, 'finding', $2, 'task_request', $3, 'requested_task',
               'internal_only', 'active', $4, $5)
       returning id`,
      [WORKSPACE_ID, findingId, id, msId, adminActorId],
    );
    const findingLinkId = link.rows[0]?.id;
    if (!findingLinkId) throw new Error('seed finding link failed');
    return { id, msId, findingId, findingLinkId };
  }

  async function seedTask(msId: string, title = 'Existing scoped task'): Promise<string> {
    const row = await insertTaskRow(migrateHandle, {
      workspaceId: WORKSPACE_ID,
      primaryManagedSystemId: msId,
      title,
      createdBy: adminActorId,
    });
    return row.id;
  }

  function convert(
    cookie: string,
    taskRequestId: string,
    payload: Record<string, unknown>,
    idempotencyKey = randomUUID(),
  ) {
    return app.inject({
      method: 'POST',
      url: `/task-requests/${taskRequestId}/convert`,
      headers: {
        cookie: `${SESSION_COOKIE_NAME}=${cookie}`,
        'content-type': 'application/json',
        'idempotency-key': idempotencyKey,
      },
      payload,
    });
  }

  function linkTask(
    cookie: string,
    taskRequestId: string,
    taskId: string,
    idempotencyKey = randomUUID(),
  ) {
    return app.inject({
      method: 'POST',
      url: `/task-requests/${taskRequestId}/link-task`,
      headers: {
        cookie: `${SESSION_COOKIE_NAME}=${cookie}`,
        'content-type': 'application/json',
        'idempotency-key': idempotencyKey,
      },
      payload: { task_id: taskId },
    });
  }

  function listTasks(cookie: string, query = '') {
    return app.inject({
      method: 'GET',
      url: `/tasks${query}`,
      headers: { cookie: `${SESSION_COOKIE_NAME}=${cookie}` },
    });
  }

  function getFinding(cookie: string, findingId: string) {
    return app.inject({
      method: 'GET',
      url: `/findings/${findingId}`,
      headers: { cookie: `${SESSION_COOKIE_NAME}=${cookie}` },
    });
  }

  async function seedConversionActor(suffix: string) {
    const actor = await insertDevActor(dbHandle, WORKSPACE_ID, uid(`mock-dev-read-c7-${suffix}`));
    const cookie = await loginAs(app, actor.externalId);
    return { ...actor, cookie };
  }

  function getEntityLinks(cookie: string, query: string) {
    return app.inject({
      method: 'GET',
      url: `/entity-links${query}`,
      headers: { cookie: `${SESSION_COOKIE_NAME}=${cookie}` },
    });
  }

  it('convert: approved request creates backlog task, marks converted, preserves finding link, and audits separately', async () => {
    const request = await seedApprovedTaskRequest();

    const res = await convert(adminCookie, request.id, {
      title: 'Stabilize export pipeline task',
      priority: 'high',
      assignee_actor_id: userActorId,
      due_date: '2026-08-15',
      milestone_id: null,
      analytics_area_id: null,
    });

    expect(res.statusCode).toBe(201);
    const body = res.json<{ id: string; status: string; source_task_request_id: string }>();
    expect(body).toMatchObject({
      title: 'Stabilize export pipeline task',
      status: 'backlog',
      priority: 'high',
      assignee_actor_id: userActorId,
      due_date: '2026-08-15',
      primary_managed_system_id: request.msId,
      source_task_request_id: request.id,
    });

    const taskRequest = await dbHandle.pool.query<{ status: string }>(
      'select status from task_request.task_requests where id = $1',
      [request.id],
    );
    expect(taskRequest.rows[0]?.status).toBe('converted');

    const links = await dbHandle.pool.query<{ relation_type: string; id: string }>(
      `select id, relation_type
         from core.entity_links
        where workspace_id = $1
          and target_type = 'task'
          and target_id = $2
          and status = 'active'
        order by relation_type`,
      [WORKSPACE_ID, body.id],
    );
    expect(links.rows.map((row) => row.relation_type)).toEqual(['converted_to', 'requested_task']);

    const audits = await dbHandle.pool.query<{
      event_type: string;
      detail: Record<string, unknown>;
    }>(
      `select event_type, detail
         from core.audit_log
        where workspace_id = $1
          and subject_id in ($2, $3)
          and event_type in ('task_created_from_request', 'task_request_approved')
        order by event_type`,
      [WORKSPACE_ID, body.id, request.id],
    );
    expect(audits.rows.map((row) => row.event_type)).toEqual(['task_created_from_request']);
    expect(audits.rows[0]?.detail).toMatchObject({
      task_id: body.id,
      source_task_request_id: request.id,
      primary_managed_system_id: request.msId,
    });
  });

  it('AC-C7a: conversion projects the exact new task id onto its Finding', async () => {
    const request = await seedApprovedTaskRequest({ findingTitle: 'C7a projection finding' });
    const actor = await seedConversionActor('a');
    await grantCapability(
      dbHandle,
      WORKSPACE_ID,
      actor.id,
      'finding.manage',
      request.msId,
      adminActorId,
    );

    const converted = await convert(actor.cookie, request.id, {
      title: 'C7a projected conversion task',
      priority: 'medium',
    });

    expect(converted.statusCode).toBe(201);
    const taskId = converted.json<{ id: string }>().id;
    const finding = await dbHandle.pool.query<{ linked_task_id: string | null }>(
      'select linked_task_id from finding.findings where id = $1',
      [request.findingId],
    );
    expect(finding.rows[0]?.linked_task_id).toBe(taskId);
  });

  it('AC-C7b: conversion creates exactly one complete Finding-to-Task history link', async () => {
    const request = await seedApprovedTaskRequest({ findingTitle: 'C7b entity link finding' });
    const actor = await seedConversionActor('b');
    await grantCapability(
      dbHandle,
      WORKSPACE_ID,
      actor.id,
      'finding.manage',
      request.msId,
      adminActorId,
    );

    const converted = await convert(actor.cookie, request.id, {
      title: 'C7b entity link conversion task',
      priority: 'high',
    });
    expect(converted.statusCode).toBe(201);
    const taskId = converted.json<{ id: string }>().id;
    const links = await dbHandle.pool.query<{
      workspace_id: string;
      source_type: string;
      source_id: string;
      target_type: string;
      target_id: string;
      relation_type: string;
      visibility: string;
      status: string;
      managed_system_id: string;
    }>(
      `select workspace_id, source_type, source_id, target_type, target_id, relation_type,
              visibility, status, managed_system_id
         from core.entity_links
        where workspace_id = $1 and source_type = 'finding' and source_id = $2
          and target_type = 'task' and target_id = $3 and relation_type = 'requested_task'`,
      [WORKSPACE_ID, request.findingId, taskId],
    );
    expect(links.rows).toEqual([
      {
        workspace_id: WORKSPACE_ID,
        source_type: 'finding',
        source_id: request.findingId,
        target_type: 'task',
        target_id: taskId,
        relation_type: 'requested_task',
        visibility: 'internal_only',
        status: 'active',
        managed_system_id: request.msId,
      },
    ]);
  });

  it('AC-C7c: VOC conversion succeeds before asserting it creates no Finding backlink', async () => {
    const msId = await insertMsDirectly(
      dbHandle,
      WORKSPACE_ID,
      uid(SLUG_PREFIX),
      'C7c VOC conversion MS',
    );
    const actor = await seedConversionActor('c');
    await grantCapability(dbHandle, WORKSPACE_ID, actor.id, 'finding.manage', msId, adminActorId);
    const voc = await insertVocDirectly(
      migrateHandle,
      WORKSPACE_ID,
      msId,
      actor.id,
      'C7c direct VOC',
    );
    const request = await insertTaskRequestRow(migrateHandle, {
      workspaceId: WORKSPACE_ID,
      sourceType: 'voc',
      sourceId: voc.id,
      primaryManagedSystemId: msId,
      requestedOutcome: 'C7c VOC conversion outcome',
      requesterActorId: actor.id,
      status: 'approved',
      reviewerActorId: adminActorId,
      decisionReason: 'C7c approved',
      decided: true,
    });
    await migrateHandle.pool.query(
      `insert into core.entity_links (
          workspace_id, source_type, source_id, target_type, target_id,
          relation_type, visibility, status, managed_system_id, created_by
        ) values ($1, 'voc', $2, 'task_request', $3, 'requested_task',
                  'internal_only', 'active', $4, $5)`,
      [WORKSPACE_ID, voc.id, request.id, msId, adminActorId],
    );

    const converted = await convert(actor.cookie, request.id, {
      title: 'C7c VOC conversion task',
      priority: 'low',
    });
    expect(converted.statusCode).toBe(201);
    expect(converted.json<{ id: string }>().id).toEqual(expect.any(String));

    const findingLinks = await dbHandle.pool.query<{ n: number }>(
      `select count(*)::int as n from core.entity_links
        where workspace_id = $1 and target_type = 'task' and target_id = $2
          and source_type = 'finding' and relation_type = 'requested_task'`,
      [WORKSPACE_ID, converted.json<{ id: string }>().id],
    );
    expect(findingLinks.rows[0]?.n).toBe(0);
  });

  it('AC-C7d: GET Finding projects the task id written by conversion', async () => {
    const request = await seedApprovedTaskRequest({ findingTitle: 'C7d GET Finding projection' });
    const actor = await seedConversionActor('d');
    await grantCapability(
      dbHandle,
      WORKSPACE_ID,
      actor.id,
      'finding.manage',
      request.msId,
      adminActorId,
    );
    await grantCapability(
      dbHandle,
      WORKSPACE_ID,
      actor.id,
      'finding.read',
      request.msId,
      adminActorId,
    );
    const converted = await convert(actor.cookie, request.id, {
      title: 'C7d Finding DTO conversion task',
      priority: 'urgent',
    });
    expect(converted.statusCode).toBe(201);

    const finding = await getFinding(actor.cookie, request.findingId);
    expect(finding.statusCode).toBe(200);
    expect(finding.json()).toMatchObject({
      id: request.findingId,
      linked_task_id: converted.json<{ id: string }>().id,
    });
  });

  it('AC-C7e: conversion preserves a pre-existing Finding projection while retaining history', async () => {
    const request = await seedApprovedTaskRequest({
      findingTitle: 'C7e conflicting projection finding',
    });
    const actor = await seedConversionActor('e');
    await grantCapability(
      dbHandle,
      WORKSPACE_ID,
      actor.id,
      'finding.manage',
      request.msId,
      adminActorId,
    );
    const existingTaskId = await seedTask(request.msId, 'C7e existing linked task');
    await migrateHandle.pool.query(
      'update finding.findings set linked_task_id = $1 where id = $2',
      [existingTaskId, request.findingId],
    );

    const converted = await convert(actor.cookie, request.id, {
      title: 'C7e conflicting conversion task',
      priority: 'medium',
    });
    expect(converted.statusCode).toBe(201);
    const taskId = converted.json<{ id: string }>().id;
    const finding = await dbHandle.pool.query<{ linked_task_id: string | null }>(
      'select linked_task_id from finding.findings where id = $1',
      [request.findingId],
    );
    expect(finding.rows[0]?.linked_task_id).toBe(existingTaskId);
    const history = await dbHandle.pool.query<{ n: number }>(
      `select count(*)::int as n from core.entity_links
        where workspace_id = $1 and source_type = 'finding' and source_id = $2
          and target_type = 'task' and target_id = $3 and relation_type = 'requested_task'
          and status = 'active'`,
      [WORKSPACE_ID, request.findingId, taskId],
    );
    expect(history.rows[0]?.n).toBe(1);
  });

  it('AC-C7f: an actor who can read the existing Finding is denied conversion without finding.manage', async () => {
    const request = await seedApprovedTaskRequest({
      findingTitle: 'C7f unauthorized existing Finding',
    });
    const actor = await seedConversionActor('f');
    await grantCapability(
      dbHandle,
      WORKSPACE_ID,
      actor.id,
      'finding.read',
      request.msId,
      adminActorId,
    );

    const readable = await getFinding(actor.cookie, request.findingId);
    expect(readable.statusCode).toBe(200);
    const denied = await convert(actor.cookie, request.id, {
      title: 'C7f denied conversion task',
      priority: 'medium',
    });
    expect(denied.statusCode).toBe(403);
    expect(denied.json<{ code: string }>().code).toBe('permission.denied');
  });

  it.each(['pending_review', 'rejected'] as const)(
    'convert rejects %s task request with not_approved validation code',
    async (status) => {
      const request = await seedApprovedTaskRequest({ status });

      const res = await convert(adminCookie, request.id, {
        title: 'Should not convert',
        priority: 'medium',
      });

      expect(res.statusCode).toBe(422);
      expect(res.json()).toMatchObject({
        code: 'validation.failed',
        detail: { fields: [{ path: ['status'], code: 'not_approved' }] },
      });
    },
  );

  it('convert idempotent replay does not create a duplicate task', async () => {
    const request = await seedApprovedTaskRequest();
    const key = randomUUID();
    const payload = { title: 'Repeatable conversion', priority: 'urgent' };

    const first = await convert(adminCookie, request.id, payload, key);
    const second = await convert(adminCookie, request.id, payload, key);

    expect(first.statusCode).toBe(201);
    expect(second.statusCode).toBe(201);
    expect(second.json()).toEqual(first.json());

    const count = await dbHandle.pool.query<{ n: number }>(
      `select count(*)::int as n
         from task.tasks
        where workspace_id = $1
          and source_task_request_id = $2`,
      [WORKSPACE_ID, request.id],
    );
    expect(count.rows[0]?.n).toBe(1);
  });

  it('convert: direct VOC request creates the reporter-visible evidence link and preserves its actor boundary', async () => {
    const msId = await insertMsDirectly(
      dbHandle,
      WORKSPACE_ID,
      uid(SLUG_PREFIX),
      'Direct VOC conversion MS',
    );
    const voc = await insertVocDirectly(
      migrateHandle,
      WORKSPACE_ID,
      msId,
      userActorId,
      'Direct task-request VOC',
    );
    const request = await insertTaskRequestRow(migrateHandle, {
      workspaceId: WORKSPACE_ID,
      sourceId: voc.id,
      primaryManagedSystemId: msId,
      evidenceSummary: 'Direct VOC evidence',
      requestedOutcome: 'Preserve direct evidence',
      requesterActorId: userActorId,
      status: 'approved',
      reviewerActorId: adminActorId,
      decisionReason: 'Approved in seed',
      decided: true,
    });
    await migrateHandle.pool.query(
      `insert into core.entity_links (
        workspace_id, source_type, source_id, target_type, target_id,
        relation_type, visibility, status, managed_system_id, created_by
      ) values ($1, 'voc', $2, 'task_request', $3, 'requested_task',
                'internal_only', 'active', $4, $5)`,
      [WORKSPACE_ID, voc.id, request.id, msId, adminActorId],
    );
    const key = randomUUID();
    const payload = { title: 'Task from direct VOC', priority: 'medium' };
    const first = await convert(adminCookie, request.id, payload, key);
    const second = await convert(adminCookie, request.id, payload, key);
    expect(first.statusCode).toBe(201);
    expect(second.statusCode).toBe(201);
    const taskId = first.json<{ id: string }>().id;
    const evidence = await dbHandle.pool.query<{ n: number; visibility: string }>(
      `select count(*)::int as n, max(visibility) as visibility
         from core.entity_links
        where workspace_id = $1 and source_type = 'voc' and source_id = $2
          and target_type = 'task' and target_id = $3
          and relation_type = 'evidence_of' and status = 'active'`,
      [WORKSPACE_ID, voc.id, taskId],
    );
    expect(evidence.rows[0]?.n).toBe(1);
    expect(evidence.rows[0]?.visibility).toBe('summary_visible');

    const reporter = await getEntityLinks(userCookie, `?source_type=voc&source_id=${voc.id}`);
    expect(reporter.statusCode).toBe(200);
    expect(reporter.json<{ items: Array<Record<string, unknown>> }>().items).toContainEqual(
      expect.objectContaining({
        visibility_state: 'summary_visible',
        summary: {
          target_type: 'task',
          public_title: 'Task from direct VOC',
          reporter_facing_status: '진행 예정',
        },
      }),
    );

    const inScopeDev = await insertDevActor(dbHandle, WORKSPACE_ID, uid(SLUG_PREFIX));
    await grantCapability(dbHandle, WORKSPACE_ID, inScopeDev.id, 'voc.read', msId, adminActorId);
    await grantCapability(
      dbHandle,
      WORKSPACE_ID,
      inScopeDev.id,
      'finding.read',
      msId,
      adminActorId,
    );
    const inScope = await getEntityLinks(
      await loginAs(app, inScopeDev.externalId),
      `?source_type=voc&source_id=${voc.id}`,
    );
    expect(inScope.statusCode).toBe(200);
    expect(inScope.json<{ items: Array<Record<string, unknown>> }>().items).toContainEqual(
      expect.objectContaining({ visibility_state: 'allowed', target_id: taskId }),
    );

    const sourceReadableTargetUnreadableDev = await insertDevActor(
      dbHandle,
      WORKSPACE_ID,
      uid(SLUG_PREFIX),
    );
    await grantCapability(
      dbHandle,
      WORKSPACE_ID,
      sourceReadableTargetUnreadableDev.id,
      'voc.read',
      msId,
      adminActorId,
    );
    const sourceReadableTargetUnreadable = await getEntityLinks(
      await loginAs(app, sourceReadableTargetUnreadableDev.externalId),
      `?source_type=voc&source_id=${voc.id}`,
    );
    expect(sourceReadableTargetUnreadable.statusCode).toBe(200);
    const hiddenStub = sourceReadableTargetUnreadable
      .json<{ items: Array<Record<string, unknown>> }>()
      .items.find(
        (item) =>
          item.visibility_state === 'hidden' &&
          item.source_type === 'voc' &&
          item.target_type === 'task' &&
          item.relation_type === 'evidence_of',
      );
    expect(hiddenStub).toEqual(expect.objectContaining({ visibility_state: 'hidden' }));
    expect(hiddenStub).not.toHaveProperty('summary');
    expect(hiddenStub).not.toHaveProperty('source_id');
    expect(hiddenStub).not.toHaveProperty('target_id');

    const outOfScopeDev = await insertDevActor(dbHandle, WORKSPACE_ID, uid(SLUG_PREFIX));
    const outOfScope = await getEntityLinks(
      await loginAs(app, outOfScopeDev.externalId),
      `?source_type=voc&source_id=${voc.id}`,
    );
    expect(outOfScope.statusCode).toBe(404);
  });

  it('0035 backfill flips only audit-provenance conversion evidence links', async () => {
    const msId = await insertMsDirectly(
      migrateHandle,
      WORKSPACE_ID,
      uid(SLUG_PREFIX),
      'Backfill conversion MS',
    );
    const traceableVoc = await insertVocDirectly(
      migrateHandle,
      WORKSPACE_ID,
      msId,
      userActorId,
      'Traceable conversion VOC',
    );
    const request = await insertTaskRequestRow(migrateHandle, {
      workspaceId: WORKSPACE_ID,
      sourceType: 'voc',
      sourceId: traceableVoc.id,
      primaryManagedSystemId: msId,
      requesterActorId: userActorId,
      status: 'converted',
      reviewerActorId: adminActorId,
      decisionReason: 'Converted before visibility backfill',
      decided: true,
    });
    const traceableTask = await insertTaskRow(migrateHandle, {
      workspaceId: WORKSPACE_ID,
      primaryManagedSystemId: msId,
      title: 'Traceable conversion task',
      sourceTaskRequestId: request.id,
      createdBy: adminActorId,
    });
    // Matches the old source-shape predicate, but its evidence link is manual.
    const manualLinkRequest = await insertTaskRequestRow(migrateHandle, {
      workspaceId: WORKSPACE_ID,
      sourceType: 'voc',
      sourceId: traceableVoc.id,
      primaryManagedSystemId: msId,
      requesterActorId: userActorId,
      status: 'converted',
      reviewerActorId: adminActorId,
      decisionReason: 'Converted before visibility backfill',
      decided: true,
    });
    const manualLinkTask = await insertTaskRow(migrateHandle, {
      workspaceId: WORKSPACE_ID,
      primaryManagedSystemId: msId,
      title: 'Task with manually created VOC evidence',
      sourceTaskRequestId: manualLinkRequest.id,
      createdBy: adminActorId,
    });
    const finding = await insertFindingRow(migrateHandle, {
      workspaceId: WORKSPACE_ID,
      primaryManagedSystemId: msId,
      title: 'Finding-propagated conversion source',
      sourceId: traceableVoc.id,
      createdBy: adminActorId,
    });
    const findingRequest = await insertTaskRequestRow(migrateHandle, {
      workspaceId: WORKSPACE_ID,
      sourceType: 'finding',
      sourceId: finding.id,
      primaryManagedSystemId: msId,
      requesterActorId: userActorId,
      status: 'converted',
      reviewerActorId: adminActorId,
      decisionReason: 'Converted from Finding before visibility backfill',
      decided: true,
    });
    const findingTask = await insertTaskRow(migrateHandle, {
      workspaceId: WORKSPACE_ID,
      primaryManagedSystemId: msId,
      title: 'Finding-propagated conversion task',
      sourceTaskRequestId: findingRequest.id,
      createdBy: adminActorId,
    });
    const untraceableVoc = await insertVocDirectly(
      migrateHandle,
      WORKSPACE_ID,
      msId,
      userActorId,
      'Untraceable evidence VOC',
    );
    const untraceableTask = await insertTaskRow(migrateHandle, {
      workspaceId: WORKSPACE_ID,
      primaryManagedSystemId: msId,
      title: 'Untraceable evidence task',
      createdBy: adminActorId,
    });
    const seeded = await migrateHandle.pool.query<{ id: string }>(
      `insert into core.entity_links (
          workspace_id, source_type, source_id, target_type, target_id,
          relation_type, visibility, status, managed_system_id, created_by
        ) values
          ($1, 'voc', $2, 'task', $3, 'evidence_of', 'internal_only', 'active', $4, $5),
          ($1, 'voc', $2, 'task', $6, 'evidence_of', 'internal_only', 'active', $4, $5),
          ($1, 'voc', $2, 'task', $7, 'evidence_of', 'internal_only', 'active', $4, $5),
          ($1, 'voc', $8, 'task', $9, 'evidence_of', 'internal_only', 'active', $4, $5)
        returning id`,
      [
        WORKSPACE_ID,
        traceableVoc.id,
        traceableTask.id,
        msId,
        adminActorId,
        manualLinkTask.id,
        findingTask.id,
        untraceableVoc.id,
        untraceableTask.id,
      ],
    );
    expect(seeded.rowCount).toBe(4);
    const [directLink, manualSameVocTaskLink, findingPropagatedLink, untraceableLink] = seeded.rows;
    if (!directLink || !manualSameVocTaskLink || !findingPropagatedLink || !untraceableLink) {
      throw new Error('backfill fixture links were not seeded');
    }
    await migrateHandle.pool.query(
      `insert into core.audit_log (
          workspace_id, actor_id, event_type, subject_type, subject_id, summary, detail
        ) values
          ($1, $2, 'task_created_from_request', 'task', $3, 'Task created from approved Task Request',
           jsonb_build_object('preserved_links', jsonb_build_array($4::text))),
          ($1, $2, 'task_created_from_request', 'task', $5, 'Task created from approved Task Request',
           jsonb_build_object('preserved_links', jsonb_build_array($6::text)))`,
      [
        WORKSPACE_ID,
        adminActorId,
        traceableTask.id,
        directLink.id,
        findingTask.id,
        findingPropagatedLink.id,
      ],
    );

    const client = await migrateHandle.pool.connect();
    try {
      await client.query('begin');
      await client.query(
        readFileSync(
          new URL(
            '../../../../migrations/0035_voc_task_conversion_summary_visible.sql',
            import.meta.url,
          ),
          'utf8',
        ),
      );
      const rows = await client.query<{ id: string; visibility: string }>(
        `select id, visibility from core.entity_links
          where id = any($1::uuid[])`,
        [seeded.rows.map((row) => row.id)],
      );
      expect(rows.rows).toContainEqual({ id: directLink.id, visibility: 'summary_visible' });
      expect(rows.rows).toContainEqual({
        id: findingPropagatedLink.id,
        visibility: 'summary_visible',
      });
      expect(rows.rows).toContainEqual({
        id: manualSameVocTaskLink.id,
        visibility: 'internal_only',
      });
      expect(rows.rows).toContainEqual({ id: untraceableLink.id, visibility: 'internal_only' });
    } finally {
      await client.query('rollback');
      client.release();
    }
  });

  it('link-task links an existing in-scope task, marks converted, and audits the link decision', async () => {
    const request = await seedApprovedTaskRequest();
    const taskId = await seedTask(request.msId);

    const res = await linkTask(adminCookie, request.id, taskId);

    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ id: taskId, source_task_request_id: null });

    const taskRequest = await dbHandle.pool.query<{ status: string }>(
      'select status from task_request.task_requests where id = $1',
      [request.id],
    );
    expect(taskRequest.rows[0]?.status).toBe('converted');

    const link = await dbHandle.pool.query<{ n: number }>(
      `select count(*)::int as n
         from core.entity_links
        where workspace_id = $1
          and source_type = 'task_request'
          and source_id = $2
          and target_type = 'task'
          and target_id = $3
          and relation_type = 'converted_to'
          and status = 'active'`,
      [WORKSPACE_ID, request.id, taskId],
    );
    expect(link.rows[0]?.n).toBe(1);

    const audit = await dbHandle.pool.query<{ detail: Record<string, unknown> }>(
      `select detail
         from core.audit_log
        where workspace_id = $1
          and event_type = 'task_linked_to_request'
          and subject_id = $2`,
      [WORKSPACE_ID, taskId],
    );
    expect(audit.rowCount).toBe(1);
    expect(audit.rows[0]?.detail).toMatchObject({
      task_id: taskId,
      task_request_id: request.id,
    });
  });

  it('link-task denies an existing task from another Managed System', async () => {
    const request = await seedApprovedTaskRequest();
    const otherMs = await insertMsDirectly(
      dbHandle,
      WORKSPACE_ID,
      uid(SLUG_PREFIX),
      'Other Task MS',
    );
    const taskId = await seedTask(otherMs, 'Out of scope task');

    const res = await linkTask(adminCookie, request.id, taskId);

    expect(res.statusCode).toBe(403);
    expect(res.json<{ code: string }>().code).toBe('permission.denied');
  });

  it('authority: developer needs finding.manage, admin bypass is allowed, user is denied', async () => {
    const request = await seedApprovedTaskRequest();
    const { id: devId, externalId } = await insertDevActor(
      dbHandle,
      WORKSPACE_ID,
      uid('task-auth'),
    );
    const devCookie = await loginAs(app, externalId);

    const deniedDev = await convert(devCookie, request.id, {
      title: 'Developer denied',
      priority: 'medium',
    });
    expect(deniedDev.statusCode).toBe(403);

    await grantCapability(
      dbHandle,
      WORKSPACE_ID,
      devId,
      'finding.manage',
      request.msId,
      adminActorId,
    );
    const allowedDev = await convert(devCookie, request.id, {
      title: 'Developer allowed',
      priority: 'medium',
    });
    expect(allowedDev.statusCode).toBe(201);

    const userRequest = await seedApprovedTaskRequest();
    const deniedUser = await convert(userCookie, userRequest.id, {
      title: 'User denied',
      priority: 'medium',
    });
    expect(deniedUser.statusCode).toBe(403);

    const adminRequest = await seedApprovedTaskRequest();
    const allowedAdmin = await convert(adminCookie, adminRequest.id, {
      title: 'Admin allowed',
      priority: 'medium',
    });
    expect(allowedAdmin.statusCode).toBe(201);
  });

  it('GET /tasks filters by role scope, status, and assignee', async () => {
    const visibleMs = await insertMsDirectly(
      dbHandle,
      WORKSPACE_ID,
      uid(SLUG_PREFIX),
      'Visible Task MS',
    );
    const hiddenMs = await insertMsDirectly(
      dbHandle,
      WORKSPACE_ID,
      uid(SLUG_PREFIX),
      'Hidden Task MS',
    );
    const visibleTask = await seedTask(visibleMs, 'Visible task');
    const assignedToOtherTask = await seedTask(visibleMs, 'Assigned to other task');
    const hiddenTask = await seedTask(hiddenMs, 'Hidden task');
    await migrateHandle.pool.query(
      `update task.tasks set assignee_actor_id = $1, status = 'todo' where id = $2`,
      [adminActorId, visibleTask],
    );
    await migrateHandle.pool.query(
      `update task.tasks set assignee_actor_id = $1, status = 'todo' where id = $2`,
      [userActorId, assignedToOtherTask],
    );

    const adminList = await listTasks(adminCookie, '?status=todo&assignee=me');
    expect(adminList.statusCode).toBe(200);
    const adminIds = adminList
      .json<{ items: Array<{ id: string }> }>()
      .items.map((item) => item.id);
    expect(adminIds).toContain(visibleTask);
    expect(adminIds).not.toContain(assignedToOtherTask);
    expect(adminIds).not.toContain(hiddenTask);

    const { id: devId, externalId } = await insertDevActor(
      dbHandle,
      WORKSPACE_ID,
      uid('task-list'),
    );
    await grantCapability(dbHandle, WORKSPACE_ID, devId, 'finding.manage', visibleMs, adminActorId);
    const devCookie = await loginAs(app, externalId);
    const devList = await listTasks(devCookie);
    expect(devList.statusCode).toBe(200);
    const devIds = devList.json<{ items: Array<{ id: string }> }>().items.map((item) => item.id);
    expect(devIds).toContain(visibleTask);
    expect(devIds).not.toContain(hiddenTask);

    const denied = await listTasks(userCookie);
    expect(denied.statusCode).toBe(403);
  });
});
