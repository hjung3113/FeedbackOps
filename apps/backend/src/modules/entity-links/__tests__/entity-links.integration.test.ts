// POST/GET/PATCH /entity-links integration tests — Slice 4.1 #112 + Slice 4.2 #113.
//
// Gate: DATABASE_URL + WORKSPACE_ID + DATABASE_URL_MIGRATE. The migrate role is
// required because core.entity_links is append-only to fops_app.

import { randomUUID } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import {
  type EntityLinkEntityType,
  type EntityLinkRelationType,
  registeredEntityLinkPairs,
} from '@fops/shared';

import { loadConfig } from '../../../config.js';
import { type DbHandle, createDb } from '../../../db/client.js';
import { buildServer } from '../../../server.js';
import { insertFindingRow } from '../../findings/__tests__/_seed-helpers.js';
import { insertTaskRequestRow } from '../../task-requests/__tests__/_seed-helpers.js';
import { insertTaskRow } from '../../tasks/__tests__/_seed-helpers.js';
import { insertVocClusterRow } from '../../voc-clusters/__tests__/_seed-helpers.js';
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

const APP_URL = process.env.DATABASE_URL ?? '';
const MIGRATE_URL = process.env.DATABASE_URL_MIGRATE ?? '';
const WORKSPACE_ID = process.env.WORKSPACE_ID ?? '';
const runIntegration = Boolean(APP_URL && MIGRATE_URL && WORKSPACE_ID);

const SLUG_PREFIX = 'it-links';

