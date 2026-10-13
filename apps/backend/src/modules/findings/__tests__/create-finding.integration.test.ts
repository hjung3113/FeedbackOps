// POST /vocs/:id/create-finding + GET /findings integration tests.
//
// Gate: DATABASE_URL + DATABASE_URL_MIGRATE + WORKSPACE_ID. The migrate role is
// required for cleanup of append-only core.entity_links and core.audit_log rows.

import { randomUUID } from 'node:crypto';

import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { loadConfig } from '../../../config.js';
import { type DbHandle, createDb } from '../../../db/client.js';
import { buildServer } from '../../../server.js';
import { insertActorRow, insertDevActor } from '../../../test-support/actor-fixtures.js';
import { SESSION_COOKIE_NAME, loginAs } from '../../../test-support/auth.js';
import { createAa, insertMsDirectly } from '../../../test-support/core-fixtures.js';
import { uid } from '../../../test-support/ids.js';
import {
  denyCapability,
  expireCapabilityGrant,
  grantCapability,
  revokeCapabilityGrant,
  revokeDeny,
} from '../../../test-support/permissions-fixtures.js';
import { insertVocClusterRow } from '../../../test-support/voc-cluster-fixtures.js';
import { cleanupReadTestTables, insertVocDirectly } from '../../../test-support/voc-fixtures.js';

const APP_URL = process.env.DATABASE_URL ?? '';
const MIGRATE_URL = process.env.DATABASE_URL_MIGRATE ?? '';
const WORKSPACE_ID = process.env.WORKSPACE_ID ?? '';
const runIntegration = Boolean(APP_URL && MIGRATE_URL && WORKSPACE_ID);

const SLUG_PREFIX = 'it-findings';

