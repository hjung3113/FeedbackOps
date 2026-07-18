// Released Task Public Update review candidate routes (#180).
//
// All route requests run through the low-privilege fops_app server handle.
// The migrate handle is used only to create/delete append-only link/audit rows
// that the product role is deliberately not permitted to mutate.

import { randomUUID } from 'node:crypto';

import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { loadConfig } from '../../../config.js';
import { type DbHandle, createDb } from '../../../db/client.js';
import { buildServer } from '../../../server.js';
import { createAuditService } from '../../core/audit/index.js';
import { insertTaskRow } from '../../tasks/__tests__/_seed-helpers.js';
import { createPublicUpdateReviewCandidatesService } from '../public-update-review-candidates/service.js';
import {
  SESSION_COOKIE_NAME,
  grantCapability,
  insertDevActor,
  insertMsDirectly,
  insertVocDirectly,
  loginAs,
  paragraphDoc,
  uid,
} from './_seed-helpers.js';

const APP_URL = process.env.DATABASE_URL ?? '';
const MIGRATE_URL = process.env.DATABASE_URL_MIGRATE ?? '';
const WORKSPACE_ID = process.env.WORKSPACE_ID ?? '';
const runIntegration = Boolean(APP_URL && MIGRATE_URL && WORKSPACE_ID);
const SLUG_PREFIX = 'it-review-candidate';