describe.skipIf(!runIntegration)('POST/GET /entity-links (#112)', () => {
  let dbHandle: DbHandle;
  let migrateHandle: DbHandle;
  let app: FastifyInstance;
  let adminCookie: string;
  let adminActorId: string;
  let reporterId: string;

  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    dbHandle = createDb(APP_URL);
    migrateHandle = createDb(MIGRATE_URL);
    app = await buildServer({ config: loadConfig(), dbHandle });
    await app.ready();

    adminCookie = await loginAs(app, 'mock-admin-1');
    const admin = await dbHandle.pool.query<{ id: string }>(
      `select id from core.actors where external_id = 'mock-admin-1' and workspace_id = $1`,
      [WORKSPACE_ID],
    );
    adminActorId = admin.rows[0]?.id ?? '';
    if (!adminActorId) throw new Error('mock-admin-1 not found');

    await loginAs(app, 'mock-user-1');
    const reporter = await dbHandle.pool.query<{ id: string }>(
      `select id from core.actors where external_id = 'mock-user-1' and workspace_id = $1`,
      [WORKSPACE_ID],
    );
    reporterId = reporter.rows[0]?.id ?? '';
    if (!reporterId) throw new Error('mock-user-1 not found');
  });

  beforeEach(async () => {
    await dbHandle.pool.query('delete from core.rate_limits');
    await cleanupEntityLinkFixtures();
  });

  afterAll(async () => {
    await cleanupEntityLinkFixtures();
    await app?.close();
    await dbHandle?.close();
    await migrateHandle?.close();
  });

  async function cleanupEntityLinkFixtures(): Promise<void> {
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
      `delete from core.audit_log
        where workspace_id = $1
          and event_type in ('entity_link.created', 'entity_link.detached', 'finding_created_from_voc')`,
      [WORKSPACE_ID],
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
      `delete from voc_cluster.voc_clusters
        where workspace_id = $1
          and primary_managed_system_id in (
            select id from core.managed_systems where workspace_id = $1 and slug like $2
          )`,
      [WORKSPACE_ID, `${SLUG_PREFIX}%`],
    );
    await migrateHandle.pool.query(
      `delete from permission.permission_grants
        where workspace_id = $1
          and managed_system_id in (
            select id from core.managed_systems where workspace_id = $1 and slug like $2
          )`,
      [WORKSPACE_ID, `${SLUG_PREFIX}%`],
    );
    await cleanupReadTestTables(dbHandle, WORKSPACE_ID, SLUG_PREFIX);
  }

  async function seedVocPair(): Promise<{
    msA: string;
    msB: string;
    sourceVoc: { id: string };
    targetVoc: { id: string };
  }> {
    const msA = await insertMsDirectly(
      dbHandle,
      WORKSPACE_ID,
      `${uid(SLUG_PREFIX)}-a`,
      'Links MS-A',
    );
    const msB = await insertMsDirectly(
      dbHandle,
      WORKSPACE_ID,
      `${uid(SLUG_PREFIX)}-b`,
      'Links MS-B',
    );
    const sourceVoc = await insertVocDirectly(
      dbHandle,
      WORKSPACE_ID,
      msA,
      reporterId,
      'Link Source VOC',
    );
    const targetVoc = await insertVocDirectly(
      dbHandle,
      WORKSPACE_ID,
      msB,
      reporterId,
      'Link Target VOC',
    );
    return { msA, msB, sourceVoc, targetVoc };
  }

  async function seedEntityLinkDirectly(input: {
    sourceType?: EntityLinkEntityType;
    sourceId: string;
    targetType?: EntityLinkEntityType;
    targetId: string;
    relationType?: string;
    managedSystemId: string;
    visibility: 'internal_only' | 'summary_visible' | 'visible_to_reporter' | 'admin_only';
  }): Promise<string> {
    const res = await migrateHandle.pool.query<{ id: string }>(
      `insert into core.entity_links (
          workspace_id, source_type, source_id, target_type, target_id,
          relation_type, visibility, status, managed_system_id, created_by
        )
       values ($1, $2, $3, $4, $5, $6, $7, 'active', $8, $9)
       returning id`,
      [
        WORKSPACE_ID,
        input.sourceType ?? 'voc',
        input.sourceId,
        input.targetType ?? 'voc',
        input.targetId,
        input.relationType ?? 'related_to',
        input.visibility,
        input.managedSystemId,
        adminActorId,
      ],
    );
    const id = res.rows[0]?.id;
    if (!id) throw new Error(`seedEntityLinkDirectly failed for ${input.visibility}`);
    return id;
  }

  async function seedFindingDirectly(input: {
    managedSystemId: string;
    sourceVocId: string;
    title?: string;
  }): Promise<{ id: string; display_id: string }> {
    return insertFindingRow(migrateHandle, {
      workspaceId: WORKSPACE_ID,
      primaryManagedSystemId: input.managedSystemId,
      title: input.title ?? 'Seeded Finding',
      sourceId: input.sourceVocId,
      createdBy: adminActorId,
    });
  }

  async function seedSurveyResponse(managedSystemId: string): Promise<{
    surveyId: string;
    responseId: string;
  }> {
    const survey = await migrateHandle.pool.query<{ id: string }>(
      `insert into survey.surveys
         (workspace_id, display_id, type, status, title, primary_managed_system_id,
          operator_actor_id, responses_identity_protected, created_by, opened_at)
       values ($1, $2, 'validation', 'open', $3, $4, $5, true, $5, now())
       returning id`,
      [
        WORKSPACE_ID,
        `S-${randomUUID()}`,
        `${SLUG_PREFIX}-command-only-survey-${randomUUID()}`,
        managedSystemId,
        adminActorId,
      ],
    );
    const surveyId = survey.rows[0]?.id;
    if (!surveyId) throw new Error('survey fixture seed failed');

    const response = await migrateHandle.pool.query<{ id: string }>(
      `insert into survey.survey_responses
         (workspace_id, survey_id, respondent_actor_id, identity_protected, submitted_at)
       values ($1, $2, $3, true, now())
       returning id`,
      [WORKSPACE_ID, surveyId, reporterId],
    );
    const responseId = response.rows[0]?.id;
    if (!responseId) throw new Error('survey response fixture seed failed');
    return { surveyId, responseId };
  }

  async function seedRegisteredTupleEndpoints(): Promise<{
    msA: string;
    endpoints: Record<EntityLinkEntityType, { id: string }>;
    vocTarget: { id: string };
  }> {
    const { msA, sourceVoc, targetVoc } = await seedVocPair();
    const cluster = await insertVocClusterRow(migrateHandle, {
      workspaceId: WORKSPACE_ID,
      primaryManagedSystemId: msA,
      title: 'Tuple Cluster',
      status: 'confirmed',
      createdBy: adminActorId,
    });
    const finding = await seedFindingDirectly({
      managedSystemId: msA,
      sourceVocId: sourceVoc.id,
      title: 'Tuple Finding',
    });
    const taskRequest = await insertTaskRequestRow(migrateHandle, {
      workspaceId: WORKSPACE_ID,
      sourceType: 'finding',
      sourceId: finding.id,
      primaryManagedSystemId: msA,
      requesterActorId: adminActorId,
    });
    const task = await insertTaskRow(migrateHandle, {
      workspaceId: WORKSPACE_ID,
      primaryManagedSystemId: msA,
      title: 'Tuple Task',
      createdBy: adminActorId,
    });

    return {
      msA,
      endpoints: {
        voc: sourceVoc,
        // Survey-response pairs are command-only, so generic routes reject this
        // opaque fixture ID before attempting a source lookup.
        survey_response: { id: sourceVoc.id },
        finding,
        voc_cluster: cluster,
        task_request: taskRequest,
        task,
      },
      vocTarget: targetVoc,
    };
  }

  async function postEntityLink(
    cookie: string,
    sourceId: string,
    targetId: string,
    extra: Record<string, unknown> = {},
  ) {
    return app.inject({
      method: 'POST',
      url: '/entity-links',
      headers: {
        cookie: `${SESSION_COOKIE_NAME}=${cookie}`,
        'content-type': 'application/json',
      },
      payload: {
        source: { type: 'voc', id: sourceId },
        target: { type: 'voc', id: targetId },
        relation_type: 'related_to',
        ...extra,
      },
    });
  }

  async function patchEntityLink(cookie: string, linkId: string, payload: Record<string, unknown>) {
    return await app.inject({
      method: 'PATCH',
      url: `/entity-links/${linkId}`,
      headers: {
        cookie: `${SESSION_COOKIE_NAME}=${cookie}`,
        'content-type': 'application/json',
      },
      payload,
    });
  }

  async function getEntityLinks(cookie: string, query: string) {
    return app.inject({
      method: 'GET',
      url: `/entity-links${query}`,
      headers: { cookie: `${SESSION_COOKIE_NAME}=${cookie}` },
    });
  }

  it('POST creates an active VOC↔VOC related_to link and audit row', async () => {
    const { msA, sourceVoc, targetVoc } = await seedVocPair();

    const res = await postEntityLink(adminCookie, sourceVoc.id, targetVoc.id);
    expect(res.statusCode).toBe(201);
    const body = res.json<{ id: string; visibility_state: string; managed_system_id: string }>();
    expect(body.visibility_state).toBe('allowed');
    expect(body.managed_system_id).toBe(msA);

    const linkRows = await dbHandle.pool.query<{ n: number }>(
      `select count(*)::int as n from core.entity_links
        where id = $1 and status = 'active' and relation_type = 'related_to'`,
      [body.id],
    );
    expect(linkRows.rows[0]?.n).toBe(1);

    const auditRows = await dbHandle.pool.query<{ detail: Record<string, unknown> }>(
      `select detail from core.audit_log
        where event_type = 'entity_link.created' and subject_id = $1`,
      [body.id],
    );
    expect(auditRows.rowCount).toBe(1);
    expect(auditRows.rows[0]?.detail).toMatchObject({
      link_id: body.id,
      relation_type: 'related_to',
      visibility: 'internal_only',
    });
  });

  it('POST returns 404 when actor lacks scope on the target VOC', async () => {
    const { msA, sourceVoc, targetVoc } = await seedVocPair();
    const { id: devId, externalId } = await insertDevActor(
      dbHandle,
      WORKSPACE_ID,
      uid('target404'),
    );
    await grantCapability(dbHandle, WORKSPACE_ID, devId, 'voc.read', msA, adminActorId);
    const devCookie = await loginAs(app, externalId);

    const res = await postEntityLink(devCookie, sourceVoc.id, targetVoc.id);
    expect(res.statusCode).toBe(404);
  });

  it('POST rejects self-link', async () => {
    const { sourceVoc } = await seedVocPair();
    const res = await postEntityLink(adminCookie, sourceVoc.id, sourceVoc.id);
    expect(res.statusCode).toBe(422);
    expect(res.json<{ code: string }>().code).toBe('validation.failed');
  });

  it('POST accepts VOC→Finding created_finding and still rejects unsupported tuples', async () => {
    const { msA, sourceVoc, targetVoc } = await seedVocPair();
    const finding = await seedFindingDirectly({ managedSystemId: msA, sourceVocId: sourceVoc.id });

    const createdFinding = await postEntityLink(adminCookie, sourceVoc.id, targetVoc.id, {
      target: { type: 'finding', id: finding.id },
      relation_type: 'created_finding',
    });
    expect(createdFinding.statusCode).toBe(201);
    expect(createdFinding.json<{ target_type: string; relation_type: string }>()).toMatchObject({
      target_type: 'finding',
      relation_type: 'created_finding',
    });

    const cases = [
      { relation_type: 'evidence_of' },
      { source: { type: 'finding', id: sourceVoc.id } },
      { target: { type: 'finding', id: finding.id }, relation_type: 'related_to' },
      { source: { type: 'finding', id: finding.id }, target: { type: 'voc', id: targetVoc.id } },
    ];

    for (const extra of cases) {
      const res = await postEntityLink(adminCookie, sourceVoc.id, targetVoc.id, extra);
      expect(res.statusCode).toBe(422);
      expect(res.json<{ code: string }>().code).toBe('validation.failed');
    }
  });

  it('POST honors generic tuples while leaving command-only tuples to their domain route', async () => {
    const { endpoints, vocTarget } = await seedRegisteredTupleEndpoints();

    for (const tuple of registeredEntityLinkPairs) {
      const source = endpoints[tuple.source_type];
      const target = tuple.target_type === 'voc' ? vocTarget : endpoints[tuple.target_type];

      // Rate-limit tiers currently share one global counter (#153); this test asserts tuple registration/visibility, not rate limits.
      await migrateHandle.pool.query('delete from core.rate_limits');
      const created = await postEntityLink(adminCookie, source.id, target.id, {
        source: { type: tuple.source_type, id: source.id },
        target: { type: tuple.target_type, id: target.id },
        relation_type: tuple.relation_type,
      });
      if (
        (tuple.source_type === 'voc_cluster' &&
          tuple.target_type === 'finding' &&
          tuple.relation_type === 'evidence_of') ||
        tuple.source_type === 'survey_response'
      ) {
        expect(created.statusCode, JSON.stringify(tuple)).toBe(422);
        continue;
      }
      expect(created.statusCode, JSON.stringify(tuple)).toBeGreaterThanOrEqual(200);
      expect(created.statusCode, JSON.stringify(tuple)).toBeLessThanOrEqual(201);
      const createdBody = created.json<{
        id: string;
        visibility_state: string;
        source_type: string;
        target_type: string;
        relation_type: string;
      }>();
      expect(createdBody, JSON.stringify(tuple)).toMatchObject({
        visibility_state: 'allowed',
        source_type: tuple.source_type,
        target_type: tuple.target_type,
        relation_type: tuple.relation_type,
      });

      const list = await getEntityLinks(
        adminCookie,
        `?source_type=${tuple.source_type}&source_id=${source.id}`,
      );
      expect(list.statusCode, JSON.stringify(tuple)).toBe(200);
      const listed = list
        .json<{
          items: Array<{
            id: string;
            visibility_state: string;
            target_type: string;
            relation_type: string;
          }>;
        }>()
        .items.find((item) => item.id === createdBody.id);
      expect(listed, JSON.stringify(tuple)).toMatchObject({
        visibility_state: 'allowed',
        target_type: tuple.target_type,
        relation_type: tuple.relation_type,
      });
    }
  });

  it('POST refuses a summary_visible VOC→Task evidence_of link without inserting it', async () => {
    const { endpoints } = await seedRegisteredTupleEndpoints();

    const res = await postEntityLink(adminCookie, endpoints.voc.id, endpoints.task.id, {
      target: { type: 'task', id: endpoints.task.id },
      relation_type: 'evidence_of',
      visibility: 'summary_visible',
    });

    expect(res.statusCode).toBe(422);
    expect(res.json<{ code: string }>().code).toBe('validation.failed');
    const rows = await dbHandle.pool.query<{ n: number }>(
      `select count(*)::int as n from core.entity_links
        where workspace_id = $1 and source_type = 'voc' and source_id = $2
          and target_type = 'task' and target_id = $3
          and relation_type = 'evidence_of' and status = 'active'`,
      [WORKSPACE_ID, endpoints.voc.id, endpoints.task.id],
    );
    expect(rows.rows[0]?.n).toBe(0);
  });

  it('POST duplicate returns the existing active link without duplicating', async () => {
    const { sourceVoc, targetVoc } = await seedVocPair();
    const first = await postEntityLink(adminCookie, sourceVoc.id, targetVoc.id);
    expect(first.statusCode).toBe(201);
    const firstId = first.json<{ id: string }>().id;

    const second = await postEntityLink(adminCookie, sourceVoc.id, targetVoc.id);
    expect(second.statusCode).toBe(200);
    expect(second.json<{ id: string }>().id).toBe(firstId);

    const count = await dbHandle.pool.query<{ n: number }>(
      `select count(*)::int as n from core.entity_links
        where source_id = $1 and target_id = $2 and status = 'active'`,
      [sourceVoc.id, targetVoc.id],
    );
    expect(count.rows[0]?.n).toBe(1);
  });

  it('GET by source returns allowed rows and hidden stubs for out-of-scope targets', async () => {
    const msA = await insertMsDirectly(
      dbHandle,
      WORKSPACE_ID,
      `${uid(SLUG_PREFIX)}-geta`,
      'Links GET MS-A',
    );
    const msB = await insertMsDirectly(
      dbHandle,
      WORKSPACE_ID,
      `${uid(SLUG_PREFIX)}-getb`,
      'Links GET MS-B',
    );
    const sourceVoc = await insertVocDirectly(
      dbHandle,
      WORKSPACE_ID,
      msA,
      reporterId,
      'GET Source VOC',
    );
    const allowedTarget = await insertVocDirectly(
      dbHandle,
      WORKSPACE_ID,
      msA,
      reporterId,
      'GET Allowed Target',
    );
    const hiddenTarget = await insertVocDirectly(
      dbHandle,
      WORKSPACE_ID,
      msB,
      reporterId,
      'GET Hidden Target',
    );

    await postEntityLink(adminCookie, sourceVoc.id, allowedTarget.id);
    await postEntityLink(adminCookie, sourceVoc.id, hiddenTarget.id);

    const { id: devId, externalId } = await insertDevActor(dbHandle, WORKSPACE_ID, uid('getsrc'));
    await grantCapability(dbHandle, WORKSPACE_ID, devId, 'voc.read', msA, adminActorId);
    const devCookie = await loginAs(app, externalId);

    const res = await app.inject({
      method: 'GET',
      url: `/entity-links?source_type=voc&source_id=${sourceVoc.id}`,
      headers: { cookie: `${SESSION_COOKIE_NAME}=${devCookie}` },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json<{ items: Array<Record<string, unknown>> }>();
    expect(body.items).toHaveLength(2);
    expect(
      body.items.some(
        (item) => item.visibility_state === 'allowed' && item.target_id === allowedTarget.id,
      ),
    ).toBe(true);
    const hidden = body.items.find((item) => item.visibility_state === 'hidden');
    expect(hidden).toBeDefined();
    expect(hidden?.target_id).toBeUndefined();
    expect(hidden?.source_id).toBeUndefined();
  });

  it('generic endpoints neither create nor disclose command-only cluster Finding evidence links', async () => {
    const msA = await insertMsDirectly(
      dbHandle,
      WORKSPACE_ID,
      `${uid(SLUG_PREFIX)}-cmd-a`,
      'Command source MS',
    );
    const msB = await insertMsDirectly(
      dbHandle,
      WORKSPACE_ID,
      `${uid(SLUG_PREFIX)}-cmd-b`,
      'Command target MS',
    );
    const sourceVoc = await insertVocDirectly(
      dbHandle,
      WORKSPACE_ID,
      msA,
      reporterId,
      'Command source VOC',
    );
    const cluster = await insertVocClusterRow(migrateHandle, {
      workspaceId: WORKSPACE_ID,
      primaryManagedSystemId: msA,
      title: 'Command-only cluster',
      createdBy: adminActorId,
    });
    const finding = await seedFindingDirectly({ managedSystemId: msB, sourceVocId: sourceVoc.id });
    const linkId = await seedEntityLinkDirectly({
      sourceType: 'voc_cluster',
      sourceId: cluster.id,
      targetType: 'finding',
      targetId: finding.id,
      relationType: 'evidence_of',
      managedSystemId: msA,
      visibility: 'internal_only',
    });
    const { id: devId, externalId } = await insertDevActor(dbHandle, WORKSPACE_ID, uid('cmd-only'));
    await grantCapability(dbHandle, WORKSPACE_ID, devId, 'finding.read', msA, adminActorId);
    const devCookie = await loginAs(app, externalId);

    const create = await postEntityLink(devCookie, cluster.id, finding.id, {
      source: { type: 'voc_cluster', id: cluster.id },
      target: { type: 'finding', id: finding.id },
      relation_type: 'evidence_of',
    });
    expect(create.statusCode).toBe(422);

    // Admin can read both endpoints, so this omission depends on the
    // command-only tuple policy rather than endpoint authorization.
    const adminListed = await getEntityLinks(
      adminCookie,
      `?source_type=voc_cluster&source_id=${cluster.id}`,
    );
    expect(adminListed.statusCode).toBe(200);
    expect(
      adminListed.json<{ items: Array<{ id: string }> }>().items.some((item) => item.id === linkId),
    ).toBe(false);
    const adminInventory = await getEntityLinks(adminCookie, '?scope=workspace');
    expect(adminInventory.statusCode).toBe(200);
    expect(
      adminInventory
        .json<{ items: Array<{ id: string }> }>()
        .items.some((item) => item.id === linkId),
    ).toBe(false);

    const listed = await getEntityLinks(
      devCookie,
      `?source_type=voc_cluster&source_id=${cluster.id}`,
    );
    expect(listed.statusCode).toBe(200);
    expect(
      listed.json<{ items: Array<{ id: string }> }>().items.some((item) => item.id === linkId),
    ).toBe(false);
  });

  it('PATCH returns the absent-link 404 envelope for a command-only link before endpoint authorization', async () => {
    const msA = await insertMsDirectly(
      dbHandle,
      WORKSPACE_ID,
      `${uid(SLUG_PREFIX)}-cmd-patch-a`,
      'Command PATCH source MS',
    );
    const msB = await insertMsDirectly(
      dbHandle,
      WORKSPACE_ID,
      `${uid(SLUG_PREFIX)}-cmd-patch-b`,
      'Command PATCH target MS',
    );
    const sourceVoc = await insertVocDirectly(
      dbHandle,
      WORKSPACE_ID,
      msA,
      reporterId,
      'Command PATCH source VOC',
    );
    const cluster = await insertVocClusterRow(migrateHandle, {
      workspaceId: WORKSPACE_ID,
      primaryManagedSystemId: msA,
      title: 'Command-only PATCH cluster',
      createdBy: adminActorId,
    });
    const finding = await seedFindingDirectly({ managedSystemId: msB, sourceVocId: sourceVoc.id });
    const linkId = await seedEntityLinkDirectly({
      sourceType: 'voc_cluster',
      sourceId: cluster.id,
      targetType: 'finding',
      targetId: finding.id,
      relationType: 'evidence_of',
      managedSystemId: msA,
      visibility: 'internal_only',
    });
    const { id: devId, externalId } = await insertDevActor(
      dbHandle,
      WORKSPACE_ID,
      uid('cmd-patch'),
    );
    await grantCapability(dbHandle, WORKSPACE_ID, devId, 'finding.read', msA, adminActorId);
    const devCookie = await loginAs(app, externalId);

    const absent = await patchEntityLink(devCookie, randomUUID(), { reason: 'Probe absent link' });
    const commandOnly = await patchEntityLink(devCookie, linkId, { reason: 'Probe command link' });
    const privilegedCommandOnly = await patchEntityLink(adminCookie, linkId, {
      reason: 'Probe command link as admin',
    });

    expect(absent.statusCode).toBe(404);
    expect(commandOnly.statusCode).toBe(404);
    expect(commandOnly.body).toBe(absent.body);
    expect(privilegedCommandOnly.statusCode).toBe(404);
    expect(privilegedCommandOnly.body).toBe(absent.body);
  });

  it('generic surfaces reject and hide command-only Survey Response Finding links', async () => {
    const { msA, sourceVoc } = await seedVocPair();
    const finding = await seedFindingDirectly({
      managedSystemId: msA,
      sourceVocId: sourceVoc.id,
      title: 'Survey command-only Finding',
    });
    const { surveyId, responseId } = await seedSurveyResponse(msA);
    const surveyLinkId = await seedEntityLinkDirectly({
      sourceType: 'survey_response',
      sourceId: responseId,
      targetType: 'finding',
      targetId: finding.id,
      relationType: 'generated_finding',
      managedSystemId: msA,
      visibility: 'internal_only',
    });
    const controlLinkId = await seedEntityLinkDirectly({
      sourceType: 'voc',
      sourceId: sourceVoc.id,
      targetType: 'finding',
      targetId: finding.id,
      relationType: 'created_finding',
      managedSystemId: msA,
      visibility: 'internal_only',
    });

    try {
      const unsupportedTuple = {
        code: 'validation.failed',
        message: 'unsupported entity link tuple',
        detail: { fields: [{ path: [], code: 'unsupported_tuple' }] },
      };
      const surveyToVocRelations: EntityLinkRelationType[] = [
        'related_to',
        'created_finding',
        'generated_finding',
        'evidence_of',
        'requested_task',
        'converted_to',
      ];
      const rejectedCreates = [
        {
          source: { type: 'survey_response', id: responseId },
          target: { type: 'finding', id: finding.id },
          relation_type: 'generated_finding',
        },
        {
          source: { type: 'survey_response', id: responseId },
          target: { type: 'finding', id: finding.id },
          relation_type: 'evidence_of',
        },
        {
          source: { type: 'survey_response', id: responseId },
          target: { type: 'finding', id: finding.id },
          relation_type: 'created_finding',
        },
        {
          source: { type: 'finding', id: finding.id },
          target: { type: 'survey_response', id: responseId },
          relation_type: 'generated_finding',
        },
        ...surveyToVocRelations.map((relation_type) => ({
          source: { type: 'survey_response', id: responseId },
          target: { type: 'voc', id: sourceVoc.id },
          relation_type,
        })),
      ];

      for (const payload of rejectedCreates) {
        const rejected = await postEntityLink(adminCookie, sourceVoc.id, sourceVoc.id, payload);
        expect(rejected.statusCode).toBe(422);
        expect(rejected.json()).toEqual(unsupportedTuple);
        expect(rejected.body).not.toContain(responseId);
      }

      const listed = await getEntityLinks(
        adminCookie,
        `?target_type=finding&target_id=${finding.id}`,
      );
      expect(listed.statusCode).toBe(200);
      const listedItems = listed.json<{ items: Array<{ id: string }> }>().items;
      expect(listedItems.some((item) => item.id === controlLinkId)).toBe(true);
      expect(listedItems.some((item) => item.id === surveyLinkId)).toBe(false);
      expect(listed.body).not.toContain(responseId);

      const detached = await patchEntityLink(adminCookie, surveyLinkId, {
        reason: 'Generic detach must not disclose survey lineage',
      });
      expect(detached.statusCode).toBe(404);
      expect(detached.json()).toEqual({
        code: 'not_found.record',
        message: 'entity link not found',
      });
      expect(detached.body).not.toContain(responseId);
    } finally {
      const beforeCleanup = await migrateHandle.pool.query<{ n: number }>(
        `select count(*)::int as n
           from core.entity_links
          where workspace_id = $1 and source_id = $2`,
        [WORKSPACE_ID, responseId],
      );
      expect(beforeCleanup.rows[0]?.n ?? 0).toBeGreaterThan(0);
      await migrateHandle.pool.query(
        'delete from core.entity_links where workspace_id = $1 and source_id = $2',
        [WORKSPACE_ID, responseId],
      );
      const afterCleanup = await migrateHandle.pool.query<{ n: number }>(
        `select count(*)::int as n
           from core.entity_links
          where workspace_id = $1 and source_id = $2`,
        [WORKSPACE_ID, responseId],
      );
      expect(afterCleanup.rows[0]?.n ?? 0).toBe(0);
      await migrateHandle.pool.query('delete from survey.survey_responses where id = $1', [
        responseId,
      ]);
      await migrateHandle.pool.query('delete from survey.surveys where id = $1', [surveyId]);
    }
  });

  it('GET by VOC source accepts managed-system scoped voc.triage without voc.read', async () => {
    const msA = await insertMsDirectly(
      dbHandle,
      WORKSPACE_ID,
      `${uid(SLUG_PREFIX)}-triage`,
      'Links Triage MS',
    );
    const sourceVoc = await insertVocDirectly(
      dbHandle,
      WORKSPACE_ID,
      msA,
      reporterId,
      'GET Triage Source VOC',
    );
    const targetVoc = await insertVocDirectly(
      dbHandle,
      WORKSPACE_ID,
      msA,
      reporterId,
      'GET Triage Target VOC',
    );
    const create = await postEntityLink(adminCookie, sourceVoc.id, targetVoc.id);
    expect(create.statusCode).toBe(201);
    const linkId = create.json<{ id: string }>().id;

    const { id: devId, externalId } = await insertDevActor(dbHandle, WORKSPACE_ID, uid('triage'));
    await grantCapability(dbHandle, WORKSPACE_ID, devId, 'voc.triage', msA, adminActorId);
    const devCookie = await loginAs(app, externalId);

    const res = await getEntityLinks(devCookie, `?source_type=voc&source_id=${sourceVoc.id}`);
    expect(res.statusCode).toBe(200);
    const body = res.json<{ items: Array<Record<string, unknown>> }>();
    expect(body.items).toHaveLength(1);
    expect(body.items[0]).toMatchObject({
      id: linkId,
      visibility_state: 'allowed',
      source_id: sourceVoc.id,
      target_id: targetVoc.id,
    });
  });

  it('VOC detail returns active outbound related_to links on the Links tab payload', async () => {
    const { sourceVoc, targetVoc } = await seedVocPair();
    const create = await postEntityLink(adminCookie, sourceVoc.id, targetVoc.id);
    expect(create.statusCode).toBe(201);
    const linkId = create.json<{ id: string }>().id;

    const res = await app.inject({
      method: 'GET',
      url: `/vocs/${sourceVoc.id}`,
      headers: { cookie: `${SESSION_COOKIE_NAME}=${adminCookie}` },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json<{ links?: Array<{ id: string; visibility_state: string }> }>();
    expect(
      body.links?.some((link) => link.id === linkId && link.visibility_state === 'allowed'),
    ).toBe(true);
  });

  it('PATCH detaches an active related_to link, preserves the row, and audits the detach', async () => {
    const { sourceVoc, targetVoc } = await seedVocPair();
    const create = await postEntityLink(adminCookie, sourceVoc.id, targetVoc.id);
    expect(create.statusCode).toBe(201);
    const linkId = create.json<{ id: string }>().id;

    const res = await patchEntityLink(adminCookie, linkId, { reason: 'No longer relevant' });
    expect(res.statusCode).toBe(200);
    const body = res.json<{ id: string; status: string; detached_at: string | null }>();
    expect(body).toMatchObject({ id: linkId, status: 'detached' });
    expect(body.detached_at).toEqual(expect.any(String));

    const linkRows = await dbHandle.pool.query<{
      status: string;
      detached_by: string | null;
      detach_reason: string | null;
      detached_at: Date | null;
    }>(
      `select status, detached_by, detach_reason, detached_at
        from core.entity_links
        where id = $1`,
      [linkId],
    );
    expect(linkRows.rowCount).toBe(1);
    expect(linkRows.rows[0]).toMatchObject({
      status: 'detached',
      detached_by: adminActorId,
      detach_reason: 'No longer relevant',
    });
    expect(linkRows.rows[0]?.detached_at).toBeInstanceOf(Date);

    const auditRows = await dbHandle.pool.query<{ detail: Record<string, unknown> }>(
      `select detail from core.audit_log
        where event_type = 'entity_link.detached' and subject_id = $1`,
      [linkId],
    );
    expect(auditRows.rowCount).toBe(1);
    expect(auditRows.rows[0]?.detail).toMatchObject({
      link_id: linkId,
      source: { type: 'voc', id: sourceVoc.id },
      target: { type: 'voc', id: targetVoc.id },
      relation_type: 'related_to',
      reason: 'No longer relevant',
    });
  });

  it('after detach, GET /entity-links and VOC detail Links tab omit the detached link', async () => {
    const { sourceVoc, targetVoc } = await seedVocPair();
    const create = await postEntityLink(adminCookie, sourceVoc.id, targetVoc.id);
    expect(create.statusCode).toBe(201);
    const linkId = create.json<{ id: string }>().id;

    const detach = await patchEntityLink(adminCookie, linkId, { reason: 'Superseded' });
    expect(detach.statusCode).toBe(200);

    const list = await app.inject({
      method: 'GET',
      url: `/entity-links?source_type=voc&source_id=${sourceVoc.id}`,
      headers: { cookie: `${SESSION_COOKIE_NAME}=${adminCookie}` },
    });
    expect(list.statusCode).toBe(200);
    expect(
      list.json<{ items: Array<{ id: string }> }>().items.some((item) => item.id === linkId),
    ).toBe(false);

    const detail = await app.inject({
      method: 'GET',
      url: `/vocs/${sourceVoc.id}`,
      headers: { cookie: `${SESSION_COOKIE_NAME}=${adminCookie}` },
    });
    expect(detail.statusCode).toBe(200);
    const body = detail.json<{ links?: Array<{ id: string }> }>();
    expect(body.links?.some((link) => link.id === linkId)).toBe(false);
  });

  it('GET workspace inventory returns active and detached rows newest-first', async () => {
    const firstPair = await seedVocPair();
    const secondPair = await seedVocPair();

    const oldActive = await postEntityLink(
      adminCookie,
      firstPair.sourceVoc.id,
      firstPair.targetVoc.id,
    );
    expect(oldActive.statusCode).toBe(201);
    const oldActiveId = oldActive.json<{ id: string }>().id;

    const newerDetached = await postEntityLink(
      adminCookie,
      secondPair.sourceVoc.id,
      secondPair.targetVoc.id,
    );
    expect(newerDetached.statusCode).toBe(201);
    const newerDetachedId = newerDetached.json<{ id: string }>().id;
    const detach = await patchEntityLink(adminCookie, newerDetachedId, {
      reason: 'Inventory fixture',
    });
    expect(detach.statusCode).toBe(200);

    await migrateHandle.pool.query(
      `update core.entity_links
        set created_at = case
          when id = $1 then now() - interval '2 hours'
          when id = $2 then now() - interval '1 hour'
          else created_at
        end
        where id in ($1, $2)`,
      [oldActiveId, newerDetachedId],
    );

    const res = await getEntityLinks(adminCookie, '?scope=workspace');
    expect(res.statusCode).toBe(200);
    const body = res.json<{
      items: Array<{ id: string; status: string; visibility_state: string }>;
    }>();
    const fixtureItems = body.items.filter((item) =>
      [oldActiveId, newerDetachedId].includes(item.id),
    );
    expect(fixtureItems.map((item) => item.id)).toEqual([newerDetachedId, oldActiveId]);
    expect(fixtureItems.map((item) => item.status).sort()).toEqual(['active', 'detached']);
    expect(fixtureItems.every((item) => item.visibility_state === 'allowed')).toBe(true);
  });

  it('GET workspace inventory status filter narrows to detached rows', async () => {
    const firstPair = await seedVocPair();
    const secondPair = await seedVocPair();
    const active = await postEntityLink(
      adminCookie,
      firstPair.sourceVoc.id,
      firstPair.targetVoc.id,
    );
    expect(active.statusCode).toBe(201);

    const detached = await postEntityLink(
      adminCookie,
      secondPair.sourceVoc.id,
      secondPair.targetVoc.id,
    );
    expect(detached.statusCode).toBe(201);
    const detachedId = detached.json<{ id: string }>().id;
    const detach = await patchEntityLink(adminCookie, detachedId, { reason: 'Status filter' });
    expect(detach.statusCode).toBe(200);

    const res = await getEntityLinks(adminCookie, '?scope=workspace&status=detached');
    expect(res.statusCode).toBe(200);
    const body = res.json<{ items: Array<{ id: string; status: string }> }>();
    expect(body.items.some((item) => item.id === detachedId)).toBe(true);
    expect(body.items.every((item) => item.status === 'detached')).toBe(true);
  });

  it('GET workspace inventory emits hidden stubs when actor lacks either endpoint scope', async () => {
    const msA = await insertMsDirectly(
      dbHandle,
      WORKSPACE_ID,
      `${uid(SLUG_PREFIX)}-inva`,
      'Inventory MS-A',
    );
    const msB = await insertMsDirectly(
      dbHandle,
      WORKSPACE_ID,
      `${uid(SLUG_PREFIX)}-invb`,
      'Inventory MS-B',
    );
    const visibleSource = await insertVocDirectly(
      dbHandle,
      WORKSPACE_ID,
      msA,
      reporterId,
      'Inventory Visible Source',
    );
    const visibleTarget = await insertVocDirectly(
      dbHandle,
      WORKSPACE_ID,
      msA,
      reporterId,
      'Inventory Visible Target',
    );
    const hiddenTarget = await insertVocDirectly(
      dbHandle,
      WORKSPACE_ID,
      msB,
      reporterId,
      'Inventory Hidden Target',
    );

    const allowed = await postEntityLink(adminCookie, visibleSource.id, visibleTarget.id);
    expect(allowed.statusCode).toBe(201);
    const hidden = await postEntityLink(adminCookie, visibleSource.id, hiddenTarget.id);
    expect(hidden.statusCode).toBe(201);
    const allowedId = allowed.json<{ id: string }>().id;
    const hiddenId = hidden.json<{ id: string }>().id;

    const { id: devId, externalId } = await insertDevActor(dbHandle, WORKSPACE_ID, uid('invvis'));
    await grantCapability(dbHandle, WORKSPACE_ID, devId, 'voc.read', msA, adminActorId);
    const devCookie = await loginAs(app, externalId);

    const res = await getEntityLinks(devCookie, '?scope=workspace');
    expect(res.statusCode).toBe(200);
    const body = res.json<{ items: Array<Record<string, unknown>> }>();
    const allowedRow = body.items.find((item) => item.id === allowedId);
    const hiddenRow = body.items.find((item) => item.id === hiddenId);
    expect(allowedRow).toMatchObject({
      visibility_state: 'allowed',
      source_id: visibleSource.id,
      target_id: visibleTarget.id,
    });
    expect(hiddenRow).toMatchObject({
      visibility_state: 'hidden',
      status: 'active',
      relation_type: 'related_to',
    });
    expect(hiddenRow?.source_id).toBeUndefined();
    expect(hiddenRow?.target_id).toBeUndefined();
  });

  it('GET read paths enforce the stored visibility matrix for seeded non-creatable rows', async () => {
    const msA = await insertMsDirectly(
      dbHandle,
      WORKSPACE_ID,
      `${uid(SLUG_PREFIX)}-matrixa`,
      'Visibility Matrix MS-A',
    );
    const sourceVoc = await insertVocDirectly(
      dbHandle,
      WORKSPACE_ID,
      msA,
      reporterId,
      'Matrix Source VOC',
    );
    const targets = await Promise.all(
      ['internal_only', 'summary_visible', 'visible_to_reporter', 'admin_only'].map((visibility) =>
        insertVocDirectly(dbHandle, WORKSPACE_ID, msA, reporterId, `Matrix Target ${visibility}`),
      ),
    );
    const [internalTarget, summaryTarget, reporterTarget, adminTarget] = targets;
    if (!internalTarget || !summaryTarget || !reporterTarget || !adminTarget) {
      throw new Error('visibility matrix target seed failed');
    }
    const ids = {
      internal_only: await seedEntityLinkDirectly({
        sourceId: sourceVoc.id,
        targetId: internalTarget.id,
        managedSystemId: msA,
        visibility: 'internal_only',
      }),
      summary_visible: await seedEntityLinkDirectly({
        sourceId: sourceVoc.id,
        targetId: summaryTarget.id,
        managedSystemId: msA,
        visibility: 'summary_visible',
      }),
      visible_to_reporter: await seedEntityLinkDirectly({
        sourceId: sourceVoc.id,
        targetId: reporterTarget.id,
        managedSystemId: msA,
        visibility: 'visible_to_reporter',
      }),
      admin_only: await seedEntityLinkDirectly({
        sourceId: sourceVoc.id,
        targetId: adminTarget.id,
        managedSystemId: msA,
        visibility: 'admin_only',
      }),
    };

    const { id: devId, externalId } = await insertDevActor(dbHandle, WORKSPACE_ID, uid('matrix'));
    await grantCapability(dbHandle, WORKSPACE_ID, devId, 'voc.read', msA, adminActorId);
    await grantCapability(dbHandle, WORKSPACE_ID, reporterId, 'voc.read', msA, adminActorId);
    const devCookie = await loginAs(app, externalId);
    const reporterCookie = await loginAs(app, 'mock-user-1');

    const admin = await getEntityLinks(adminCookie, `?source_type=voc&source_id=${sourceVoc.id}`);
    expect(admin.statusCode).toBe(200);
    expect(
      Object.fromEntries(
        admin
          .json<{ items: Array<{ id: string; visibility_state: string }> }>()
          .items.filter((item) => Object.values(ids).includes(item.id))
          .map((item) => [item.id, item.visibility_state]),
      ),
    ).toEqual({
      [ids.internal_only]: 'allowed',
      [ids.summary_visible]: 'allowed',
      [ids.visible_to_reporter]: 'allowed',
      [ids.admin_only]: 'allowed',
    });

    const developer = await getEntityLinks(devCookie, '?scope=workspace');
    expect(developer.statusCode).toBe(200);
    expect(
      Object.fromEntries(
        developer
          .json<{ items: Array<{ id: string; visibility_state: string }> }>()
          .items.filter((item) => Object.values(ids).includes(item.id))
          .map((item) => [item.id, item.visibility_state]),
      ),
    ).toEqual({
      [ids.internal_only]: 'allowed',
      [ids.summary_visible]: 'allowed',
      [ids.visible_to_reporter]: 'allowed',
      [ids.admin_only]: 'denied',
    });

    const reporter = await getEntityLinks(reporterCookie, '?scope=workspace');
    expect(reporter.statusCode).toBe(200);
    expect(
      Object.fromEntries(
        reporter
          .json<{ items: Array<{ id: string; visibility_state: string }> }>()
          .items.filter((item) => Object.values(ids).includes(item.id))
          .map((item) => [item.id, item.visibility_state]),
      ),
    ).toEqual({
      [ids.internal_only]: 'hidden',
      [ids.summary_visible]: 'hidden',
      [ids.visible_to_reporter]: 'allowed',
      [ids.admin_only]: 'hidden',
    });
  });

  it('GET read paths enforce the ADR-0024 finding target row', async () => {
    const msA = await insertMsDirectly(
      dbHandle,
      WORKSPACE_ID,
      `${uid(SLUG_PREFIX)}-finda`,
      'Finding Matrix MS-A',
    );
    const msB = await insertMsDirectly(
      dbHandle,
      WORKSPACE_ID,
      `${uid(SLUG_PREFIX)}-findb`,
      'Finding Matrix MS-B',
    );
    const sourceVoc = await insertVocDirectly(
      dbHandle,
      WORKSPACE_ID,
      msA,
      reporterId,
      'Finding Matrix Source VOC',
    );
    const readableFinding = await seedFindingDirectly({
      managedSystemId: msA,
      sourceVocId: sourceVoc.id,
      title: 'Readable Finding',
    });
    const unreadableFinding = await seedFindingDirectly({
      managedSystemId: msB,
      sourceVocId: sourceVoc.id,
      title: 'Unreadable Finding',
    });

    const allowedId = await seedEntityLinkDirectly({
      sourceId: sourceVoc.id,
      targetType: 'finding',
      targetId: readableFinding.id,
      relationType: 'created_finding',
      managedSystemId: msA,
      visibility: 'internal_only',
    });
    const mixedId = await seedEntityLinkDirectly({
      sourceId: sourceVoc.id,
      targetType: 'finding',
      targetId: unreadableFinding.id,
      relationType: 'created_finding',
      managedSystemId: msA,
      visibility: 'internal_only',
    });

    const { id: scopedDevId, externalId: scopedDevExternalId } = await insertDevActor(
      dbHandle,
      WORKSPACE_ID,
      uid('findok'),
    );
    await grantCapability(dbHandle, WORKSPACE_ID, scopedDevId, 'voc.read', msA, adminActorId);
    await grantCapability(dbHandle, WORKSPACE_ID, scopedDevId, 'finding.read', msA, adminActorId);
    const scopedDevCookie = await loginAs(app, scopedDevExternalId);

    const { id: outScopeDevId, externalId: outScopeExternalId } = await insertDevActor(
      dbHandle,
      WORKSPACE_ID,
      uid('findno'),
    );
    await grantCapability(dbHandle, WORKSPACE_ID, outScopeDevId, 'voc.read', msB, adminActorId);
    await grantCapability(dbHandle, WORKSPACE_ID, outScopeDevId, 'finding.read', msB, adminActorId);
    const outScopeCookie = await loginAs(app, outScopeExternalId);
    const reporterCookie = await loginAs(app, 'mock-user-1');

    const admin = await getEntityLinks(adminCookie, '?scope=workspace');
    expect(admin.statusCode).toBe(200);
    expect(
      Object.fromEntries(
        admin
          .json<{ items: Array<{ id: string; visibility_state: string }> }>()
          .items.filter((item) => [allowedId, mixedId].includes(item.id))
          .map((item) => [item.id, item.visibility_state]),
      ),
    ).toEqual({
      [allowedId]: 'allowed',
      [mixedId]: 'allowed',
    });

    const developer = await getEntityLinks(scopedDevCookie, '?scope=workspace');
    expect(developer.statusCode).toBe(200);
    const developerRows = developer.json<{ items: Array<Record<string, unknown>> }>().items;
    expect(developerRows.find((item) => item.id === allowedId)).toMatchObject({
      visibility_state: 'allowed',
      source_id: sourceVoc.id,
      target_id: readableFinding.id,
      target_type: 'finding',
      target_summary: {
        type: 'finding',
        id: readableFinding.id,
        display_id: readableFinding.display_id,
      },
      relation_type: 'created_finding',
    });
    expect(readableFinding.display_id).toMatch(/^FIN-\d+$/);
    const mixedRow = developerRows.find((item) => item.id === mixedId);
    expect(mixedRow).toMatchObject({
      visibility_state: 'hidden',
      target_type: 'finding',
      relation_type: 'created_finding',
    });
    expect(mixedRow?.source_id).toBeUndefined();
    expect(mixedRow?.target_id).toBeUndefined();

    const outScope = await getEntityLinks(outScopeCookie, '?scope=workspace');
    expect(outScope.statusCode).toBe(200);
    expect(
      outScope
        .json<{ items: Array<{ id: string; visibility_state: string }> }>()
        .items.filter((item) => [allowedId, mixedId].includes(item.id))
        .every((item) => item.visibility_state === 'hidden'),
    ).toBe(true);

    const reporter = await getEntityLinks(reporterCookie, '?scope=workspace');
    expect(reporter.statusCode).toBe(200);
    expect(
      reporter
        .json<{ items: Array<{ id: string; visibility_state: string }> }>()
        .items.filter((item) => [allowedId, mixedId].includes(item.id))
        .every((item) => item.visibility_state === 'hidden'),
    ).toBe(true);
  });

  it('GET a VOC Task link projects only the reporter-safe Task summary', async () => {
    const ms = await insertMsDirectly(
      dbHandle,
      WORKSPACE_ID,
      `${uid(SLUG_PREFIX)}-task-summary`,
      'Task Reporter Summary MS',
    );
    const sourceVoc = await insertVocDirectly(
      dbHandle,
      WORKSPACE_ID,
      ms,
      reporterId,
      'Task Reporter Summary Source VOC',
    );
    const internalComment = 'distinctive task-summary internal comment';
    await migrateHandle.pool.query(
      `insert into voc.voc_internal_comments (voc_id, actor_id, body_rich_content)
       values ($1, $2, $3::jsonb)`,
      [
        sourceVoc.id,
        adminActorId,
        JSON.stringify({
          type: 'doc',
          content: [
            {
              type: 'paragraph',
              content: [{ type: 'text', text: internalComment }],
            },
          ],
        }),
      ],
    );
    const rootCauseDetail = 'root-cause detail';
    const privateNotes = 'private notes';
    const privateCustomerDetail = 'private customer detail';
    const permissionDecisionInternals = 'permission decision internals';
    const finding = await insertFindingRow(migrateHandle, {
      workspaceId: WORKSPACE_ID,
      primaryManagedSystemId: ms,
      sourceId: sourceVoc.id,
      title: rootCauseDetail,
      summary: privateNotes,
      severity: 'critical',
      confidence: 'high',
      createdBy: adminActorId,
    });
    const taskRequest = await insertTaskRequestRow(migrateHandle, {
      workspaceId: WORKSPACE_ID,
      sourceType: 'voc',
      sourceId: sourceVoc.id,
      primaryManagedSystemId: ms,
      evidenceSummary: privateCustomerDetail,
      requestedOutcome: rootCauseDetail,
      requesterActorId: reporterId,
      reviewerActorId: adminActorId,
      decisionReason: permissionDecisionInternals,
      decided: true,
    });
    const { id: assigneeId, externalId: assigneeExternalId } = await insertDevActor(
      dbHandle,
      WORKSPACE_ID,
      uid('task-summary-assignee'),
    );
    const statuses = [
      ['backlog', '진행 예정'],
      ['todo', '진행 예정'],
      ['doing', '진행 중'],
      ['review', '진행 중'],
      ['done', '해결 준비 중'],
      ['released', '반영됨'],
      ['reopened', '다시 처리 중'],
    ] as const;
    const dueDate = '2099-12-31';
    const taskLinks = await Promise.all(
      statuses.map(async ([status], index) => {
        const title = `Public Task ${index + 1}`;
        const task = await insertTaskRow(migrateHandle, {
          workspaceId: WORKSPACE_ID,
          primaryManagedSystemId: ms,
          title,
          status,
          priority: 'urgent',
          assigneeActorId: assigneeId,
          dueDate,
          sourceTaskRequestId: index === 0 ? taskRequest.id : null,
          createdBy: adminActorId,
        });
        const linkId = await seedEntityLinkDirectly({
          sourceId: sourceVoc.id,
          targetType: 'task',
          targetId: task.id,
          relationType: 'evidence_of',
          managedSystemId: ms,
          visibility: 'summary_visible',
        });
        return { linkId, task, status, title };
      }),
    );
    await migrateHandle.pool.query(
      'update finding.findings set linked_task_id = $1 where id = $2',
      [taskLinks[0]?.task.id, finding.id],
    );

    const persistedForbidden = await migrateHandle.pool.query<{
      title: string;
      status: string;
      priority: string;
      due_date: string | null;
      assignee_actor_id: string | null;
      source_task_request_id: string | null;
      evidence_summary: string;
      requested_outcome: string;
      decision_reason: string | null;
      finding_title: string;
      finding_summary: string;
      severity: string;
      confidence: string | null;
      linked_task_id: string | null;
    }>(
      `select t.title, t.status, t.priority, t.due_date::text, t.assignee_actor_id,
              t.source_task_request_id, tr.evidence_summary, tr.requested_outcome,
              tr.decision_reason, f.title as finding_title, f.summary as finding_summary,
              f.severity, f.confidence, f.linked_task_id
         from task.tasks t
         join task_request.task_requests tr on tr.id = t.source_task_request_id
         join finding.findings f on f.linked_task_id = t.id
        where t.id = $1`,
      [taskLinks[0]?.task.id],
    );
    expect(persistedForbidden.rows[0]).toMatchObject({
      status: taskLinks[0]?.status,
      priority: 'urgent',
      due_date: dueDate,
      assignee_actor_id: assigneeId,
      source_task_request_id: taskRequest.id,
      evidence_summary: privateCustomerDetail,
      requested_outcome: rootCauseDetail,
      decision_reason: permissionDecisionInternals,
      finding_title: rootCauseDetail,
      finding_summary: privateNotes,
      severity: 'critical',
      confidence: 'high',
      linked_task_id: taskLinks[0]?.task.id,
    });
    const persistedTaskStatuses = await migrateHandle.pool.query<{
      title: string;
      status: string;
    }>('select title, status from task.tasks where id = any($1::uuid[]) order by title', [
      taskLinks.map((link) => link.task.id),
    ]);
    expect(persistedTaskStatuses.rows).toEqual(
      taskLinks
        .map((link) => ({ title: link.title, status: link.status }))
        .sort((left, right) => left.title.localeCompare(right.title)),
    );
    const persistedInternalComment = await migrateHandle.pool.query<{
      body_rich_content: unknown;
    }>(
      `select body_rich_content from voc.voc_internal_comments
        where voc_id = $1 and actor_id = $2`,
      [sourceVoc.id, adminActorId],
    );
    expect(JSON.stringify(persistedInternalComment.rows[0]?.body_rich_content)).toContain(
      internalComment,
    );
    expect(assigneeExternalId).toContain('task-summary-assignee');

    const { id: scopedDevId, externalId: scopedDevExternalId } = await insertDevActor(
      dbHandle,
      WORKSPACE_ID,
      uid('task-summary-scoped'),
    );
    await grantCapability(dbHandle, WORKSPACE_ID, scopedDevId, 'voc.read', ms, adminActorId);
    await grantCapability(dbHandle, WORKSPACE_ID, scopedDevId, 'finding.read', ms, adminActorId);
    const scopedDevCookie = await loginAs(app, scopedDevExternalId);

    const { id: outOfScopeDevId, externalId: outOfScopeDevExternalId } = await insertDevActor(
      dbHandle,
      WORKSPACE_ID,
      uid('task-summary-out-of-scope'),
    );
    await grantCapability(dbHandle, WORKSPACE_ID, outOfScopeDevId, 'voc.read', ms, adminActorId);
    const outOfScopeDevCookie = await loginAs(app, outOfScopeDevExternalId);

    const query = `?source_type=voc&source_id=${sourceVoc.id}`;
    const auditBefore = await dbHandle.pool.query<{ id: string }>(
      'select id from core.audit_log where workspace_id = $1 order by id',
      [WORKSPACE_ID],
    );
    const reporter = await getEntityLinks(await loginAs(app, 'mock-user-1'), query);
    expect(reporter.statusCode).toBe(200);
    const reporterItems = reporter.json<{ items: Array<Record<string, unknown>> }>().items;
    expect(reporterItems).toHaveLength(statuses.length);

    for (const [status, reporterFacingStatus] of statuses) {
      const link = taskLinks.find((candidate) => candidate.status === status);
      const item = reporterItems.find((candidate) => candidate.id === link?.linkId);
      expect(item).toMatchObject({
        visibility_state: 'summary_visible',
        summary: {
          target_type: 'task',
          public_title: link?.title,
          reporter_facing_status: reporterFacingStatus,
        },
      });
      expect(item?.source_id).toBeUndefined();
      expect(item?.target_id).toBeUndefined();
      expect(item?.target_summary).toBeUndefined();
      expect(Object.keys((item?.summary ?? {}) as Record<string, unknown>).sort()).toEqual([
        'public_title',
        'reporter_facing_status',
        'target_type',
      ]);
    }

    const reporterPayload = reporter.body;
    for (const rawStatus of statuses.map(([status]) => status)) {
      expect(reporterPayload).not.toContain(rawStatus);
    }
    for (const forbidden of [
      'urgent',
      dueDate,
      assigneeId,
      assigneeExternalId,
      rootCauseDetail,
      privateNotes,
      privateCustomerDetail,
      permissionDecisionInternals,
      'critical',
      'high',
      internalComment,
    ]) {
      expect(reporterPayload).not.toContain(forbidden);
    }

    const auditAfter = await dbHandle.pool.query<{ id: string }>(
      'select id from core.audit_log where workspace_id = $1 order by id',
      [WORKSPACE_ID],
    );
    expect(auditAfter.rows).toEqual(auditBefore.rows);

    const scopedDeveloper = await getEntityLinks(scopedDevCookie, query);
    expect(scopedDeveloper.statusCode).toBe(200);
    const scopedDeveloperItems = scopedDeveloper.json<{ items: Array<Record<string, unknown>> }>()
      .items;
    expect(scopedDeveloperItems).toHaveLength(taskLinks.length);
    for (const link of taskLinks) {
      expect(scopedDeveloperItems.find((item) => item.id === link.linkId)).toMatchObject({
        visibility_state: 'allowed',
        source_id: sourceVoc.id,
        target_id: link.task.id,
        target_type: 'task',
      });
    }

    const outOfScopeDeveloper = await getEntityLinks(outOfScopeDevCookie, query);
    expect(outOfScopeDeveloper.statusCode).toBe(200);
    const outOfScopeDeveloperItems = outOfScopeDeveloper.json<{
      items: Array<Record<string, unknown>>;
    }>().items;
    expect(outOfScopeDeveloperItems).toHaveLength(taskLinks.length);
    for (const link of taskLinks) {
      const item = outOfScopeDeveloperItems.find((candidate) => candidate.id === link.linkId);
      expect(item).toMatchObject({ visibility_state: 'hidden' });
      expect(item).not.toHaveProperty('summary');
      expect(item).not.toHaveProperty('source_id');
      expect(item).not.toHaveProperty('target_id');
    }

    // tasks_status_check makes an invalid stored status unrepresentable; unit coverage carries it.
  });

  it('DB tuple check allows only registered entity-link tuples', async () => {
    const { msA, endpoints, vocTarget } = await seedRegisteredTupleEndpoints();

    for (const tuple of registeredEntityLinkPairs) {
      const source = endpoints[tuple.source_type];
      const target = tuple.target_type === 'voc' ? vocTarget : endpoints[tuple.target_type];

      await expect(
        seedEntityLinkDirectly({
          sourceType: tuple.source_type,
          sourceId: source.id,
          targetType: tuple.target_type,
          targetId: target.id,
          relationType: tuple.relation_type,
          managedSystemId: msA,
          visibility: 'internal_only',
        }),
      ).resolves.toEqual(expect.any(String));
    }

    await expect(
      migrateHandle.pool.query(
        `insert into core.entity_links (
            workspace_id, source_type, source_id, target_type, target_id,
            relation_type, visibility, status, managed_system_id, created_by
          )
         values ($1, 'voc', $2, 'finding', $3, 'related_to', 'internal_only', 'active', $4, $5)`,
        [WORKSPACE_ID, endpoints.voc.id, endpoints.finding.id, msA, adminActorId],
      ),
    ).rejects.toThrow();

    await expect(
      migrateHandle.pool.query(
        `insert into core.entity_links (
            workspace_id, source_type, source_id, target_type, target_id,
            relation_type, visibility, status, managed_system_id, created_by
          )
         values ($1, 'finding', $2, 'voc', $3, 'created_finding', 'internal_only', 'active', $4, $5)`,
        [WORKSPACE_ID, endpoints.finding.id, vocTarget.id, msA, adminActorId],
      ),
    ).rejects.toThrow();
  });

  it('GET endpoint mode still requires exactly one endpoint and returns active links only', async () => {
    const { sourceVoc, targetVoc } = await seedVocPair();
    const create = await postEntityLink(adminCookie, sourceVoc.id, targetVoc.id);
    expect(create.statusCode).toBe(201);
    const linkId = create.json<{ id: string }>().id;

    const beforeDetach = await getEntityLinks(
      adminCookie,
      `?source_type=voc&source_id=${sourceVoc.id}`,
    );
    expect(beforeDetach.statusCode).toBe(200);
    expect(
      beforeDetach
        .json<{ items: Array<{ id: string }> }>()
        .items.some((item) => item.id === linkId),
    ).toBe(true);

    const detach = await patchEntityLink(adminCookie, linkId, { reason: 'Regression' });
    expect(detach.statusCode).toBe(200);

    const afterDetach = await getEntityLinks(
      adminCookie,
      `?source_type=voc&source_id=${sourceVoc.id}`,
    );
    expect(afterDetach.statusCode).toBe(200);
    expect(
      afterDetach.json<{ items: Array<{ id: string }> }>().items.some((item) => item.id === linkId),
    ).toBe(false);

    const invalid = await getEntityLinks(
      adminCookie,
      `?source_type=voc&source_id=${sourceVoc.id}&target_type=voc&target_id=${targetVoc.id}`,
    );
    expect(invalid.statusCode).toBe(422);
  });

  it('PATCH on an already-detached link returns 409', async () => {
    const { sourceVoc, targetVoc } = await seedVocPair();
    const create = await postEntityLink(adminCookie, sourceVoc.id, targetVoc.id);
    expect(create.statusCode).toBe(201);
    const linkId = create.json<{ id: string }>().id;

    const first = await patchEntityLink(adminCookie, linkId, { reason: 'Initial detach' });
    expect(first.statusCode).toBe(200);

    const second = await patchEntityLink(adminCookie, linkId, { reason: 'Again' });
    expect(second.statusCode).toBe(409);
    expect(second.json<{ code: string }>().code).toBe('conflict.stale_write');
  });

  it('PATCH returns 404 when actor lacks scope on the target endpoint', async () => {
    const { msA, sourceVoc, targetVoc } = await seedVocPair();
    const create = await postEntityLink(adminCookie, sourceVoc.id, targetVoc.id);
    expect(create.statusCode).toBe(201);
    const linkId = create.json<{ id: string }>().id;

    const { id: devId, externalId } = await insertDevActor(
      dbHandle,
      WORKSPACE_ID,
      uid('detach404'),
    );
    await grantCapability(dbHandle, WORKSPACE_ID, devId, 'voc.read', msA, adminActorId);
    const devCookie = await loginAs(app, externalId);

    const res = await patchEntityLink(devCookie, linkId, { reason: 'No scope' });
    expect(res.statusCode).toBe(404);
  });

  it('PATCH returns 404 for an already-detached link when actor lacks target scope', async () => {
    const { msA, sourceVoc, targetVoc } = await seedVocPair();
    const create = await postEntityLink(adminCookie, sourceVoc.id, targetVoc.id);
    expect(create.statusCode).toBe(201);
    const linkId = create.json<{ id: string }>().id;

    const detach = await patchEntityLink(adminCookie, linkId, { reason: 'Authorized detach' });
    expect(detach.statusCode).toBe(200);

    const { id: devId, externalId } = await insertDevActor(
      dbHandle,
      WORKSPACE_ID,
      uid('detached404'),
    );
    await grantCapability(dbHandle, WORKSPACE_ID, devId, 'voc.read', msA, adminActorId);
    const devCookie = await loginAs(app, externalId);

    const res = await patchEntityLink(devCookie, linkId, { reason: 'No target scope' });
    expect(res.statusCode).toBe(404);
  });

  it('PATCH rejects missing or empty detach reason', async () => {
    const { sourceVoc, targetVoc } = await seedVocPair();
    const create = await postEntityLink(adminCookie, sourceVoc.id, targetVoc.id);
    expect(create.statusCode).toBe(201);
    const linkId = create.json<{ id: string }>().id;

    for (const payload of [{}, { reason: '' }, { reason: '   ' }]) {
      const res = await patchEntityLink(adminCookie, linkId, payload);
      expect(res.statusCode).toBe(422);
      expect(res.json<{ code: string }>().code).toBe('validation.failed');
    }
  });

  it('detach frees the active unique slot so the same VOC pair can be linked again', async () => {
    const { sourceVoc, targetVoc } = await seedVocPair();
    const first = await postEntityLink(adminCookie, sourceVoc.id, targetVoc.id);
    expect(first.statusCode).toBe(201);
    const firstId = first.json<{ id: string }>().id;

    const detach = await patchEntityLink(adminCookie, firstId, { reason: 'Relink needed' });
    expect(detach.statusCode).toBe(200);

    const second = await postEntityLink(adminCookie, sourceVoc.id, targetVoc.id);
    expect(second.statusCode).toBe(201);
    expect(second.json<{ id: string }>().id).not.toBe(firstId);

    const count = await dbHandle.pool.query<{ active: number; detached: number }>(
      `select
          count(*) filter (where status = 'active')::int as active,
          count(*) filter (where status = 'detached')::int as detached
        from core.entity_links
        where source_id = $1 and target_id = $2`,
      [sourceVoc.id, targetVoc.id],
    );
    expect(count.rows[0]).toMatchObject({ active: 1, detached: 1 });
  });
});
