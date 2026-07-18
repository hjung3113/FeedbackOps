import { randomUUID } from 'node:crypto';

import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { loadConfig } from '../../../config.js';
import { type DbHandle, createDb } from '../../../db/client.js';
import { SESSION_COOKIE_NAME } from '../../../middleware/require-session.js';
import { buildServer } from '../../../server.js';
import { loginAs } from '../../voc/__tests__/_seed-helpers.js';
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

describe.skipIf(!runIntegration)('VOC cluster similarity recommendations', () => {
  let app: FastifyInstance;
  let appDb: DbHandle;
  let ops: DbHandle;
  let adminId: string;
  let primaryMsId: string;
  let otherMsId: string;
  let clusterId: string;
  let otherClusterId: string;
  let partialActorId: string;
  let noVocReadActorId: string;
  let reporterActorId: string;
  let triageActorId: string;
  let partialCookie: string;
  let noVocReadCookie: string;
  let reporterCookie: string;
  let triageCookie: string;
  let adminCookie: string;
  let visibleCandidateId: string;
  let hiddenCandidateId: string;
  let reporterCandidateId: string;
  let existingMemberId: string;
  let crossMsVocId: string;
  let archivedVocId: string;
  const externalIds: string[] = [];

  const headers = (cookie: string) => ({
    cookie: `${SESSION_COOKIE_NAME}=${cookie}`,
    'workspace-id': WORKSPACE_ID,
  });

  async function addActor(roleLevel: 'developer' | 'user', label: string) {
    const externalId = `candidate-peer-${label}-${randomUUID()}`;
    externalIds.push(externalId);
    const actor = await insertActorRow(ops, {
      workspaceId: WORKSPACE_ID,
      externalId,
      roleLevel,
    });
    return { ...actor, externalId };
  }

  async function listCandidates(cookie: string, targetClusterId = clusterId) {
    return app.inject({
      method: 'GET',
      url: `/voc-clusters/${targetClusterId}/candidate-peers`,
      headers: headers(cookie),
    });
  }

  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    appDb = createDb(APP_URL);
    ops = createDb(MIGRATE_URL);
    app = await buildServer({ config: loadConfig(), dbHandle: appDb });
    await app.ready();

    const admin = await ops.pool.query<{ id: string }>(
      `select id from core.actors where workspace_id=$1 and external_id='mock-admin-1'`,
      [WORKSPACE_ID],
    );
    adminId = admin.rows[0]?.id ?? '';
    if (!adminId) throw new Error('admin seed missing');
    adminCookie = await loginAs(app, 'mock-admin-1');

    primaryMsId =
      (
        await ops.pool.query<{ id: string }>(
          'insert into core.managed_systems(workspace_id,slug,name) values($1,$2,$3) returning id',
          [WORKSPACE_ID, `candidate-primary-${randomUUID()}`, 'Candidate primary'],
        )
      ).rows[0]?.id ?? '';
    otherMsId =
      (
        await ops.pool.query<{ id: string }>(
          'insert into core.managed_systems(workspace_id,slug,name) values($1,$2,$3) returning id',
          [WORKSPACE_ID, `candidate-other-${randomUUID()}`, 'Candidate other'],
        )
      ).rows[0]?.id ?? '';

    const partial = await addActor('developer', 'partial');
    const noVocRead = await addActor('developer', 'finding-only');
    const reporter = await addActor('developer', 'reporter');
    const triage = await addActor('developer', 'triage-only');
    partialActorId = partial.id;
    noVocReadActorId = noVocRead.id;
    reporterActorId = reporter.id;
    triageActorId = triage.id;

    for (const actorId of [partial.id, noVocRead.id, reporter.id, triage.id]) {
      for (const managedSystemId of [primaryMsId, otherMsId]) {
        await grantCapability(ops, {
          workspaceId: WORKSPACE_ID,
          actorId,
          capability: 'finding.read',
          managedSystemId,
          grantedByActorId: adminId,
        });
      }
    }
    await grantCapability(ops, {
      workspaceId: WORKSPACE_ID,
      actorId: partial.id,
      capability: 'voc.read',
      managedSystemId: primaryMsId,
      grantedByActorId: adminId,
    });
    await grantCapability(ops, {
      workspaceId: WORKSPACE_ID,
      actorId: noVocRead.id,
      capability: 'finding.manage',
      managedSystemId: primaryMsId,
      grantedByActorId: adminId,
    });
    await grantCapability(ops, {
      workspaceId: WORKSPACE_ID,
      actorId: triage.id,
      capability: 'voc.triage',
      managedSystemId: primaryMsId,
      grantedByActorId: adminId,
    });

    clusterId = (
      await insertVocClusterRow(ops, {
        workspaceId: WORKSPACE_ID,
        primaryManagedSystemId: primaryMsId,
        createdBy: adminId,
        title: 'Candidate cluster',
      })
    ).id;
    otherClusterId = (
      await insertVocClusterRow(ops, {
        workspaceId: WORKSPACE_ID,
        primaryManagedSystemId: otherMsId,
        createdBy: adminId,
        title: 'Out-of-voc-read cluster',
      })
    ).id;

    visibleCandidateId = (
      await insertVocRow(ops, {
        workspaceId: WORKSPACE_ID,
        primaryManagedSystemId: primaryMsId,
        reporterId: adminId,
        title: 'Visible same-MS candidate',
      })
    ).id;
    hiddenCandidateId = (
      await insertVocRow(ops, {
        workspaceId: WORKSPACE_ID,
        primaryManagedSystemId: otherMsId,
        reporterId: adminId,
        title: 'Other-MS candidate',
      })
    ).id;
    reporterCandidateId = (
      await insertVocRow(ops, {
        workspaceId: WORKSPACE_ID,
        primaryManagedSystemId: primaryMsId,
        reporterId: reporter.id,
        title: 'Reporter-owned candidate',
      })
    ).id;
    existingMemberId = (
      await insertVocRow(ops, {
        workspaceId: WORKSPACE_ID,
        primaryManagedSystemId: primaryMsId,
        reporterId: adminId,
        title: 'Existing member',
      })
    ).id;
    crossMsVocId = hiddenCandidateId;
    archivedVocId = (
      await insertVocRow(ops, {
        workspaceId: WORKSPACE_ID,
        primaryManagedSystemId: primaryMsId,
        reporterId: adminId,
        title: 'Archived candidate',
      })
    ).id;
    await ops.pool.query('update voc.vocs set archived_at=now() where id=$1', [archivedVocId]);
    await insertVocClusterMemberRow(ops, {
      clusterId,
      vocId: existingMemberId,
      addedBy: adminId,
    });

    partialCookie = await loginAs(app, partial.externalId);
    noVocReadCookie = await loginAs(app, noVocRead.externalId);
    reporterCookie = await loginAs(app, reporter.externalId);
    triageCookie = await loginAs(app, triage.externalId);
  });

  afterAll(async () => {
    if (ops) {
      await ops.pool.query(
        'delete from voc_cluster.voc_cluster_members where cluster_id=any($1::uuid[])',
        [[clusterId, otherClusterId]],
      );
      await ops.pool.query('delete from voc_cluster.voc_clusters where id=any($1::uuid[])', [
        [clusterId, otherClusterId],
      ]);
      await ops.pool.query('delete from voc.vocs where id=any($1::uuid[])', [
        [
          visibleCandidateId,
          hiddenCandidateId,
          reporterCandidateId,
          existingMemberId,
          crossMsVocId,
          archivedVocId,
        ],
      ]);
      await ops.pool.query(
        'delete from permission.permission_grants where actor_id=any($1::uuid[])',
        [[partialActorId, noVocReadActorId, reporterActorId, triageActorId]],
      );
      await ops.pool.query('delete from core.managed_systems where id=any($1::uuid[])', [
        [primaryMsId, otherMsId],
      ]);
      await ops.pool.query('delete from core.sessions where actor_id=any($1::uuid[])', [
        [partialActorId, noVocReadActorId, reporterActorId, triageActorId],
      ]);
      await ops.pool.query('delete from core.actors where id=any($1::uuid[])', [
        [partialActorId, noVocReadActorId, reporterActorId, triageActorId],
      ]);
    }
    await app?.close();
    await appDb?.close();
    await ops?.close();
  });

  it('returns authorized same-MS active non-members without similarity claims', async () => {
    const response = await listCandidates(adminCookie);
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      candidate_basis: 'same_managed_system_active_voc',
      candidates: expect.arrayContaining([
        expect.objectContaining({ voc_id: visibleCandidateId }),
        expect.objectContaining({ voc_id: reporterCandidateId }),
      ]),
    });
    const candidateIds = response
      .json()
      .candidates.map((candidate: { voc_id: string }) => candidate.voc_id)
      .sort();
    expect(candidateIds).toEqual([visibleCandidateId, reporterCandidateId].sort());
    expect(candidateIds).not.toEqual(
      expect.arrayContaining([existingMemberId, crossMsVocId, archivedVocId]),
    );
    expect(response.body).not.toMatch(/score|confidence|rationale/);
  });

  it('uses the actor partial voc.read scope rather than effective cluster scope', async () => {
    const [inScope, outOfScope] = await Promise.all([
      listCandidates(partialCookie),
      listCandidates(partialCookie, otherClusterId),
    ]);
    expect(inScope.statusCode).toBe(200);
    expect(
      inScope
        .json()
        .candidates.map((candidate: { voc_id: string }) => candidate.voc_id)
        .sort(),
    ).toEqual([visibleCandidateId, reporterCandidateId].sort());
    expect(outOfScope.statusCode).toBe(200);
    expect(outOfScope.json()).toEqual({
      candidate_basis: 'same_managed_system_active_voc',
      candidates: [],
    });
  });

  it('lets a reporter see only their own candidate without voc.read', async () => {
    const response = await listCandidates(reporterCookie);
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      candidate_basis: 'same_managed_system_active_voc',
      candidates: [expect.objectContaining({ voc_id: reporterCandidateId })],
    });
    expect(response.body).not.toContain(visibleCandidateId);
  });

  it('returns an empty list to finding.read actors without voc.read or ownership', async () => {
    const response = await listCandidates(noVocReadCookie);
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      candidate_basis: 'same_managed_system_active_voc',
      candidates: [],
    });
    expect(response.body).not.toContain(visibleCandidateId);
    expect(response.body).not.toContain(reporterCandidateId);
  });

  it('does not promote triage-only effective scope into candidate read authority', async () => {
    const response = await listCandidates(triageCookie);
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      candidate_basis: 'same_managed_system_active_voc',
      candidates: [],
    });
    expect(response.body).not.toContain(visibleCandidateId);
  });
});