describe.skipIf(!runIntegration)('POST /vocs/:id/create-finding (#122)', () => {
  let dbHandle: DbHandle;
  let migrateHandle: DbHandle;
  let app: FastifyInstance;
  let adminCookie: string;
  let reporterCookie: string;
  let adminActorId: string;
  let reporterActorId: string;
  const teamIds: string[] = [];
  const foreignWorkspaceIds: string[] = [];

  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    dbHandle = createDb(APP_URL);
    migrateHandle = createDb(MIGRATE_URL);
    app = await buildServer({ config: loadConfig(), dbHandle });
    await app.ready();

    adminCookie = await loginAs(app, 'mock-admin-1');
    reporterCookie = await loginAs(app, 'mock-user-1');

    const actors = await dbHandle.pool.query<{ id: string; external_id: string }>(
      `select id, external_id
         from core.actors
        where workspace_id = $1
          and external_id in ('mock-admin-1', 'mock-user-1')`,
      [WORKSPACE_ID],
    );
    adminActorId = actors.rows.find((row) => row.external_id === 'mock-admin-1')?.id ?? '';
    reporterActorId = actors.rows.find((row) => row.external_id === 'mock-user-1')?.id ?? '';
    if (!adminActorId || !reporterActorId) throw new Error('seed actors not found');
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
    // Includes Admin denies, which the shared Developer-cohort cleanup cannot remove.
    await migrateHandle.pool.query(
      `delete from permission.permission_denies
        where workspace_id = $1
          and managed_system_id in (
            select id from core.managed_systems where workspace_id = $1 and slug like $2
          )`,
      [WORKSPACE_ID, `${SLUG_PREFIX}%`],
    );
    await migrateHandle.pool.query(
      `delete from core.entity_links
        where workspace_id = $1
          and relation_type in ('created_finding', 'requested_task')
          and managed_system_id in (
            select id from core.managed_systems where workspace_id = $1 and slug like $2
          )`,
      [WORKSPACE_ID, `${SLUG_PREFIX}%`],
    );
    await migrateHandle.pool.query(
      `delete from core.audit_log
        where workspace_id = $1
          and event_type in ('finding_created_from_voc', 'finding_created_from_voc_cluster', 'finding_owner_assigned', 'entity_link.created')`,
      [WORKSPACE_ID],
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
      `delete from core.responsibility_default_failures
      where workspace_id=$1 and managed_system_id in
        (select id from core.managed_systems where workspace_id=$1 and slug like $2)`,
      [WORKSPACE_ID, `${SLUG_PREFIX}%`],
    );
    await migrateHandle.pool.query(
      `delete from voc_cluster.voc_clusters where workspace_id=$1
      and primary_managed_system_id in (select id from core.managed_systems where workspace_id=$1 and slug like $2)`,
      [WORKSPACE_ID, `${SLUG_PREFIX}%`],
    );
    await cleanupReadTestTables(dbHandle, WORKSPACE_ID, SLUG_PREFIX);
    await migrateHandle.pool.query('delete from core.teams where id=any($1::uuid[])', [teamIds]);
    teamIds.length = 0;
    for (const id of foreignWorkspaceIds) {
      await migrateHandle.pool.query('delete from core.actors where workspace_id=$1', [id]);
      await migrateHandle.pool.query('delete from core.workspaces where id=$1', [id]);
    }
    foreignWorkspaceIds.length = 0;
  }

  async function seedSource(): Promise<{ msId: string; vocId: string }> {
    const msId = await insertMsDirectly(
      dbHandle,
      WORKSPACE_ID,
      uid(SLUG_PREFIX),
      'Findings Source MS',
    );
    const voc = await insertVocDirectly(
      dbHandle,
      WORKSPACE_ID,
      msId,
      reporterActorId,
      'VOC with synthesis need',
    );
    return { msId, vocId: voc.id };
  }

  async function createFinding(
    cookie: string,
    vocId: string,
    body: Record<string, unknown>,
    idempotencyKey = randomUUID(),
  ) {
    return app.inject({
      method: 'POST',
      url: `/vocs/${vocId}/create-finding`,
      headers: {
        cookie: `${SESSION_COOKIE_NAME}=${cookie}`,
        'content-type': 'application/json',
        'idempotency-key': idempotencyKey,
      },
      payload: body,
    });
  }

  it.each(['voc', 'voc_cluster'] as const)(
    '%s HTTP creation distinguishes omitted, explicit Actor and explicit null',
    async (source) => {
      const { msId, vocId } = await seedSource();
      let sourceId = vocId;
      if (source === 'voc_cluster') {
        const seeded = await insertVocClusterRow(migrateHandle, {
          workspaceId: WORKSPACE_ID,
          primaryManagedSystemId: msId,
          title: 'Owner source cluster',
          createdBy: adminActorId,
        });
        sourceId = seeded.id;
      }
      await migrateHandle.pool.query(
        'update core.managed_systems set default_owner_actor_id=$1 where id=$2',
        [adminActorId, msId],
      );
      const team = await migrateHandle.pool.query<{ id: string }>(
        'insert into core.teams (workspace_id,name) values ($1,$2) returning id',
        [WORKSPACE_ID, uid('Owner source team')],
      );
      const teamId = team.rows[0]?.id ?? '';
      teamIds.push(teamId);
      for (const variant of ['omitted', 'actor', 'team', 'null'] as const) {
        const key = randomUUID();
        const body = {
          title: `Owner ${variant}`,
          summary: 'Synthesis',
          severity: 'high',
          ...(variant === 'omitted'
            ? {}
            : variant === 'team'
              ? { owner_team_id: teamId }
              : { owner_actor_id: variant === 'actor' ? adminActorId : null }),
        };
        const request = {
          method: 'POST' as const,
          url:
            source === 'voc'
              ? `/vocs/${sourceId}/create-finding`
              : `/voc-clusters/${sourceId}/create-finding`,
          headers: { cookie: `${SESSION_COOKIE_NAME}=${adminCookie}`, 'idempotency-key': key },
          payload: body,
        };
        const created = await app.inject(request);
        expect(created.statusCode).toBe(201);
        expect(created.json()).toMatchObject({
          owner_actor_id: variant === 'null' || variant === 'team' ? null : adminActorId,
          owner_team_id: variant === 'team' ? teamId : null,
          default_resolved: variant === 'omitted',
          source_rule: variant === 'omitted' ? 'managed_system_owner' : 'explicit',
        });
        expect((await app.inject(request)).json()).toEqual(created.json());
        const event =
          source === 'voc' ? 'finding_created_from_voc' : 'finding_created_from_voc_cluster';
        const audits = await migrateHandle.pool.query<{ detail: unknown }>(
          'select detail from core.audit_log where subject_id=$1 and event_type=$2',
          [created.json().id, event],
        );
        expect(audits.rows).toHaveLength(1);
        expect(audits.rows[0]?.detail).toMatchObject({
          owner_actor_id: variant === 'null' || variant === 'team' ? null : adminActorId,
          source_rule: variant === 'omitted' ? 'managed_system_owner' : 'explicit',
        });
      }
      const diagnostics = await migrateHandle.pool.query(
        'select id from core.responsibility_default_failures where managed_system_id=$1',
        [msId],
      );
      expect(diagnostics.rows).toHaveLength(0);
    },
  );

  it.each([
    'team',
    'aa',
    'missing',
    'developer',
    'wrong_scope',
    'revoked',
    'expired',
    'denied_admin',
    'foreign',
    'archived_team',
  ] as const)(
    'resolves %s using destination eligibility and appends only skipped-rule diagnostics',
    async (variant) => {
      const { msId, vocId } = await seedSource();
      let actorId: string | null = null;
      let teamId: string | null = null;
      let aaId: string | undefined;
      if (variant === 'team' || variant === 'aa' || variant === 'archived_team') {
        const team = await migrateHandle.pool.query<{ id: string }>(
          'insert into core.teams (workspace_id,name) values ($1,$2) returning id',
          [WORKSPACE_ID, uid('Owner team')],
        );
        teamId = team.rows[0]?.id ?? '';
        teamIds.push(teamId);
        if (variant === 'aa') {
          aaId = await createAa(app, adminCookie, {
            managed_system_id: msId,
            slug: uid('owner-aa'),
            name: 'Owner AA',
          });
          await migrateHandle.pool.query(
            'update core.analytics_areas set owner_team_id=$1 where id=$2',
            [teamId, aaId],
          );
        }
        if (variant === 'archived_team')
          await migrateHandle.pool.query(
            'update core.teams set archived_at=now(),archived_by_actor_id=$1 where id=$2',
            [adminActorId, teamId],
          );
      } else if (
        variant === 'developer' ||
        variant === 'wrong_scope' ||
        variant === 'revoked' ||
        variant === 'expired'
      ) {
        const dev = await insertDevActor(migrateHandle, WORKSPACE_ID, uid('mock-dev-read-owner'));
        actorId = dev.id;
        const grantMsId =
          variant === 'wrong_scope'
            ? await insertMsDirectly(migrateHandle, WORKSPACE_ID, uid(SLUG_PREFIX), 'Other scope')
            : msId;
        const grant = await grantCapability(
          migrateHandle,
          WORKSPACE_ID,
          actorId,
          'finding.manage',
          grantMsId,
          adminActorId,
        );
        if (variant === 'revoked') await revokeCapabilityGrant(migrateHandle, grant, adminActorId);
        else if (variant === 'expired') await expireCapabilityGrant(migrateHandle, grant);
      } else if (variant === 'denied_admin') {
        actorId = adminActorId;
        await denyCapability(
          migrateHandle,
          WORKSPACE_ID,
          actorId,
          'finding.manage',
          msId,
          adminActorId,
        );
      }
      if (variant === 'foreign') {
        const workspaceId = randomUUID();
        foreignWorkspaceIds.push(workspaceId);
        await migrateHandle.pool.query('insert into core.workspaces (id,name) values ($1,$2)', [
          workspaceId,
          'Foreign owner',
        ]);
        const foreign = await insertActorRow(migrateHandle, {
          workspaceId,
          externalId: uid('foreign'),
          displayName: 'Foreign',
          roleLevel: 'admin',
        });
        actorId = foreign.id;
      }
      if (variant !== 'aa' && variant !== 'foreign')
        await migrateHandle.pool.query(
          'update core.managed_systems set default_owner_actor_id=$1,default_owner_team_id=$2 where id=$3',
          [actorId, teamId, msId],
        );
      const body = {
        title: 'Resolved',
        summary: 'Synthesis',
        severity: 'high',
        ...(aaId ? { analytics_area_id: aaId } : {}),
        ...(variant === 'foreign' ? { owner_actor_id: actorId } : {}),
      };
      const key = randomUUID();
      const created = await createFinding(adminCookie, vocId, body, key);
      if (variant === 'foreign') {
        expect(created.statusCode).toBe(422);
        const rows = await migrateHandle.pool.query(
          'select id from finding.findings where primary_managed_system_id=$1',
          [msId],
        );
        expect(rows.rows).toHaveLength(0);
      } else {
        const resolved =
          variant === 'team' ||
          variant === 'aa' ||
          variant === 'developer' ||
          variant === 'denied_admin';
        expect(created.statusCode).toBe(201);
        expect((await createFinding(adminCookie, vocId, body, key)).json()).toEqual(created.json());
        expect(created.json()).toMatchObject({
          owner_actor_id:
            variant === 'denied_admin' ? adminActorId : variant === 'developer' ? actorId : null,
          owner_team_id: variant === 'team' || variant === 'aa' ? teamId : null,
          default_resolved: resolved,
          source_rule:
            variant === 'aa'
              ? 'analytics_area_owner'
              : resolved
                ? 'managed_system_owner'
                : 'workspace_fallback_queue',
        });
      }
      const diagnostics = await migrateHandle.pool.query<{ rule: string; category: string }>(
        'select rule,category from core.responsibility_default_failures where managed_system_id=$1 order by rule',
        [msId],
      );
      expect(diagnostics.rows).toHaveLength(
        variant === 'foreign' ||
          variant === 'team' ||
          variant === 'developer' ||
          variant === 'denied_admin'
          ? 0
          : variant === 'aa'
            ? 1
            : 2,
      );
      if (variant === 'revoked' || variant === 'expired')
        expect(diagnostics.rows).toContainEqual({
          rule: 'managed_system_owner',
          category: 'ineligible_actor',
        });
    },
  );

  it('persists the target owner on omitted input, detail and list, and replays its audit once', async () => {
    const { msId, vocId } = await seedSource();
    await dbHandle.pool.query(
      'update core.managed_systems set default_owner_actor_id=$1 where id=$2',
      [adminActorId, msId],
    );
    const input = { title: 'Owned Finding', summary: 'Synthesis', severity: 'high' };
    const key = randomUUID();
    const created = await createFinding(adminCookie, vocId, input, key);
    expect(created.statusCode).toBe(201);
    expect(created.json()).toMatchObject({
      owner_actor_id: adminActorId,
      owner_team_id: null,
      default_resolved: true,
      source_rule: 'managed_system_owner',
      status: 'draft',
    });
    expect((await createFinding(adminCookie, vocId, input, key)).json()).toEqual(created.json());
    const detail = await app.inject({
      method: 'GET',
      url: `/findings/${created.json().id}`,
      headers: { cookie: `${SESSION_COOKIE_NAME}=${adminCookie}` },
    });
    expect(detail.json()).toMatchObject({ owner_actor_id: adminActorId, owner_team_id: null });
    const audits = await migrateHandle.pool.query<{ detail: Record<string, unknown> }>(
      `select detail from core.audit_log where subject_id=$1 and event_type='finding_created_from_voc'`,
      [created.json().id],
    );
    expect(audits.rows).toHaveLength(1);
    expect(audits.rows[0]?.detail).toMatchObject({
      owner_actor_id: adminActorId,
      default_resolved: true,
    });
  });

  it('edits responsibility without changing status and filters the persisted assignment', async () => {
    const { vocId } = await seedSource();
    const created = await createFinding(adminCookie, vocId, {
      title: 'Assignable',
      summary: 'Synthesis',
      severity: 'high',
      owner_actor_id: null,
    });
    expect(created.statusCode).toBe(201);
    const id = created.json().id;
    const ownerEditKey = randomUUID();
    const patched = await app.inject({
      method: 'PATCH',
      url: `/findings/${id}`,
      headers: { cookie: `${SESSION_COOKIE_NAME}=${adminCookie}`, 'idempotency-key': ownerEditKey },
      payload: { owner_actor_id: adminActorId, owner_team_id: null },
    });
    expect(patched.statusCode).toBe(200);
    expect(patched.json()).toMatchObject({ owner_actor_id: adminActorId, status: 'draft' });
    const replay = await app.inject({
      method: 'PATCH',
      url: `/findings/${id}`,
      headers: { cookie: `${SESSION_COOKIE_NAME}=${adminCookie}`, 'idempotency-key': ownerEditKey },
      payload: { owner_actor_id: adminActorId, owner_team_id: null },
    });
    expect(replay.json()).toEqual(patched.json());
    const list = await app.inject({
      method: 'GET',
      url: `/findings?owner_actor_id=${adminActorId}`,
      headers: { cookie: `${SESSION_COOKIE_NAME}=${adminCookie}` },
    });
    expect(list.statusCode).toBe(200);
    expect(list.json().items.map((row: { id: string }) => row.id)).toContain(id);
    const audit = await migrateHandle.pool.query<{ detail: Record<string, unknown> }>(
      `select detail from core.audit_log where subject_id=$1 and event_type='finding_owner_assigned'`,
      [id],
    );
    expect(audit.rows).toHaveLength(1);
    expect(audit.rows[0]?.detail).toMatchObject({
      from: { actor_id: null, team_id: null },
      to: { actor_id: adminActorId, team_id: null },
    });
  });

  it('rejects an explicit Actor/team pair without creating responsibility, links, audit or diagnostics', async () => {
    const { msId, vocId } = await seedSource();
    const created = await createFinding(adminCookie, vocId, {
      title: 'Invalid pair',
      summary: 'Synthesis',
      severity: 'high',
      owner_actor_id: adminActorId,
      owner_team_id: randomUUID(),
    });
    expect(created.statusCode).toBe(422);
    expect(created.json()).toMatchObject({
      code: 'validation.failed',
      detail: { fields: [{ path: ['owner_team_id'], code: 'invalid_pair' }] },
    });
    expect(
      (
        await migrateHandle.pool.query(
          'select id from finding.findings where primary_managed_system_id=$1',
          [msId],
        )
      ).rows,
    ).toHaveLength(0);
    expect(
      (
        await migrateHandle.pool.query(
          'select id from core.entity_links where managed_system_id=$1',
          [msId],
        )
      ).rows,
    ).toHaveLength(0);
    expect(
      (
        await migrateHandle.pool.query(
          `select id from core.audit_log where event_type='finding_created_from_voc' and detail->>'source_voc_id'=$1`,
          [vocId],
        )
      ).rows,
    ).toHaveLength(0);
    expect(
      (
        await migrateHandle.pool.query(
          'select id from core.responsibility_default_failures where managed_system_id=$1',
          [msId],
        )
      ).rows,
    ).toHaveLength(0);
  });

  it('rolls back assignment and audit when a combined status change is invalid', async () => {
    const { vocId } = await seedSource();
    const created = await createFinding(adminCookie, vocId, {
      title: 'Atomic edit',
      summary: 'Synthesis',
      severity: 'high',
      owner_actor_id: null,
    });
    expect(created.statusCode).toBe(201);
    const id = created.json().id;
    const patched = await app.inject({
      method: 'PATCH',
      url: `/findings/${id}`,
      headers: { cookie: `${SESSION_COOKIE_NAME}=${adminCookie}`, 'idempotency-key': randomUUID() },
      payload: { owner_actor_id: adminActorId, status: 'converted' },
    });
    expect(patched.statusCode).toBe(422);
    const detail = await app.inject({
      method: 'GET',
      url: `/findings/${id}`,
      headers: { cookie: `${SESSION_COOKIE_NAME}=${adminCookie}` },
    });
    expect(detail.json()).toMatchObject({
      owner_actor_id: null,
      owner_team_id: null,
      status: 'draft',
    });
    expect(
      (
        await migrateHandle.pool.query(
          `select id from core.audit_log where subject_id=$1 and event_type='finding_owner_assigned'`,
          [id],
        )
      ).rows,
    ).toHaveLength(0);
  });

  it('creates a finding, created_finding link, and both audit rows atomically', async () => {
    const { msId, vocId } = await seedSource();

    const res = await createFinding(adminCookie, vocId, {
      title: 'Billing exports need synthesis',
      summary: 'Several customer reports describe confusing export failures.',
      severity: 'high',
      confidence: 'medium',
    });

    expect(res.statusCode).toBe(201);
    const body = res.json<{ id: string; source_type: string; source_id: string }>();
    expect(body).toMatchObject({
      title: 'Billing exports need synthesis',
      primary_managed_system_id: msId,
      source_type: 'voc',
      source_id: vocId,
      evidence_count: 0,
      severity: 'high',
      confidence: 'medium',
      status: 'draft',
    });

    const persisted = await dbHandle.pool.query<{ n: number }>(
      `select count(*)::int as n
         from finding.findings
        where id = $1
          and source_type = 'voc'
          and source_id = $2
          and evidence_count = 0`,
      [body.id, vocId],
    );
    expect(persisted.rows[0]?.n).toBe(1);

    const links = await migrateHandle.pool.query<{ id: string }>(
      `select id
         from core.entity_links
        where workspace_id = $1
          and source_type = 'voc'
          and source_id = $2
          and target_type = 'finding'
          and target_id = $3
          and relation_type = 'created_finding'
          and visibility = 'internal_only'
          and status = 'active'`,
      [WORKSPACE_ID, vocId, body.id],
    );
    expect(links.rowCount).toBe(1);

    const audits = await migrateHandle.pool.query<{ event_type: string }>(
      `select event_type
         from core.audit_log
        where workspace_id = $1
          and event_type in ('finding_created_from_voc', 'finding_created_from_voc_cluster', 'finding_owner_assigned', 'entity_link.created')
          and (subject_id = $2 or subject_id = $3)
        order by event_type`,
      [WORKSPACE_ID, body.id, links.rows[0]?.id],
    );
    expect(audits.rows.map((row) => row.event_type)).toEqual([
      'entity_link.created',
      'finding_created_from_voc',
    ]);
  });

  it('reloads finding detail with immutable source columns and source VOC link', async () => {
    const { vocId } = await seedSource();
    const created = await createFinding(adminCookie, vocId, {
      title: 'Reloadable finding',
      summary: 'Detail must include source provenance after reload.',
      severity: 'medium',
    });
    expect(created.statusCode).toBe(201);
    const findingId = created.json<{ id: string }>().id;

    const detail = await app.inject({
      method: 'GET',
      url: `/findings/${findingId}`,
      headers: { cookie: `${SESSION_COOKIE_NAME}=${adminCookie}` },
    });

    expect(detail.statusCode).toBe(200);
    expect(detail.json()).toMatchObject({
      id: findingId,
      source_type: 'voc',
      source_id: vocId,
      source: { type: 'voc', id: vocId, relation_type: 'created_finding' },
    });
  });

  it('denies Reporter and out-of-scope Developer, and hides unreadable source VOCs', async () => {
    const { msId, vocId } = await seedSource();

    const reporter = await createFinding(reporterCookie, vocId, {
      title: 'Reporter denied',
      summary: 'Reporter cannot create findings.',
      severity: 'low',
    });
    expect(reporter.statusCode).toBe(403);
    expect(reporter.json<{ code: string }>().code).toBe('permission.denied');

    const otherMs = await insertMsDirectly(dbHandle, WORKSPACE_ID, uid(SLUG_PREFIX), 'Other MS');
    const { id: devId, externalId } = await insertDevActor(dbHandle, WORKSPACE_ID, uid('cf'));
    await grantCapability(dbHandle, WORKSPACE_ID, devId, 'voc.read', msId, adminActorId);
    await grantCapability(dbHandle, WORKSPACE_ID, devId, 'finding.manage', otherMs, adminActorId);
    const devCookie = await loginAs(app, externalId);

    const outOfScope = await createFinding(devCookie, vocId, {
      title: 'Out of scope',
      summary: 'Developer lacks finding.manage on target MS.',
      severity: 'medium',
    });
    expect(outOfScope.statusCode).toBe(403);
    expect(outOfScope.json<{ code: string }>().code).toBe('permission.denied');

    const { id: blindDevId, externalId: blindExternalId } = await insertDevActor(
      dbHandle,
      WORKSPACE_ID,
      uid('blind'),
    );
    await grantCapability(dbHandle, WORKSPACE_ID, blindDevId, 'finding.manage', msId, adminActorId);
    const blindCookie = await loginAs(app, blindExternalId);

    const unreadableSource = await createFinding(blindCookie, vocId, {
      title: 'Unreadable source',
      summary: 'Developer lacks voc.read on source.',
      severity: 'medium',
    });
    expect(unreadableSource.statusCode).toBe(404);
    expect(unreadableSource.json<{ code: string }>().code).toBe('not_found.record');
  });

  it('rejects analytics areas outside the target managed system', async () => {
    const { msId, vocId } = await seedSource();
    const otherMs = await insertMsDirectly(dbHandle, WORKSPACE_ID, uid(SLUG_PREFIX), 'AA Other MS');
    const aaId = await createAa(app, adminCookie, {
      managed_system_id: otherMs,
      slug: uid(SLUG_PREFIX),
      name: 'Wrong AA',
    });

    const res = await createFinding(adminCookie, vocId, {
      title: 'Wrong AA finding',
      summary: 'AA belongs to a different MS.',
      severity: 'critical',
      primary_managed_system_id: msId,
      analytics_area_id: aaId,
    });

    expect(res.statusCode).toBe(422);
    expect(res.json<{ code: string }>().code).toBe('validation.failed');
  });

  it('replays an idempotent create request with the same finding id', async () => {
    const { vocId } = await seedSource();
    const key = randomUUID();
    const payload = {
      title: 'Idempotent finding',
      summary: 'Retry returns the cached create response.',
      severity: 'high',
    };

    const first = await createFinding(adminCookie, vocId, payload, key);
    const second = await createFinding(adminCookie, vocId, payload, key);

    expect(first.statusCode).toBe(201);
    expect(second.statusCode).toBe(201);
    expect(second.json<{ id: string }>().id).toBe(first.json<{ id: string }>().id);
  });

  it('lists only findings in the Developer finding.read scope', async () => {
    const sourceA = await seedSource();
    const sourceB = await seedSource();
    const createdA = await createFinding(adminCookie, sourceA.vocId, {
      title: 'Visible finding',
      summary: 'Developer can read this MS.',
      severity: 'low',
    });
    const createdB = await createFinding(adminCookie, sourceB.vocId, {
      title: 'Hidden finding',
      summary: 'Developer cannot read this MS.',
      severity: 'low',
    });
    expect(createdA.statusCode).toBe(201);
    expect(createdB.statusCode).toBe(201);

    const { id: devId, externalId } = await insertDevActor(dbHandle, WORKSPACE_ID, uid('list'));
    await grantCapability(
      dbHandle,
      WORKSPACE_ID,
      devId,
      'finding.read',
      sourceA.msId,
      adminActorId,
    );
    const devCookie = await loginAs(app, externalId);

    const list = await app.inject({
      method: 'GET',
      url: '/findings',
      headers: { cookie: `${SESSION_COOKIE_NAME}=${devCookie}` },
    });

    expect(list.statusCode).toBe(200);
    expect(Object.keys(list.json())).toEqual(['items']);
    const ids = list.json<{ items: Array<{ id: string }> }>().items.map((item) => item.id);
    expect(ids).toContain(createdA.json<{ id: string }>().id);
    expect(ids).not.toContain(createdB.json<{ id: string }>().id);
  });

  it('filters findings without execution when execution=none and leaves the unfiltered list unchanged', async () => {
    const { msId } = await seedSource();
    const gap = await createFindingOn(msId, 'Gap finding');
    const linked = await createFindingOn(msId, 'Linked task finding');
    const requested = await createFindingOn(msId, 'Requested task finding');
    const draft = await createFindingOn(msId, 'Draft finding');

    await dbHandle.pool.query(
      `update finding.findings set status = 'active' where id = any($1::uuid[])`,
      [[gap, linked, requested]],
    );
    await dbHandle.pool.query('update finding.findings set linked_task_id = $1 where id = $2', [
      randomUUID(),
      linked,
    ]);
    await migrateHandle.pool.query(
      `insert into core.entity_links (
          workspace_id, source_type, source_id, target_type, target_id,
          relation_type, managed_system_id, created_by
        )
       values ($1, 'finding', $2, 'task_request', $3, 'requested_task', $4, $5)`,
      [WORKSPACE_ID, requested, randomUUID(), msId, adminActorId],
    );

    const filtered = await app.inject({
      method: 'GET',
      url: `/findings?execution=none&managed_system_id=${msId}`,
      headers: { cookie: `${SESSION_COOKIE_NAME}=${adminCookie}` },
    });
    expect(filtered.statusCode).toBe(200);
    const filteredIds = filtered
      .json<{ items: Array<{ id: string }> }>()
      .items.map((item) => item.id);
    expect(filteredIds).toContain(gap);
    expect(filteredIds).not.toContain(linked);
    expect(filteredIds).not.toContain(requested);
    expect(filteredIds).not.toContain(draft);

    const unfiltered = await app.inject({
      method: 'GET',
      url: `/findings?managed_system_id=${msId}`,
      headers: { cookie: `${SESSION_COOKIE_NAME}=${adminCookie}` },
    });
    expect(unfiltered.statusCode).toBe(200);
    const unfilteredIds = unfiltered
      .json<{ items: Array<{ id: string }> }>()
      .items.map((item) => item.id);
    expect(unfilteredIds).toEqual(expect.arrayContaining([gap, linked, requested, draft]));
  });

  async function createFindingOn(msId: string, title: string): Promise<string> {
    const voc = await insertVocDirectly(
      dbHandle,
      WORKSPACE_ID,
      msId,
      reporterActorId,
      `${title} source`,
    );
    const created = await createFinding(adminCookie, voc.id, {
      title,
      summary: 'Execution filter fixture.',
      severity: 'medium',
    });
    expect(created.statusCode).toBe(201);
    return created.json<{ id: string }>().id;
  }
  it('AC-981: visibility precedes limit, cursor walks exact order, and explicit deny applies in both modes', async () => {
    const { msId: msAId } = await seedSource();
    const { msId: msBId } = await seedSource();
    for (let i = 0; i < 4; i += 1) {
      await createFindingOn(msAId, `Page A ${i}`);
    }
    await createFindingOn(msBId, 'Newest B');
    await migrateHandle.pool.query(
      "update finding.findings set created_at = '2026-01-01 00:00:00.123456+00' where workspace_id = $1 and primary_managed_system_id = $2",
      [WORKSPACE_ID, msAId],
    );
    const developer = await insertDevActor(dbHandle, WORKSPACE_ID, uid('page-scope'));
    await grantCapability(
      dbHandle,
      WORKSPACE_ID,
      developer.id,
      'finding.read',
      msAId,
      adminActorId,
    );
    const cookie = await loginAs(app, developer.externalId);
    const headers = { cookie: `${SESSION_COOKIE_NAME}=${cookie}` };
    const full = await app.inject({ method: 'GET', url: '/findings', headers });
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
      const response = await app.inject({ method: 'GET', url: `/findings?${params}`, headers });
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
      'finding.read',
      msBId,
      adminActorId,
    );
    const denyId = await denyCapability(
      dbHandle,
      WORKSPACE_ID,
      developer.id,
      'finding.read',
      msBId,
      adminActorId,
    );
    try {
      for (const query of ['', '?limit=2']) {
        const denied = await app.inject({ method: 'GET', url: `/findings${query}`, headers });
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

  it.each(['limit=101', 'limit=2&cursor=bad'])(
    'AC-981 rejects invalid Finding page %s',
    async (query) => {
      const response = await app.inject({
        method: 'GET',
        url: `/findings?${query}`,
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
});
