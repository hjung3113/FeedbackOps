import { randomUUID } from 'node:crypto';

import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { loadConfig } from '../../../config.js';
import { type DbHandle, createDb } from '../../../db/client.js';
import { SESSION_COOKIE_NAME } from '../../../middleware/require-session.js';
import { buildServer } from '../../../server.js';
import { loginAs, paragraphDoc } from '../../voc/__tests__/_seed-helpers.js';
import {
  grantCapability,
  insertActorRow,
  insertVocClusterMemberRow,
  insertVocClusterRow,
  insertVocRow,
} from './_seed-helpers.js';

const APP_URL = process.env.DATABASE_URL ?? '';
const MIGRATE_URL = process.env.DATABASE_URL_MIGRATE ?? '';
const WORKSPACE_ID = process.env.WORKSPACE_ID ?? '';
const runIntegration = Boolean(APP_URL && MIGRATE_URL && WORKSPACE_ID);

describe.skipIf(!runIntegration)('VOC cluster bulk public update', () => {
  let app: FastifyInstance;
  let appDb: DbHandle;
  let ops: DbHandle;
  let adminCookie: string;
  let managerCookie: string;
  let adminId: string;
  let managerId: string;
  let msId: string;
  let clusterId: string;
  let memberVocId: string;
  let secondMemberVocId: string;
  let archivedMemberVocId: string;

  const headers = (cookie: string) => ({
    cookie: `${SESSION_COOKIE_NAME}=${cookie}`,
    'content-type': 'application/json',
    'workspace-id': WORKSPACE_ID,
  });
  const publicUpdate = {
    skip_public_update: false as const,
    body_rich_content: paragraphDoc('Shared reporter-safe update'),
    next_reporter_facing_status: 'reviewing' as const,
  };

  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    appDb = createDb(APP_URL);
    ops = createDb(MIGRATE_URL);
    app = await buildServer({ config: loadConfig(), dbHandle: appDb });
    await app.ready();
    adminCookie = await loginAs(app, 'mock-admin-1');
    adminId =
      (
        await ops.pool.query<{ id: string }>(
          `select id from core.actors where workspace_id=$1 and external_id='mock-admin-1'`,
          [WORKSPACE_ID],
        )
      ).rows[0]?.id ?? '';
    const externalId = `cluster-bulk-manager-${randomUUID()}`;
    managerId = (
      await insertActorRow(ops, {
        workspaceId: WORKSPACE_ID,
        externalId,
        roleLevel: 'developer',
      })
    ).id;
    msId =
      (
        await ops.pool.query<{ id: string }>(
          'insert into core.managed_systems(workspace_id,slug,name) values($1,$2,$3) returning id',
          [WORKSPACE_ID, `cluster-bulk-${randomUUID()}`, 'Cluster bulk update'],
        )
      ).rows[0]?.id ?? '';
    for (const capability of ['voc.read', 'finding.read', 'finding.manage']) {
      await grantCapability(ops, {
        workspaceId: WORKSPACE_ID,
        actorId: managerId,
        capability,
        managedSystemId: msId,
        grantedByActorId: adminId,
      });
    }
    clusterId = (
      await insertVocClusterRow(ops, {
        workspaceId: WORKSPACE_ID,
        primaryManagedSystemId: msId,
        createdBy: adminId,
      })
    ).id;
    memberVocId = (
      await insertVocRow(ops, {
        workspaceId: WORKSPACE_ID,
        primaryManagedSystemId: msId,
        reporterId: adminId,
        title: 'Bulk member',
      })
    ).id;
    secondMemberVocId = (
      await insertVocRow(ops, {
        workspaceId: WORKSPACE_ID,
        primaryManagedSystemId: msId,
        reporterId: adminId,
        title: 'Second bulk member',
      })
    ).id;
    archivedMemberVocId = (
      await insertVocRow(ops, {
        workspaceId: WORKSPACE_ID,
        primaryManagedSystemId: msId,
        reporterId: adminId,
        title: 'Archived hidden member',
      })
    ).id;
    await insertVocClusterMemberRow(ops, { clusterId, vocId: memberVocId, addedBy: adminId });
    await insertVocClusterMemberRow(ops, {
      clusterId,
      vocId: secondMemberVocId,
      addedBy: adminId,
    });
    await insertVocClusterMemberRow(ops, {
      clusterId,
      vocId: archivedMemberVocId,
      addedBy: adminId,
    });
    await ops.pool.query('update voc.vocs set archived_at=now() where id=$1', [
      archivedMemberVocId,
    ]);
    managerCookie = await loginAs(app, externalId);
  });

  afterAll(async () => {
    if (ops) {
      await ops.pool.query('delete from core.audit_log where subject_id in ($1,$2,$3)', [
        clusterId,
        memberVocId,
        secondMemberVocId,
      ]);
      await ops.pool.query('delete from voc.voc_public_updates where voc_id=any($1::uuid[])', [
        [memberVocId, secondMemberVocId],
      ]);
      await ops.pool.query('delete from voc_cluster.voc_cluster_members where cluster_id=$1', [
        clusterId,
      ]);
      await ops.pool.query('delete from voc_cluster.voc_clusters where id=$1', [clusterId]);
      await ops.pool.query('delete from voc.vocs where id=any($1::uuid[])', [
        [memberVocId, secondMemberVocId, archivedMemberVocId],
      ]);
      await ops.pool.query('delete from permission.permission_grants where actor_id=$1', [
        managerId,
      ]);
      await ops.pool.query('delete from core.managed_systems where id=$1', [msId]);
      await ops.pool.query('delete from core.sessions where actor_id=$1', [managerId]);
      await ops.pool.query('delete from core.actors where id=$1', [managerId]);
    }
    await app?.close();
    await appDb?.close();
    await ops?.close();
  });

  it('authorizes candidate generation without writing a Public Update', async () => {
    const before = await ops.pool.query<{ n: number }>(
      'select count(*)::int n from voc.voc_public_updates where voc_id=$1',
      [memberVocId],
    );
    const response = await app.inject({
      method: 'POST',
      url: `/voc-clusters/${clusterId}/public-update-candidate`,
      headers: headers(managerCookie),
      payload: publicUpdate,
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ candidate: publicUpdate });
    const after = await ops.pool.query<{ n: number }>(
      'select count(*)::int n from voc.voc_public_updates where voc_id=$1',
      [memberVocId],
    );
    expect(after.rows[0]?.n).toBe(before.rows[0]?.n);
  });

  it('rechecks voc.triage for each VOC and skips a member the actor cannot triage', async () => {
    const response = await app.inject({
      method: 'POST',
      url: `/voc-clusters/${clusterId}/apply-public-update-candidate`,
      headers: headers(managerCookie),
      payload: { voc_ids: [memberVocId, secondMemberVocId], public_update: publicUpdate },
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      outcomes: [
        { voc_id: memberVocId, status: 'skipped', reason: 'permission.denied' },
        { voc_id: secondMemberVocId, status: 'skipped', reason: 'permission.denied' },
      ],
    });
    const writes = await ops.pool.query<{ n: number }>(
      'select count(*)::int n from voc.voc_public_updates where voc_id=any($1::uuid[])',
      [[memberVocId, secondMemberVocId]],
    );
    expect(writes.rows[0]?.n).toBe(0);
    const audits = await ops.pool.query<{ n: number }>(
      `select count(*)::int n from core.audit_log
       where subject_id=any($1::uuid[])
         and event_type in ('public_update_created','reporter_facing_status_changed')`,
      [[memberVocId, secondMemberVocId]],
    );
    expect(audits.rows[0]?.n).toBe(0);
  });

  it('makes a hidden member indistinguishable from an absent VOC in the response', async () => {
    const absentId = randomUUID();
    const response = await app.inject({
      method: 'POST',
      url: `/voc-clusters/${clusterId}/apply-public-update-candidate`,
      headers: headers(managerCookie),
      payload: { voc_ids: [archivedMemberVocId, absentId], public_update: publicUpdate },
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      outcomes: [
        { voc_id: archivedMemberVocId, status: 'skipped', reason: 'not_found' },
        { voc_id: absentId, status: 'skipped', reason: 'not_found' },
      ],
    });
  });

  it('applies through the per-VOC command and emits its normal audit', async () => {
    const response = await app.inject({
      method: 'POST',
      url: `/voc-clusters/${clusterId}/apply-public-update-candidate`,
      headers: headers(adminCookie),
      payload: { voc_ids: [memberVocId, secondMemberVocId], public_update: publicUpdate },
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      outcomes: [
        { voc_id: memberVocId, status: 'applied' },
        { voc_id: secondMemberVocId, status: 'applied' },
      ],
    });
    const audit = await ops.pool.query<{ subject_id: string; event_type: string }>(
      `select subject_id, event_type from core.audit_log
       where subject_id=any($1::uuid[])
         and event_type in ('public_update_created','reporter_facing_status_changed')
       order by subject_id, event_type`,
      [[memberVocId, secondMemberVocId]],
    );
    for (const vocId of [memberVocId, secondMemberVocId]) {
      expect(
        audit.rows.filter((row) => row.subject_id === vocId).map((row) => row.event_type),
      ).toEqual(['public_update_created', 'reporter_facing_status_changed']);
    }
  });
});
