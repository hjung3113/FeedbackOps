import { randomUUID } from 'node:crypto';

import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

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
  let readOnlyCookie: string;
  let clusterMsId: string;
  let targetMsId: string;
  let clusterId: string;
  let findingId: string;
  const actorIds: string[] = [];
  const grantIds: string[] = [];
  const clusterIds: string[] = [];
  const findingIds: string[] = [];

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
    options: { clusterId?: string; findingId?: string; reason?: string; key?: string } = {},
  ) =>
    app.inject({
      method: 'POST',
      url: `/voc-clusters/${options.clusterId ?? clusterId}/unlink-finding`,
      headers: headers(cookie, options.key),
      body: { finding_id: options.findingId ?? findingId, reason: options.reason ?? 'no longer evidence' },
    });

  async function linkState(linkId: string) {
    return ops.pool.query<{
      status: string;
      detached_by: string | null;
      detach_reason: string | null;
      detached_at: Date | null;
    }>('select status, detached_by, detach_reason, detached_at from core.entity_links where id=$1', [linkId]);
  }

  async function auditCount(linkId: string) {
    const result = await ops.pool.query<{ count: string }>(
      `select count(*)::text as count from core.audit_log
       where (subject_id=$1 and event_type='entity_link.detached')
          or (detail->>'link_id'=$1 and event_type='finding_unlinked_from_voc_cluster')`,
      [linkId],
    );
    return Number(result.rows[0]?.count ?? 0);
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
    const managedSystems = await Promise.all(['cluster', 'target'].map((kind) => ops.pool.query<{ id: string }>(
      'insert into core.managed_systems(workspace_id,slug,name) values($1,$2,$3) returning id',
      [WORKSPACE_ID, `unlink-${kind}-${randomUUID()}`, `Unlink ${kind}`],
    )));
    clusterMsId = managedSystems[0]?.rows[0]?.id ?? '';
    targetMsId = managedSystems[1]?.rows[0]?.id ?? '';
    clusterId = (await insertVocClusterRow(ops, { workspaceId: WORKSPACE_ID, primaryManagedSystemId: clusterMsId, createdBy: adminId })).id;
    clusterIds.push(clusterId);
    const finding = await insertFindingRow(ops, { workspaceId: WORKSPACE_ID, primaryManagedSystemId: targetMsId, sourceId: clusterId, createdBy: adminId, status: 'active' });
    findingId = finding.id;
    findingIds.push(findingId);
    for (const [label, withManage] of [['developer', true], ['read-only', false]] as const) {
      const actor = await insertActorRow(ops, { workspaceId: WORKSPACE_ID, externalId: `unlink-${label}-${randomUUID()}`, roleLevel: 'developer' });
      actorIds.push(actor.id);
      for (const ms of [clusterMsId, targetMsId]) {
        grantIds.push((await grantCapability(ops, { workspaceId: WORKSPACE_ID, actorId: actor.id, capability: 'finding.read', managedSystemId: ms, grantedByActorId: adminId })).id);
        if (withManage) grantIds.push((await grantCapability(ops, { workspaceId: WORKSPACE_ID, actorId: actor.id, capability: 'finding.manage', managedSystemId: ms, grantedByActorId: adminId })).id);
      }
      const cookie = await loginAs(app, actor.external_id);
      if (withManage) developerCookie = cookie; else readOnlyCookie = cookie;
    }
  });

  afterAll(async () => {
    await cleanupVocClusterFixtures(ops, { workspaceId: WORKSPACE_ID, actorIds, managedSystemIds: [clusterMsId, targetMsId], clusterIds, findingIds, permissionGrantIds: grantIds });
    await app?.close();
    await appDb?.close();
    await ops?.close();
  });

  it('soft-detaches the active evidence tuple and writes the two required audit rows', async () => {
    const linkId = await seedLink();
    const response = await unlink(adminCookie, { reason: '  superseded  ' });
    expect(response.statusCode).toBe(204);
    expect(response.body).toBe('');
    expect((await linkState(linkId)).rows[0]).toMatchObject({ status: 'detached', detached_by: adminId, detach_reason: 'superseded' });
    expect((await linkState(linkId)).rows[0]?.detached_at).toBeTruthy();
    const audits = await ops.pool.query<{ event_type: string; subject_id: string; detail: { link_id: string } }>(
      "select event_type, subject_id, detail from core.audit_log where detail->>'link_id'=$1 order by event_type", [linkId],
    );
    expect(audits.rows.map((row) => row.event_type)).toEqual(['entity_link.detached', 'finding_unlinked_from_voc_cluster']);
    expect(audits.rows.find((row) => row.event_type === 'finding_unlinked_from_voc_cluster')).toMatchObject({ subject_id: findingId, detail: { link_id: linkId } });
  });

  it('allows a fully scoped Developer and gives no audit to repeated or never-linked no-ops', async () => {
    const linkId = await seedLink();
    expect((await unlink(developerCookie)).statusCode).toBe(204);
    const key = randomUUID();
    expect((await unlink(adminCookie, { key })).statusCode).toBe(204);
    expect((await unlink(adminCookie, { key })).statusCode).toBe(204);
    expect(await auditCount(linkId)).toBe(2);
    expect((await unlink(adminCookie)).statusCode).toBe(204);
    expect(await auditCount(linkId)).toBe(2);
  });

  it('does not disclose unreadable endpoints and denies readable endpoints lacking manage scope', async () => {
    const linkId = await seedLink();
    const missingCluster = await unlink(developerCookie, { clusterId: randomUUID() });
    const missingFinding = await unlink(developerCookie, { findingId: randomUUID() });
    expect(missingCluster.body).toBe('{"code":"not_found.record","message":"record not found"}');
    expect(missingFinding.body).toBe(missingCluster.body);
    const denied = await unlink(readOnlyCookie);
    expect(denied.statusCode).toBe(403);
    expect(denied.json<{ code: string }>().code).toBe('permission.scope_required');
    expect((await linkState(linkId)).rows[0]?.status).toBe('active');
    expect(await auditCount(linkId)).toBe(0);
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