describe.skipIf(!runIntegration)('released Task review-candidate routes (#180)', () => {
  let dbHandle: DbHandle;
  let migrateHandle: DbHandle;
  let app: FastifyInstance;
  let adminCookie: string;
  let adminActorId: string;
  let reporterCookie: string;
  let reporterId: string;

  function headers(cookie: string) {
    return {
      cookie: `${SESSION_COOKIE_NAME}=${cookie}`,
      'content-type': 'application/json',
      'workspace-id': WORKSPACE_ID,
    };
  }

  function list(cookie: string, vocId: string) {
    return app.inject({
      method: 'GET',
      url: `/vocs/${vocId}/public-update-candidates`,
      headers: headers(cookie),
    });
  }

  function resolve(cookie: string, vocId: string, payload: Record<string, unknown>) {
    return app.inject({
      method: 'POST',
      url: `/vocs/${vocId}/apply-public-update-candidate`,
      headers: headers(cookie),
      payload,
    });
  }

  async function cleanup(): Promise<void> {
    if (!migrateHandle) return;
    // Required dependency order: queue job → candidates → public updates → VOC → MS.
    await migrateHandle.pool.query(
      `delete from pgboss.job_common where name = 'tasks.create_public_update_review_candidates'`,
    );
    await migrateHandle.pool.query(
      'delete from voc.public_update_review_candidates where workspace_id = $1',
      [WORKSPACE_ID],
    );
    await migrateHandle.pool.query(
      `delete from voc.voc_public_updates where voc_id in (
         select id from voc.vocs where workspace_id = $1 and primary_managed_system_id in (
           select id from core.managed_systems where workspace_id = $1 and slug like $2
         )
       )`,
      [WORKSPACE_ID, `${SLUG_PREFIX}%`],
    );
    await migrateHandle.pool.query(
      `delete from core.entity_links where workspace_id = $1 and managed_system_id in (
         select id from core.managed_systems where workspace_id = $1 and slug like $2
       )`,
      [WORKSPACE_ID, `${SLUG_PREFIX}%`],
    );
    await migrateHandle.pool.query(
      `delete from task.tasks where workspace_id = $1 and primary_managed_system_id in (
         select id from core.managed_systems where workspace_id = $1 and slug like $2
       )`,
      [WORKSPACE_ID, `${SLUG_PREFIX}%`],
    );
    await migrateHandle.pool.query(
      `delete from core.audit_log where workspace_id = $1 and subject_id in (
         select id from voc.vocs where workspace_id = $1 and primary_managed_system_id in (
           select id from core.managed_systems where workspace_id = $1 and slug like $2
         )
       )`,
      [WORKSPACE_ID, `${SLUG_PREFIX}%`],
    );
    await migrateHandle.pool.query(
      `delete from voc.vocs where workspace_id = $1 and primary_managed_system_id in (
         select id from core.managed_systems where workspace_id = $1 and slug like $2
       )`,
      [WORKSPACE_ID, `${SLUG_PREFIX}%`],
    );
    await migrateHandle.pool.query(
      `delete from permission.permission_grants where workspace_id = $1 and actor_id in (
         select id from core.actors where workspace_id = $1 and external_id like 'mock-dev-read-%'
       )`,
      [WORKSPACE_ID],
    );
    await migrateHandle.pool.query(
      `delete from core.sessions where actor_id in (
         select id from core.actors where workspace_id = $1 and external_id like 'mock-dev-read-%'
       )`,
      [WORKSPACE_ID],
    );
    await migrateHandle.pool.query(
      `delete from core.actors where workspace_id = $1 and external_id like 'mock-dev-read-%'`,
      [WORKSPACE_ID],
    );
    await migrateHandle.pool.query(
      'delete from core.managed_systems where workspace_id = $1 and slug like $2',
      [WORKSPACE_ID, `${SLUG_PREFIX}%`],
    );
  }

  async function seedReleasedCandidate(
    opts: { reporterFacingStatus?: 'received' | 'reviewing' | 'progress' } = {},
  ) {
    const msId = await insertMsDirectly(
      dbHandle,
      WORKSPACE_ID,
      uid(SLUG_PREFIX),
      'Review candidate MS',
    );
    const voc = await insertVocDirectly(
      dbHandle,
      WORKSPACE_ID,
      msId,
      reporterId,
      'Released task candidate VOC',
    );
    if (opts.reporterFacingStatus && opts.reporterFacingStatus !== 'received') {
      await dbHandle.pool.query('update voc.vocs set reporter_facing_status = $1 where id = $2', [
        opts.reporterFacingStatus,
        voc.id,
      ]);
    }
    const task = await insertTaskRow(migrateHandle, {
      workspaceId: WORKSPACE_ID,
      primaryManagedSystemId: msId,
      status: 'released',
      createdBy: adminActorId,
    });
    const link = await migrateHandle.pool.query<{ id: string }>(
      `insert into core.entity_links (workspace_id, source_type, source_id, target_type, target_id,
        relation_type, visibility, status, managed_system_id, created_by)
       values ($1, 'voc', $2, 'task', $3, 'evidence_of', 'internal_only', 'active', $4, $5) returning id`,
      [WORKSPACE_ID, voc.id, task.id, msId, adminActorId],
    );
    const service = createPublicUpdateReviewCandidatesService({
      db: dbHandle.db,
      auditService: createAuditService(),
    });
    const linkId = link.rows[0]?.id;
    if (!linkId) throw new Error('seed entity link missing');
    await service.createForReleasedTask({
      workspace_id: WORKSPACE_ID,
      task_id: task.id,
      release_event_id: randomUUID(),
      correlation_id: randomUUID(),
      triggered_by_actor_id: adminActorId,
      linked_vocs: [{ voc_id: voc.id, entity_link_id: linkId }],
    });
    const candidate = await dbHandle.pool.query<{ id: string }>(
      `select id from voc.public_update_review_candidates where voc_id = $1 and status = 'pending'`,
      [voc.id],
    );
    const candidateId = candidate.rows[0]?.id;
    if (!candidateId) throw new Error('seed review candidate missing');
    return { msId, vocId: voc.id, candidateId };
  }

  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    dbHandle = createDb(APP_URL);
    migrateHandle = createDb(MIGRATE_URL);
    app = await buildServer({ config: loadConfig(), dbHandle });
    await app.ready();
    adminCookie = await loginAs(app, 'mock-admin-1');
    reporterCookie = await loginAs(app, 'mock-user-1');
    const actors = await dbHandle.pool.query<{ id: string; external_id: string }>(
      `select id, external_id from core.actors where workspace_id = $1 and external_id in ('mock-admin-1', 'mock-user-1')`,
      [WORKSPACE_ID],
    );
    const admin = actors.rows.find((actor) => actor.external_id === 'mock-admin-1');
    const reporter = actors.rows.find((actor) => actor.external_id === 'mock-user-1');
    if (!admin || !reporter) throw new Error('required mock actors missing');
    adminActorId = admin.id;
    reporterId = reporter.id;
  });

  beforeEach(cleanup);
  afterAll(async () => {
    await cleanup();
    await app?.close();
    await dbHandle?.close();
    await migrateHandle?.close();
  });

  it('Admin lists then applies a released-task candidate; candidate and public update are actioned end-to-end', async () => {
    const seeded = await seedReleasedCandidate({ reporterFacingStatus: 'progress' });
    const listed = await list(adminCookie, seeded.vocId);
    expect(listed.statusCode).toBe(200);
    expect(listed.json<{ items: Array<{ id: string }> }>().items).toEqual([
      expect.objectContaining({ id: seeded.candidateId }),
    ]);

    const applied = await resolve(adminCookie, seeded.vocId, {
      action: 'apply',
      candidate_id: seeded.candidateId,
      public_update: {
        skip_public_update: false,
        body_rich_content: paragraphDoc('Released task is now available.'),
        next_reporter_facing_status: 'resolved',
      },
    });
    expect(applied.statusCode).toBe(201);
    expect(applied.json<{ action: string }>().action).toBe('apply');

    const row = await dbHandle.pool.query<{
      status: string;
      actioned_public_update_id: string;
      reporter_facing_status_after: string;
    }>(
      `select candidate.status, candidate.actioned_public_update_id, update.reporter_facing_status_after
         from voc.public_update_review_candidates candidate
         join voc.voc_public_updates update on update.id = candidate.actioned_public_update_id
        where candidate.id = $1`,
      [seeded.candidateId],
    );
    expect(row.rows[0]).toEqual(
      expect.objectContaining({ status: 'actioned', reporter_facing_status_after: 'resolved' }),
    );
    expect(row.rows[0]?.actioned_public_update_id).toBeTruthy();
    const audit = await migrateHandle.pool.query<{ event_type: string }>(
      'select event_type from core.audit_log where subject_id = $1',
      [seeded.vocId],
    );
    expect(audit.rows.map((item) => item.event_type)).toEqual(
      expect.arrayContaining(['public_update_created', 'reporter_facing_status_changed']),
    );
  });

  it('in-scope Developer with voc.triage may list, dismiss, and apply; Reporter is denied list and apply', async () => {
    const seeded = await seedReleasedCandidate();
    const dev = await insertDevActor(dbHandle, WORKSPACE_ID, uid('review-dev'));
    const devCookie = await loginAs(app, dev.externalId);
    await grantCapability(dbHandle, WORKSPACE_ID, dev.id, 'voc.triage', seeded.msId, adminActorId);
    expect((await list(devCookie, seeded.vocId)).statusCode).toBe(200);
    const dismissed = await resolve(devCookie, seeded.vocId, {
      action: 'dismiss',
      candidate_id: seeded.candidateId,
      dismissal_reason: 'No reporter-safe release message is available yet.',
    });
    expect(dismissed.statusCode).toBe(201);
    const applySeed = await seedReleasedCandidate({ reporterFacingStatus: 'progress' });
    await grantCapability(
      dbHandle,
      WORKSPACE_ID,
      dev.id,
      'voc.triage',
      applySeed.msId,
      adminActorId,
    );
    const applied = await resolve(devCookie, applySeed.vocId, {
      action: 'apply',
      candidate_id: applySeed.candidateId,
      public_update: {
        skip_public_update: false,
        body_rich_content: paragraphDoc('Developer reviewed this released task.'),
        next_reporter_facing_status: 'resolved',
      },
    });
    expect(applied.statusCode).toBe(201);
    expect(applied.json<{ action: string }>().action).toBe('apply');
    const developerActioned = await dbHandle.pool.query<{
      status: string;
      resolved_by_actor_id: string;
    }>(
      'select status, resolved_by_actor_id from voc.public_update_review_candidates where id = $1',
      [applySeed.candidateId],
    );
    expect(developerActioned.rows[0]).toEqual({ status: 'actioned', resolved_by_actor_id: dev.id });
    expect((await list(reporterCookie, seeded.vocId)).statusCode).toBe(403);
    const reporterApply = await resolve(reporterCookie, seeded.vocId, {
      action: 'apply',
      candidate_id: seeded.candidateId,
      public_update: {
        skip_public_update: false,
        body_rich_content: paragraphDoc('forbidden'),
        next_reporter_facing_status: 'resolved',
      },
    });
    expect(reporterApply.statusCode).toBe(403);
    expect(reporterApply.json<{ code: string }>().code).toBe('permission.denied');
    const audit = await migrateHandle.pool.query<{ detail: { dismissal_reason?: string } }>(
      `select detail from core.audit_log where subject_id = $1 and event_type = 'public_update_review_candidate_dismissed'`,
      [seeded.vocId],
    );
    expect(audit.rows[0]?.detail.dismissal_reason).toContain('No reporter-safe');
  });

  it('hides out-of-scope Developer candidates and requires explicit reporter-facing status', async () => {
    const seeded = await seedReleasedCandidate();
    const dev = await insertDevActor(dbHandle, WORKSPACE_ID, uid('review-hidden'));
    const devCookie = await loginAs(app, dev.externalId);
    expect((await list(devCookie, seeded.vocId)).statusCode).toBe(404);
    const hiddenApply = await resolve(devCookie, seeded.vocId, {
      action: 'apply',
      candidate_id: seeded.candidateId,
      public_update: {
        skip_public_update: false,
        body_rich_content: paragraphDoc('Out-of-scope developers cannot apply this.'),
        next_reporter_facing_status: 'reviewing',
      },
    });
    expect(hiddenApply.statusCode).toBe(404);
    expect(hiddenApply.json<{ code: string }>().code).toBe('not_found.record');
    const noStatus = await resolve(adminCookie, seeded.vocId, {
      action: 'apply',
      candidate_id: seeded.candidateId,
      public_update: {
        skip_public_update: false,
        body_rich_content: paragraphDoc('No automatic mapping'),
      },
    });
    expect(noStatus.statusCode).toBe(422);
    expect(noStatus.json<{ code: string }>().code).toBe('validation.failed');
    const state = await dbHandle.pool.query<{ status: string; reporter_facing_status: string }>(
      'select candidate.status, voc.reporter_facing_status from voc.public_update_review_candidates candidate join voc.vocs voc on voc.id = candidate.voc_id where candidate.id = $1',
      [seeded.candidateId],
    );
    expect(state.rows[0]).toEqual({ status: 'pending', reporter_facing_status: 'received' });
  });

  it('terminal candidates reject apply replays, the terminal trigger blocks direct mutation, and concurrent apply fails cleanly', async () => {
    const dismissedTerminal = await seedReleasedCandidate();
    const dismiss = {
      action: 'dismiss',
      candidate_id: dismissedTerminal.candidateId,
      dismissal_reason: 'Reviewer chose not to notify.',
    };
    expect((await resolve(adminCookie, dismissedTerminal.vocId, dismiss)).statusCode).toBe(201);
    const dismissedApplyReplay = await resolve(adminCookie, dismissedTerminal.vocId, {
      action: 'apply',
      candidate_id: dismissedTerminal.candidateId,
      public_update: {
        skip_public_update: false,
        body_rich_content: paragraphDoc('Terminal candidates cannot be applied.'),
        next_reporter_facing_status: 'reviewing',
      },
    });
    expect(dismissedApplyReplay.statusCode).toBe(409);
    expect(dismissedApplyReplay.json<{ code: string }>().code).toBe('conflict.stale_write');

    const actionedTerminal = await seedReleasedCandidate();
    const actionedPayload = {
      action: 'apply',
      candidate_id: actionedTerminal.candidateId,
      public_update: {
        skip_public_update: false,
        body_rich_content: paragraphDoc('This candidate is actioned.'),
        next_reporter_facing_status: 'reviewing',
      },
    };
    expect((await resolve(adminCookie, actionedTerminal.vocId, actionedPayload)).statusCode).toBe(
      201,
    );
    const actionedApplyReplay = await resolve(adminCookie, actionedTerminal.vocId, actionedPayload);
    expect(actionedApplyReplay.statusCode).toBe(409);
    expect(actionedApplyReplay.json<{ code: string }>().code).toBe('conflict.stale_write');
    await expect(
      migrateHandle.pool.query(
        'update voc.public_update_review_candidates set updated_at = now() where id = $1',
        [actionedTerminal.candidateId],
      ),
    ).rejects.toThrow(/terminal state is immutable/);

    const concurrent = await seedReleasedCandidate();
    const payload = {
      action: 'apply',
      candidate_id: concurrent.candidateId,
      public_update: {
        skip_public_update: false,
        body_rich_content: paragraphDoc('Concurrent candidate review'),
        next_reporter_facing_status: 'reviewing',
      },
    };
    const [first, second] = await Promise.all([
      resolve(adminCookie, concurrent.vocId, payload),
      resolve(adminCookie, concurrent.vocId, payload),
    ]);
    expect([first.statusCode, second.statusCode].sort()).toEqual([201, 409]);
    const loser = first.statusCode === 409 ? first : second;
    expect(loser.json<{ code: string }>().code).toBe('conflict.stale_write');
  });
});
