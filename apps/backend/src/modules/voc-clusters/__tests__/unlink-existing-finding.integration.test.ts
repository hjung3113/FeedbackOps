import { randomUUID } from 'node:crypto';

import type { FastifyInstance } from 'fastify';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

import { loadConfig } from '../../../config.js';
import { type DbHandle, createDb } from '../../../db/client.js';
import { SESSION_COOKIE_NAME } from '../../../middleware/require-session.js';
import { buildServer } from '../../../server.js';
import { insertFindingRow } from '../../findings/__tests__/_seed-helpers.js';
import { loginAs } from '../../voc/__tests__/_seed-helpers.js';
import {
  cleanupVocClusterFixtures,
  grantCapability,
  insertActorRow,
  insertVocClusterRow,
} from './_seed-helpers.js';

const APP_URL = process.env.DATABASE_URL ?? '';
const MIGRATE_URL = process.env.DATABASE_URL_MIGRATE ?? '';
const WORKSPACE_ID = process.env.WORKSPACE_ID ?? '';
const runIntegration = Boolean(APP_URL && MIGRATE_URL && WORKSPACE_ID);

describe.skipIf(!runIntegration)('VOC cluster unlink existing Finding (#172)', () => {
  let app: FastifyInstance;
  let appDb: DbHandle;
  let ops: DbHandle;
  let adminId: string;
  let adminCookie: string;
  let developerCookie: string;
  let targetUnreadableCookie: string;
  let plainUserCookie: string;
  let clusterManageOnlyCookie: string;
  let targetManageOnlyCookie: string;
  let mismatchCookie: string;
  let clusterMsId: string;
  let targetMsId: string;
  let clusterId: string;
  let findingId: string;
  const actorIds: string[] = [];
  const grantIds: string[] = [];
  const clusterIds: string[] = [];
  const findingIds: string[] = [];
  const foreignWorkspaceId = randomUUID();
  let foreignFindingId: string;

  const headers = (cookie: string, key = randomUUID()) => ({
    cookie: `${SESSION_COOKIE_NAME}=${cookie}`,
    'workspace-id': WORKSPACE_ID,
    'idempotency-key': key,
  });

  async function seedLink(
    sourceId = clusterId,
    targetId = findingId,
    relation: 'evidence_of' | 'created_finding' = 'evidence_of',
  ) {
    const row = await ops.pool.query<{ id: string }>(
      `insert into core.entity_links (
        workspace_id, source_type, source_id, target_type, target_id, relation_type,
        visibility, status, managed_system_id, created_by
      ) values ($1, 'voc_cluster', $2, 'finding', $3, $4, 'internal_only', 'active', $5, $6)
      returning id`,
      [WORKSPACE_ID, sourceId, targetId, relation, clusterMsId, adminId],
    );
    return row.rows[0]?.id ?? '';
  }

  const unlink = (
    cookie: string,
    options: {
      clusterId?: string;
      findingId?: string;
      reason?: string;
      key?: ReturnType<typeof randomUUID>;
    } = {},
  ) =>
    app.inject({
      method: 'POST',
      url: `/voc-clusters/${options.clusterId ?? clusterId}/unlink-finding`,
      headers: headers(cookie, options.key),
      body: {
        finding_id: options.findingId ?? findingId,
        reason: options.reason ?? 'no longer evidence',
      },
    });

  async function linkState(linkId: string) {
    return ops.pool.query<{
      status: string;
      detached_by: string | null;
      detach_reason: string | null;
      detached_at: Date | null;
      updated_at: Date;
    }>(
      'select status, detached_by, detach_reason, detached_at, updated_at from core.entity_links where id=$1',
      [linkId],
    );
  }

  async function auditCount(linkId: string) {
    const result = await ops.pool.query<{ count: string }>(
      `select count(*)::text as count from core.audit_log
       where (subject_id=$1::uuid and event_type='entity_link.detached')
          or (detail->>'link_id'=$1 and event_type='finding_unlinked_from_voc_cluster')`,
      [linkId],
    );
    return Number(result.rows[0]?.count ?? 0);
  }

  async function idempotencyBody(actorId: string, key: string) {
    const result = await ops.pool.query<{ response_body: unknown }>(
      'select response_body from core.idempotency_keys where actor_id=$1 and key=$2',
      [actorId, key],
    );
    return result.rows[0]?.response_body;
  }

  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    appDb = createDb(APP_URL);
    ops = createDb(MIGRATE_URL);
    app = await buildServer({ config: loadConfig(), dbHandle: appDb });
    await app.ready();
    const admin = await ops.pool.query<{ id: string; external_id: string }>(
      "select id, external_id from core.actors where workspace_id=$1 and external_id='mock-admin-1'",
      [WORKSPACE_ID],
    );
    adminId = admin.rows[0]?.id ?? '';
    adminCookie = await loginAs(app, admin.rows[0]?.external_id ?? '');
    const managedSystems = await Promise.all(
      ['cluster', 'target'].map((kind) =>
        ops.pool.query<{ id: string }>(
          'insert into core.managed_systems(workspace_id,slug,name) values($1,$2,$3) returning id',
          [WORKSPACE_ID, `unlink-${kind}-${randomUUID()}`, `Unlink ${kind}`],
        ),
      ),
    );
    clusterMsId = managedSystems[0]?.rows[0]?.id ?? '';
    targetMsId = managedSystems[1]?.rows[0]?.id ?? '';
    clusterId = (
      await insertVocClusterRow(ops, {
        workspaceId: WORKSPACE_ID,
        primaryManagedSystemId: clusterMsId,
        createdBy: adminId,
      })
    ).id;
    clusterIds.push(clusterId);
    const finding = await insertFindingRow(ops, {
      workspaceId: WORKSPACE_ID,
      primaryManagedSystemId: targetMsId,
      sourceId: clusterId,
      createdBy: adminId,
      status: 'active',
    });
    findingId = finding.id;
    findingIds.push(findingId);
    for (const [label, withManage] of [['developer', true]] as const) {
      const externalId = `unlink-${label}-${randomUUID()}`;
      const actor = await insertActorRow(ops, {
        workspaceId: WORKSPACE_ID,
        externalId,
        roleLevel: 'developer',
      });
      actorIds.push(actor.id);
      for (const ms of [clusterMsId, targetMsId]) {
        grantIds.push(
          (
            await grantCapability(ops, {
              workspaceId: WORKSPACE_ID,
              actorId: actor.id,
              capability: 'finding.read',
              managedSystemId: ms,
              grantedByActorId: adminId,
            })
          ).id,
        );
        if (withManage)
          grantIds.push(
            (
              await grantCapability(ops, {
                workspaceId: WORKSPACE_ID,
                actorId: actor.id,
                capability: 'finding.manage',
                managedSystemId: ms,
                grantedByActorId: adminId,
              })
            ).id,
          );
      }
      const cookie = await loginAs(app, externalId);
      developerCookie = cookie;
    }
    const targetUnreadableExternalId = `unlink-target-unreadable-${randomUUID()}`;
    const targetUnreadable = await insertActorRow(ops, {
      workspaceId: WORKSPACE_ID,
      externalId: targetUnreadableExternalId,
      roleLevel: 'developer',
    });
    actorIds.push(targetUnreadable.id);
    grantIds.push(
      (
        await grantCapability(ops, {
          workspaceId: WORKSPACE_ID,
          actorId: targetUnreadable.id,
          capability: 'finding.read',
          managedSystemId: clusterMsId,
          grantedByActorId: adminId,
        })
      ).id,
    );
    targetUnreadableCookie = await loginAs(app, targetUnreadableExternalId);
    for (const [label, manageMs] of [
      ['cluster-manage-only', clusterMsId],
      ['target-manage-only', targetMsId],
    ] as const) {
      const externalId = `unlink-${label}-${randomUUID()}`;
      const actor = await insertActorRow(ops, {
        workspaceId: WORKSPACE_ID,
        externalId,
        roleLevel: 'developer',
      });
      actorIds.push(actor.id);
      for (const ms of [clusterMsId, targetMsId]) {
        grantIds.push(
          (
            await grantCapability(ops, {
              workspaceId: WORKSPACE_ID,
              actorId: actor.id,
              capability: 'finding.read',
              managedSystemId: ms,
              grantedByActorId: adminId,
            })
          ).id,
        );
      }
      grantIds.push(
        (
          await grantCapability(ops, {
            workspaceId: WORKSPACE_ID,
            actorId: actor.id,
            capability: 'finding.manage',
            managedSystemId: manageMs,
            grantedByActorId: adminId,
          })
        ).id,
      );
      const cookie = await loginAs(app, externalId);
      if (manageMs === clusterMsId) clusterManageOnlyCookie = cookie;
      else targetManageOnlyCookie = cookie;
    }
    const plainExternalId = `unlink-user-${randomUUID()}`;
    const plain = await insertActorRow(ops, {
      workspaceId: WORKSPACE_ID,
      externalId: plainExternalId,
      roleLevel: 'user',
    });
    actorIds.push(plain.id);
    plainUserCookie = await loginAs(app, plainExternalId);
    const mismatchExternalId = `unlink-mismatch-${randomUUID()}`;
    const mismatch = await insertActorRow(ops, {
      workspaceId: WORKSPACE_ID,
      externalId: mismatchExternalId,
      roleLevel: 'developer',
    });
    actorIds.push(mismatch.id);
    mismatchCookie = await loginAs(app, mismatchExternalId);
    await ops.pool.query('insert into core.workspaces(id, name) values($1, $2)', [
      foreignWorkspaceId,
      `unlink foreign ${randomUUID()}`,
    ]);
    await ops.pool.query('update core.sessions set workspace_id=$1 where actor_id=$2', [
      foreignWorkspaceId,
      mismatch.id,
    ]);
    const foreignActor = await ops.pool.query<{ id: string }>(
      "insert into core.actors(workspace_id, external_id, email, display_name, role_level, actor_type) values($1,$2,$3,$4,'admin','internal_member') returning id",
      [
        foreignWorkspaceId,
        `unlink-foreign-${randomUUID()}`,
        `foreign-${randomUUID()}@local`,
        'Foreign admin',
      ],
    );
    const foreignMs = await ops.pool.query<{ id: string }>(
      'insert into core.managed_systems(workspace_id,slug,name) values($1,$2,$3) returning id',
      [foreignWorkspaceId, `unlink-foreign-ms-${randomUUID()}`, 'Foreign MS'],
    );
    const foreignFinding = await insertFindingRow(ops, {
      workspaceId: foreignWorkspaceId,
      primaryManagedSystemId: foreignMs.rows[0]?.id ?? '',
      sourceId: randomUUID(),
      createdBy: foreignActor.rows[0]?.id ?? '',
      status: 'active',
    });
    foreignFindingId = foreignFinding.id;
  });

  afterAll(async () => {
    await ops.pool.query('delete from core.idempotency_keys where actor_id=$1', [adminId]);
    await cleanupVocClusterFixtures(ops, {
      workspaceId: WORKSPACE_ID,
      actorIds,
      managedSystemIds: [clusterMsId, targetMsId],
      clusterIds,
      findingIds,
      permissionGrantIds: grantIds,
    });
    await ops.pool.query('delete from finding.findings where id=$1', [foreignFindingId]);
    await ops.pool.query('delete from core.managed_systems where workspace_id=$1', [
      foreignWorkspaceId,
    ]);
    await ops.pool.query('delete from core.actors where workspace_id=$1', [foreignWorkspaceId]);
    await ops.pool.query('delete from core.workspaces where id=$1', [foreignWorkspaceId]);
    await app?.close();
    await appDb?.close();
    await ops?.close();
  });

  afterEach(async () => {
    await ops.pool.query(
      "delete from core.audit_log where detail->>'voc_cluster_id'=$1 or detail->'source'->>'id'=$1",
      [clusterId],
    );
    await ops.pool.query(
      "delete from core.entity_links where workspace_id=$1 and source_type='voc_cluster' and source_id=$2",
      [WORKSPACE_ID, clusterId],
    );
  });

  it('soft-detaches the active evidence tuple and writes the two required audit rows', async () => {
    const linkId = await seedLink();
    const before = (await linkState(linkId)).rows[0]?.updated_at;
    const response = await unlink(adminCookie, { reason: '  superseded  ' });
    expect(response.statusCode).toBe(204);
    expect(response.body).toBe('');
    const detached = (await linkState(linkId)).rows[0];
    expect(detached).toMatchObject({
      status: 'detached',
      detached_by: adminId,
      detach_reason: 'superseded',
    });
    expect(detached?.detached_at).toBeTruthy();
    expect(detached?.updated_at.getTime()).toBeGreaterThan(before?.getTime() ?? 0);
    const audits = await ops.pool.query<{
      event_type: string;
      subject_id: string;
      detail: Record<string, unknown>;
    }>(
      "select event_type, subject_id, detail from core.audit_log where detail->>'link_id'=$1 order by event_type",
      [linkId],
    );
    expect(audits.rows.map((row) => row.event_type)).toEqual([
      'entity_link.detached',
      'finding_unlinked_from_voc_cluster',
    ]);
    expect(
      audits.rows.find((row) => row.event_type === 'finding_unlinked_from_voc_cluster'),
    ).toMatchObject({
      subject_id: findingId,
      detail: {
        link_id: linkId,
        finding_id: findingId,
        voc_cluster_id: clusterId,
        primary_managed_system_id: targetMsId,
        relation_type: 'evidence_of',
        reason: 'superseded',
      },
    });
    expect(audits.rows.find((row) => row.event_type === 'entity_link.detached')).toMatchObject({
      subject_id: linkId,
      detail: {
        link_id: linkId,
        source: { type: 'voc_cluster', id: clusterId },
        target: { type: 'finding', id: findingId },
        relation_type: 'evidence_of',
        reason: 'superseded',
      },
    });
  });

  it('persists JSON null for a first-time 204 and replays a successful detach exactly once', async () => {
    const linkId = await seedLink();
    const key = randomUUID();
    const first = await unlink(adminCookie, { key });
    const replay = await unlink(adminCookie, { key });
    expect(first.statusCode).toBe(204);
    expect(replay.statusCode).toBe(204);
    expect(first.body).toBe(replay.body);
    expect(await idempotencyBody(adminId, key)).toBeNull();
    expect(await auditCount(linkId)).toBe(2);
    const changedKey = await unlink(adminCookie, { key, reason: 'changed reason' });
    expect(changedKey.statusCode).toBe(409);
    expect(changedKey.json<{ code: string }>().code).toBe('conflict.idempotency_key_reuse');
  });

  it('allows a fully scoped Developer and makes never-linked and already-detached no-ops byte-equivalent', async () => {
    const linkId = await seedLink();
    expect((await unlink(developerCookie)).statusCode).toBe(204);
    const alreadyDetached = await unlink(adminCookie);
    const neverLinkedFinding = (
      await insertFindingRow(ops, {
        workspaceId: WORKSPACE_ID,
        primaryManagedSystemId: targetMsId,
        sourceId: clusterId,
        createdBy: adminId,
        status: 'active',
      })
    ).id;
    findingIds.push(neverLinkedFinding);
    const neverLinked = await unlink(adminCookie, { findingId: neverLinkedFinding });
    expect(alreadyDetached.statusCode).toBe(204);
    expect(alreadyDetached.body).toBe('');
    expect(neverLinked.statusCode).toBe(204);
    expect(neverLinked.body).toBe('');
    expect(alreadyDetached.body).toBe(neverLinked.body);
    expect(await auditCount(linkId)).toBe(2);
  });

  it('returns identical non-disclosing 404s and leaves a plain User link untouched', async () => {
    const linkId = await seedLink();
    const missingCluster = await unlink(developerCookie, { clusterId: randomUUID() });
    const missingFinding = await unlink(developerCookie, { findingId: randomUUID() });
    const foreignFinding = await unlink(developerCookie, { findingId: foreignFindingId });
    const unreadableTarget = await unlink(targetUnreadableCookie);
    expect(missingCluster.body).toBe('{"code":"not_found.record","message":"record not found"}');
    expect(missingFinding.body).toBe(missingCluster.body);
    expect(foreignFinding.body).toBe(missingCluster.body);
    expect(unreadableTarget.body).toBe(missingCluster.body);
    const plainUser = await unlink(plainUserCookie);
    expect(plainUser.statusCode).toBe(404);
    expect(plainUser.body).toBe(missingCluster.body);
    expect((await linkState(linkId)).rows[0]?.status).toBe('active');
    expect(await auditCount(linkId)).toBe(0);
  });

  it('requires finding.manage separately on the cluster and target managed systems', async () => {
    const linkId = await seedLink();
    for (const [cookie, expectedScope] of [
      [clusterManageOnlyCookie, targetMsId],
      [targetManageOnlyCookie, clusterMsId],
    ] as const) {
      const denied = await unlink(cookie);
      expect(denied.statusCode).toBe(403);
      expect(denied.json<{ code: string; detail: { requiredScope: string[] } }>()).toMatchObject({
        code: 'permission.scope_required',
        detail: { requiredScope: [expectedScope] },
      });
      expect((await linkState(linkId)).rows[0]?.status).toBe('active');
      expect(await auditCount(linkId)).toBe(0);
    }
  });

  it('returns validation envelopes and rejects a session bound to another workspace', async () => {
    const common = {
      cookie: `${SESSION_COOKIE_NAME}=${adminCookie}`,
      'workspace-id': WORKSPACE_ID,
    };
    const invalidId = await app.inject({
      method: 'POST',
      url: '/voc-clusters/not-a-uuid/unlink-finding',
      headers: { ...common, 'idempotency-key': randomUUID() },
      body: { finding_id: findingId, reason: 'valid' },
    });
    const emptyReason = await app.inject({
      method: 'POST',
      url: `/voc-clusters/${clusterId}/unlink-finding`,
      headers: { ...common, 'idempotency-key': randomUUID() },
      body: { finding_id: findingId, reason: '   ' },
    });
    const missingKey = await app.inject({
      method: 'POST',
      url: `/voc-clusters/${clusterId}/unlink-finding`,
      headers: common,
      body: { finding_id: findingId, reason: 'valid' },
    });
    for (const response of [invalidId, emptyReason, missingKey]) {
      expect(response.statusCode).toBe(422);
      expect(response.json<{ code: string }>().code).toMatch(/^validation\./);
    }
    const mismatch = await unlink(mismatchCookie);
    expect(mismatch.statusCode).toBe(403);
    expect(mismatch.json<{ code: string }>().code).toBe('auth.workspace_mismatch');
  });

  it('omits a detached Finding from cluster detail and list projections', async () => {
    const linkId = await seedLink();
    expect((await unlink(adminCookie)).statusCode).toBe(204);
    const readHeaders = {
      cookie: `${SESSION_COOKIE_NAME}=${adminCookie}`,
      'workspace-id': WORKSPACE_ID,
    };
    const detail = await app.inject({
      method: 'GET',
      url: `/voc-clusters/${clusterId}`,
      headers: readHeaders,
    });
    const list = await app.inject({
      method: 'GET',
      url: `/voc-clusters?managed_system_id=${clusterMsId}`,
      headers: readHeaders,
    });
    expect(
      detail
        .json<{ linked_findings: Array<{ id: string }> }>()
        .linked_findings.map((finding) => finding.id),
    ).not.toContain(findingId);
    expect(
      list
        .json<{ items: Array<{ id: string; linked_findings: Array<{ id: string }> }> }>()
        .items.find((item) => item.id === clusterId)
        ?.linked_findings.map((finding) => finding.id),
    ).not.toContain(findingId);
    expect((await linkState(linkId)).rows[0]?.status).toBe('detached');
  });

  it('concurrent distinct keys produce one detach and one audit pair without a 500', async () => {
    const linkId = await seedLink();
    const responses = await Promise.all([
      unlink(adminCookie, { key: randomUUID() }),
      unlink(adminCookie, { key: randomUUID() }),
    ]);
    expect(responses.map((response) => response.statusCode)).toEqual([204, 204]);
    expect(responses.every((response) => response.statusCode < 500)).toBe(true);
    expect((await linkState(linkId)).rows[0]?.status).toBe('detached');
    expect(await auditCount(linkId)).toBe(2);
  });

  it('leaves created_finding provenance active and an old key cannot detach a later relink', async () => {
    const provenance = await seedLink(clusterId, findingId, 'created_finding');
    expect((await unlink(adminCookie)).statusCode).toBe(204);
    expect((await linkState(provenance)).rows[0]?.status).toBe('active');
    const first = await seedLink();
    const key = randomUUID();
    expect((await unlink(adminCookie, { key })).statusCode).toBe(204);
    const relink = await seedLink();
    expect((await unlink(adminCookie, { key })).statusCode).toBe(204);
    expect((await linkState(first)).rows[0]?.status).toBe('detached');
    expect((await linkState(relink)).rows[0]?.status).toBe('active');
    expect((await unlink(adminCookie)).statusCode).toBe(204);
    expect((await linkState(relink)).rows[0]?.status).toBe('detached');
  });
});
