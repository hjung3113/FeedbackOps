// Task detail "Linked context" source VOC visibility verdict (#378).
//
// Gate: DATABASE_URL + DATABASE_URL_MIGRATE + WORKSPACE_ID (same as the
// neighbouring task-detail suite; the conductor runs it outside the sandbox
// after applying migrations).
//
// Chains seeded per test:
//   A. VOC → Finding(source_type='voc') → Task Request('finding') → Task
//   B. VOC → Task Request('voc') → Task   (the request itself is VOC-sourced)
//   C. cluster finding → Task Request('finding') → Task   (no VOC to reveal)
//   D. Task Request('voc_cluster') → Task                 (no finding, no VOC)
// plus a precedence case where a VOC-sourced Task Request additionally carries
// a finding link, so request-source must win over finding-source.
//
// Actor matrix per ADR-0023: visibility is a backend verdict from the ONE VOC
// read-authority path. `hidden` is never serialized — the whole `voc` key is
// absent and the raw body must not contain any VOC identifier.

import { randomUUID } from 'node:crypto';

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

const SLUG_PREFIX = 'it-task-srcvoc';
const FINDING_TITLE = 'Chain finding';
const FINDING_SUMMARY = 'Finding summarizing the VOC';

describe.skipIf(!runIntegration)('task detail source VOC visibility (#378)', () => {
  let dbHandle: DbHandle;
  let migrateHandle: DbHandle;
  let app: FastifyInstance;
  let adminCookie: string;
  let adminActorId: string;

  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    dbHandle = createDb(APP_URL);
    migrateHandle = createDb(MIGRATE_URL);
    app = await buildServer({ config: loadConfig(), dbHandle });
    await app.ready();

    adminCookie = await loginAs(app, 'mock-admin-1');
    const actors = await dbHandle.pool.query<{ id: string }>(
      `select id from core.actors
        where workspace_id = $1
          and external_id = 'mock-admin-1'`,
      [WORKSPACE_ID],
    );
    adminActorId = actors.rows[0]?.id ?? '';
    if (!adminActorId) throw new Error('seed admin actor not found');
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
    // Execution tasks / task requests / findings / their links live on this
    // suite's MS slug prefix; VOC-domain tables are handled by the shared
    // read-test cleanup afterwards.
    // core.entity_links scopes by `managed_system_id`; the other tables by
    // `primary_managed_system_id`.
    for (const [table, msColumn] of [
      ['core.entity_links', 'managed_system_id'],
      ['task.tasks', 'primary_managed_system_id'],
      ['task_request.task_requests', 'primary_managed_system_id'],
      ['finding.findings', 'primary_managed_system_id'],
    ] as const) {
      await migrateHandle.pool.query(
        `delete from ${table}
          where workspace_id = $1
            and ${msColumn} in (
              select id from core.managed_systems where workspace_id = $1 and slug like $2
            )`,
        [WORKSPACE_ID, `${SLUG_PREFIX}%`],
      );
    }
    await cleanupReadTestTables(dbHandle, WORKSPACE_ID, SLUG_PREFIX);
  }

  async function seedVoc(msId: string, title: string): Promise<{ id: string; displayId: string }> {
    const voc = await insertVocDirectly(dbHandle, WORKSPACE_ID, msId, adminActorId, title);
    const row = await dbHandle.pool.query<{ display_id: string }>(
      'select display_id from voc.vocs where id = $1',
      [voc.id],
    );
    const displayId = row.rows[0]?.display_id ?? '';
    if (!displayId) throw new Error(`seedVoc: display_id missing for ${voc.id}`);
    return { id: voc.id, displayId };
  }

  interface SeededChain {
    msId: string;
    voc?: { id: string; displayId: string; title: string } | undefined;
    findingId?: string | undefined;
    taskRequestId: string;
    taskId: string;
  }

  async function seedChain(input: {
    vocTitle: string;
    findingSource?: 'voc' | 'voc_cluster';
    taskRequestSource: 'finding' | 'voc' | 'voc_cluster';
  }): Promise<SeededChain> {
    const msId = await insertMsDirectly(dbHandle, WORKSPACE_ID, uid(SLUG_PREFIX), 'Source VOC MS');

    let voc: SeededChain['voc'];
    let findingId: string | undefined;
    if (input.findingSource === 'voc') {
      const seeded = await seedVoc(msId, input.vocTitle);
      voc = { ...seeded, title: input.vocTitle };
      findingId = (
        await insertFindingRow(migrateHandle, {
          workspaceId: WORKSPACE_ID,
          primaryManagedSystemId: msId,
          title: FINDING_TITLE,
          summary: FINDING_SUMMARY,
          sourceType: 'voc',
          sourceId: seeded.id,
          status: 'active',
          createdBy: adminActorId,
        })
      ).id;
    } else if (input.findingSource === 'voc_cluster') {
      // Cluster/manual/survey provenance: source_id is not a VOC and must not
      // resolve one (no FK on findings.source_id — a bare uuid is valid).
      findingId = (
        await insertFindingRow(migrateHandle, {
          workspaceId: WORKSPACE_ID,
          primaryManagedSystemId: msId,
          title: FINDING_TITLE,
          summary: FINDING_SUMMARY,
          sourceType: 'voc_cluster',
          sourceId: randomUUID(),
          status: 'active',
          createdBy: adminActorId,
        })
      ).id;
    }

    const taskRequest = await insertTaskRequestRow(migrateHandle, {
      workspaceId: WORKSPACE_ID,
      sourceType: input.taskRequestSource,
      sourceId:
        input.taskRequestSource === 'finding'
          ? (findingId ?? randomUUID())
          : (voc?.id ?? randomUUID()),
      primaryManagedSystemId: msId,
      requesterActorId: adminActorId,
      status: 'approved',
      reviewerActorId: adminActorId,
      decided: true,
    });
    if (findingId !== undefined) {
      // resolveTaskSource finds the source Finding ONLY through this active
      // finding -> task_request `requested_task` link (same seed as
      // task-detail-and-finding-link.integration.test.ts).
      await migrateHandle.pool.query(
        `insert into core.entity_links (
            workspace_id, source_type, source_id, target_type, target_id,
            relation_type, visibility, status, managed_system_id, created_by
          )
         values ($1, 'finding', $2, 'task_request', $3, 'requested_task',
                 'internal_only', 'active', $4, $5)`,
        [WORKSPACE_ID, findingId, taskRequest.id, msId, adminActorId],
      );
    }
    const task = await insertTaskRow(migrateHandle, {
      workspaceId: WORKSPACE_ID,
      primaryManagedSystemId: msId,
      sourceTaskRequestId: taskRequest.id,
      createdBy: adminActorId,
    });
    return { msId, voc, findingId, taskRequestId: taskRequest.id, taskId: task.id };
  }

  /** Developer actor (role_level 'developer') with the given MS grants. */
  async function devCookieWithGrants(capabilities: string[], msId: string): Promise<string> {
    const { id, externalId } = await insertDevActor(dbHandle, WORKSPACE_ID, uid('srcvoc'));
    for (const capability of capabilities) {
      await grantCapability(dbHandle, WORKSPACE_ID, id, capability, msId, adminActorId);
    }
    return loginAs(app, externalId);
  }

  function getTask(cookie: string, taskId: string) {
    return app.inject({
      method: 'GET',
      url: `/tasks/${taskId}`,
      headers: { cookie: `${SESSION_COOKIE_NAME}=${cookie}` },
    });
  }

  it('admin sees the finding-chain source VOC as allowed with its identifiers', async () => {
    const vocTitle = `SrcVoc VOC ${uid('allowed')}`;
    const chain = await seedChain({ vocTitle, findingSource: 'voc', taskRequestSource: 'finding' });

    const res = await getTask(adminCookie, chain.taskId);

    expect(res.statusCode).toBe(200);
    const body = res.json<{ source: Record<string, unknown> | null }>();
    expect(body.source).toEqual({
      task_request: { id: chain.taskRequestId, status: 'approved' },
      finding: {
        id: chain.findingId,
        title: FINDING_TITLE,
        summary: FINDING_SUMMARY,
        evidence_count: 0,
      },
      voc: {
        visibility_state: 'allowed',
        id: chain.voc?.id,
        display_id: chain.voc?.displayId,
        title: vocTitle,
      },
    });
  });

  it('a non-reporter admin loses source VOC visibility after an explicit voc.read deny', async () => {
    const vocTitle = `SrcVoc VOC ${uid('deniedadmin')}`;
    const chain = await seedChain({ vocTitle, findingSource: 'voc', taskRequestSource: 'finding' });
    // Fresh actor isolates the rate-limit bucket and stays in the existing cleanup cohort.
    const reader = await insertDevActor(dbHandle, WORKSPACE_ID, uid('srcvoc-admin'));
    await migrateHandle.pool.query("update core.actors set role_level = 'admin' where id = $1", [
      reader.id,
    ]);
    expect(reader.id).not.toBe(adminActorId);
    const cookie = await loginAs(app, reader.externalId);

    const before = await getTask(cookie, chain.taskId);
    expect(before.statusCode).toBe(200);
    expect(before.json<{ source: Record<string, unknown> }>().source.voc).toEqual({
      visibility_state: 'allowed',
      id: chain.voc?.id,
      display_id: chain.voc?.displayId,
      title: vocTitle,
    });

    await migrateHandle.pool.query(
      `insert into permission.permission_denies
         (workspace_id, actor_id, capability, managed_system_id, reason, created_by_actor_id)
       values ($1, $2, 'voc.read', $3, 'test-deny', $4)`,
      [WORKSPACE_ID, reader.id, chain.msId, adminActorId],
    );

    const after = await getTask(cookie, chain.taskId);
    expect(after.statusCode).toBe(200);
    expect(after.json<{ source: Record<string, unknown> }>().source).not.toHaveProperty('voc');
    expect(after.body).not.toContain(chain.voc?.id ?? '');
    expect(after.body).not.toContain(chain.voc?.displayId ?? '');
    expect(after.body).not.toContain(vocTitle);

    const vocDetail = await app.inject({
      method: 'GET',
      url: `/vocs/${chain.voc?.id}`,
      headers: { cookie: `${SESSION_COOKIE_NAME}=${cookie}` },
    });
    expect(vocDetail.statusCode).toBe(404);
  });

  it('an archived source VOC turns hidden: the key disappears and its title is gone from the body', async () => {
    const vocTitle = `SrcVoc VOC ${uid('archived')}`;
    const chain = await seedChain({ vocTitle, findingSource: 'voc', taskRequestSource: 'finding' });

    // Positive twin: before archiving, the admin sees the VOC as allowed.
    const before = await getTask(adminCookie, chain.taskId);
    expect(before.statusCode).toBe(200);
    expect(
      before.json<{ source: { voc?: { visibility_state: string } } }>().source.voc
        ?.visibility_state,
    ).toBe('allowed');

    await migrateHandle.pool.query('update voc.vocs set archived_at = now() where id = $1', [
      chain.voc?.id,
    ]);

    const after = await getTask(adminCookie, chain.taskId);
    expect(after.statusCode).toBe(200);
    expect(after.json<{ source: Record<string, unknown> }>().source).not.toHaveProperty('voc');
    expect(JSON.stringify(after.json())).not.toContain(vocTitle);
    // The Finding and Task Request nodes are untouched by the VOC's archival.
    expect(after.json<{ source: { finding?: { id: string } } }>().source.finding?.id).toBe(
      chain.findingId,
    );
  });

  it('PATCH /tasks/:id returns the same source.voc verdict as GET, on both the change and no-op paths', async () => {
    const chain = await seedChain({
      vocTitle: `SrcVoc VOC ${uid('patch')}`,
      findingSource: 'voc',
      taskRequestSource: 'finding',
    });
    const got = await getTask(adminCookie, chain.taskId);
    const detail = got.json<{ updated_at: string; source: { voc?: { visibility_state: string } } }>();
    // Positive twin: GET carries the verdict, so equality below is not vacuous.
    expect(detail.source.voc?.visibility_state).toBe('allowed');

    const patch = (ifMatch: string, status: string) =>
      app.inject({
        method: 'PATCH',
        url: `/tasks/${chain.taskId}`,
        headers: {
          cookie: `${SESSION_COOKIE_NAME}=${adminCookie}`,
          'content-type': 'application/json',
          'idempotency-key': randomUUID(),
          'if-match': ifMatch,
        },
        payload: { status },
      });

    const changed = await patch(detail.updated_at, 'doing');
    expect(changed.statusCode, JSON.stringify(changed.json())).toBe(200);
    const changedBody = changed.json<{ updated_at: string; source: typeof detail.source }>();
    expect(changedBody.source.voc).toEqual(detail.source.voc);

    // No-op path (same status) is a separate return in the service.
    const noop = await patch(changedBody.updated_at, 'doing');
    expect(noop.statusCode, JSON.stringify(noop.json())).toBe(200);
    expect(noop.json<{ source: typeof detail.source }>().source.voc).toEqual(detail.source.voc);
  });

  it('developer with voc.read on the Managed System also gets the allowed verdict', async () => {
    const vocTitle = `SrcVoc VOC ${uid('readdev')}`;
    const chain = await seedChain({ vocTitle, findingSource: 'voc', taskRequestSource: 'finding' });
    const devCookie = await devCookieWithGrants(['finding.manage', 'voc.read'], chain.msId);

    const res = await getTask(devCookie, chain.taskId);

    expect(res.statusCode, JSON.stringify(res.json())).toBe(200);
    const body = res.json<{ source: Record<string, unknown> | null }>();
    expect(body.source).toEqual({
      task_request: { id: chain.taskRequestId, status: 'approved' },
      finding: {
        id: chain.findingId,
        title: FINDING_TITLE,
        summary: FINDING_SUMMARY,
        evidence_count: 0,
      },
      voc: {
        visibility_state: 'allowed',
        id: chain.voc?.id,
        display_id: chain.voc?.displayId,
        title: vocTitle,
      },
    });
  });

  it('developer without VOC authority gets no voc key and no VOC identifier anywhere (hidden)', async () => {
    // Positive twin above: admin and in-scope developer see the allowed verdict
    // for the same chain shape before this negative is asserted.
    const vocTitle = `SrcVoc VOC ${uid('hidden')}`;
    const chain = await seedChain({ vocTitle, findingSource: 'voc', taskRequestSource: 'finding' });
    const devCookie = await devCookieWithGrants(['finding.manage'], chain.msId);

    const res = await getTask(devCookie, chain.taskId);

    expect(res.statusCode, JSON.stringify(res.json())).toBe(200);
    const body = res.json<{ source: Record<string, unknown> | null }>();
    // task_request/finding nodes are unchanged for the out-of-scope actor.
    expect(body.source).toMatchObject({
      task_request: { id: chain.taskRequestId, status: 'approved' },
      finding: {
        id: chain.findingId,
        title: FINDING_TITLE,
        summary: FINDING_SUMMARY,
        evidence_count: 0,
      },
    });
    expect(body.source?.voc).toBeUndefined();
    // `hidden` must not leak existence: no id, display id, or title anywhere.
    const raw = JSON.stringify(body);
    expect(raw).not.toContain(chain.voc?.id ?? '');
    expect(raw).not.toContain(chain.voc?.displayId ?? '');
    expect(raw).not.toContain(vocTitle);
  });

  it('triage-only developer gets summary_visible carrying no identifiers', async () => {
    // Positive twin: the voc.read developer case above proves this chain shape
    // reaches `allowed` before the narrowed summary verdict is asserted.
    const vocTitle = `SrcVoc VOC ${uid('summary')}`;
    const chain = await seedChain({ vocTitle, findingSource: 'voc', taskRequestSource: 'finding' });
    const devCookie = await devCookieWithGrants(['finding.manage', 'voc.triage'], chain.msId);

    const res = await getTask(devCookie, chain.taskId);

    expect(res.statusCode, JSON.stringify(res.json())).toBe(200);
    const body = res.json<{ source: Record<string, unknown> | null }>();
    expect(body.source?.voc).toEqual({ visibility_state: 'summary_visible' });
    const raw = JSON.stringify(body);
    expect(raw).not.toContain(chain.voc?.id ?? '');
    expect(raw).not.toContain(chain.voc?.displayId ?? '');
    expect(raw).not.toContain(vocTitle);
    // Non-VOC nodes are unchanged for the summary-visibility actor.
    expect(body.source).toMatchObject({
      task_request: { id: chain.taskRequestId, status: 'approved' },
      finding: { id: chain.findingId, title: FINDING_TITLE },
    });
  });

  it('a VOC-sourced Task Request wins over the linked finding chain (precedence a > b)', async () => {
    const msId = await insertMsDirectly(dbHandle, WORKSPACE_ID, uid(SLUG_PREFIX), 'Precedence MS');
    const requestVocTitle = `SrcVoc VOC request-${randomUUID().slice(0, 8)}`;
    const requestVoc = await seedVoc(msId, requestVocTitle);
    const findingVoc = await seedVoc(msId, `SrcVoc VOC finding-${randomUUID().slice(0, 8)}`);
    const findingId = (
      await insertFindingRow(migrateHandle, {
        workspaceId: WORKSPACE_ID,
        primaryManagedSystemId: msId,
        title: FINDING_TITLE,
        summary: FINDING_SUMMARY,
        sourceType: 'voc',
        sourceId: findingVoc.id,
        status: 'active',
        createdBy: adminActorId,
      })
    ).id;
    const taskRequest = await insertTaskRequestRow(migrateHandle, {
      workspaceId: WORKSPACE_ID,
      sourceType: 'voc',
      sourceId: requestVoc.id,
      primaryManagedSystemId: msId,
      requesterActorId: adminActorId,
      status: 'approved',
      reviewerActorId: adminActorId,
      decided: true,
    });
    // Cross-link a finding (sourced from a different VOC) onto the same request
    // so both candidate VOCs exist and (a) must beat (b).
    await migrateHandle.pool.query(
      `insert into core.entity_links (
          workspace_id, source_type, source_id, target_type, target_id,
          relation_type, visibility, status, managed_system_id, created_by
        )
       values ($1, 'finding', $2, 'task_request', $3, 'requested_task',
               'internal_only', 'active', $4, $5)`,
      [WORKSPACE_ID, findingId, taskRequest.id, msId, adminActorId],
    );
    const task = await insertTaskRow(migrateHandle, {
      workspaceId: WORKSPACE_ID,
      primaryManagedSystemId: msId,
      sourceTaskRequestId: taskRequest.id,
      createdBy: adminActorId,
    });

    const res = await getTask(adminCookie, task.id);

    expect(res.statusCode, JSON.stringify(res.json())).toBe(200);
    const body = res.json<{ source: Record<string, unknown> | null }>();
    expect(body.source).toEqual({
      task_request: { id: taskRequest.id, status: 'approved' },
      finding: {
        id: findingId,
        title: FINDING_TITLE,
        summary: FINDING_SUMMARY,
        evidence_count: 0,
      },
      voc: {
        visibility_state: 'allowed',
        id: requestVoc.id,
        display_id: requestVoc.displayId,
        title: requestVocTitle,
      },
    });
    expect(JSON.stringify(body)).not.toContain(findingVoc.id);
  });

  it('cluster-sourced finding chains carry no voc key', async () => {
    const chain = await seedChain({
      vocTitle: `SrcVoc VOC ${uid('cluster')}`,
      findingSource: 'voc_cluster',
      taskRequestSource: 'finding',
    });

    const res = await getTask(adminCookie, chain.taskId);

    expect(res.statusCode, JSON.stringify(res.json())).toBe(200);
    const body = res.json<{ source: Record<string, unknown> | null }>();
    expect(body.source).toEqual({
      task_request: { id: chain.taskRequestId, status: 'approved' },
      finding: {
        id: chain.findingId,
        title: FINDING_TITLE,
        summary: FINDING_SUMMARY,
        evidence_count: 0,
      },
    });
  });

  it('voc_cluster Task Requests without a finding carry no voc key and no finding node', async () => {
    const chain = await seedChain({
      vocTitle: `SrcVoc VOC ${uid('trcluster')}`,
      taskRequestSource: 'voc_cluster',
    });

    const res = await getTask(adminCookie, chain.taskId);

    expect(res.statusCode, JSON.stringify(res.json())).toBe(200);
    const body = res.json<{ source: Record<string, unknown> | null }>();
    expect(body.source).toEqual({
      task_request: { id: chain.taskRequestId, status: 'approved' },
    });
  });

  it('standalone tasks still return a null source', async () => {
    const msId = await insertMsDirectly(dbHandle, WORKSPACE_ID, uid(SLUG_PREFIX), 'Standalone MS');
    const task = await insertTaskRow(migrateHandle, {
      workspaceId: WORKSPACE_ID,
      primaryManagedSystemId: msId,
      createdBy: adminActorId,
    });

    const res = await getTask(adminCookie, task.id);

    expect(res.statusCode, JSON.stringify(res.json())).toBe(200);
    expect(res.json<{ source: unknown }>().source).toBeNull();
  });
});
