// resolveVocReference mapping (#378) against the REAL getVocDetail access
// matrix — no mocks. Exercises the one VOC read-authority path end-to-end for
// every actor kind the access matrix distinguishes:
//
//   admin              → full envelope    → allowed
//   in-scope developer → full envelope    → allowed (voc.read on the MS)
//   triage-only dev    → summary envelope → summary_visible (no identifiers)
//   out-of-scope dev   → 404 anti-probe   → hidden
//   reporter user      → full (reporter arm) → allowed
//   non-reporter user  → 404 anti-probe   → hidden
//
// `permission.denied` is not raised by getVocDetail's matrix (reads end in
// full/summary/not_found.record); that mapping branch is covered in
// resolve-voc-reference.mapping.test.ts with a stubbed repo-read.
//
// Gate: DATABASE_URL + WORKSPACE_ID. The service is constructed directly —
// no HTTP session is needed (ReadActorContext is plain data).

import { randomUUID } from 'node:crypto';

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { type DbHandle, createDb } from '../../../db/client.js';
import { createAuditService } from '../../core/audit/audit-service.js';
import { createEntityLinksService } from '../../entity-links/index.js';
import { createCheckService } from '../../permissions/check-service.js';
import {
  type ReadActorContext,
  type VocReadService,
  createVocReadService,
} from '../read-service.js';
import {
  cleanupReadTestTables,
  grantCapability,
  insertDevActor,
  insertMsDirectly,
  insertVocDirectly,
  uid,
} from './_seed-helpers.js';

const APP_URL = process.env.DATABASE_URL ?? '';
const WORKSPACE_ID = process.env.WORKSPACE_ID ?? '';
const runIntegration = Boolean(APP_URL && WORKSPACE_ID);

const SLUG_PREFIX = 'it-vocref';
// insertDevActor prefixes 'mock-dev-read-'; user-role fixtures reuse the same
// cohort prefix so cleanupReadTestTables removes their grants/sessions too.
const USER_SUFFIX = 'vocrefuser';

describe.skipIf(!runIntegration)('resolveVocReference mapping (#378)', () => {
  let dbHandle: DbHandle;
  let adminActorId: string;
  let vocReadService: Pick<VocReadService, 'resolveVocReference'>;

  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    dbHandle = createDb(APP_URL);
    const checkService = createCheckService({ db: dbHandle.db });
    const entityLinksService = createEntityLinksService({
      db: dbHandle.db,
      checkService,
      auditService: createAuditService(),
    });
    vocReadService = createVocReadService({
      db: dbHandle.db,
      checkService,
      entityLinksService,
    });

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
    await cleanupReadTestTables(dbHandle, WORKSPACE_ID, SLUG_PREFIX);
  });

  afterAll(async () => {
    await cleanupReadTestTables(dbHandle, WORKSPACE_ID, SLUG_PREFIX);
    await dbHandle?.close();
  });

  /** user-role actor inside the cleanup cohort (see USER_SUFFIX). */
  async function insertUserActor(): Promise<{ id: string; externalId: string }> {
    const externalId = `mock-dev-read-${USER_SUFFIX}-${randomUUID().slice(0, 8)}`;
    const res = await dbHandle.pool.query<{ id: string }>(
      `insert into core.actors (workspace_id, external_id, email, display_name, role_level, actor_type)
         values ($1, $2, $3, $4, 'user', 'internal_member')
       returning id`,
      [WORKSPACE_ID, externalId, `${externalId}@local`, 'VocRef User'],
    );
    const id = res.rows[0]?.id ?? '';
    if (!id) throw new Error(`insertUserActor failed for ${externalId}`);
    return { id, externalId };
  }

  function actor(actorId: string, roleLevel: ReadActorContext['role_level']): ReadActorContext {
    return { actor_id: actorId, workspace_id: WORKSPACE_ID, role_level: roleLevel };
  }

  async function seedVoc(input: {
    msId: string;
    reporterId: string;
    title: string;
  }): Promise<{ id: string; displayId: string }> {
    const voc = await insertVocDirectly(
      dbHandle,
      WORKSPACE_ID,
      input.msId,
      input.reporterId,
      input.title,
    );
    const row = await dbHandle.pool.query<{ display_id: string }>(
      'select display_id from voc.vocs where id = $1',
      [voc.id],
    );
    const displayId = row.rows[0]?.display_id ?? '';
    if (!displayId) throw new Error(`seedVoc: display_id missing for ${voc.id}`);
    return { id: voc.id, displayId };
  }

  it('admin resolves to allowed with the VOC identifiers', async () => {
    const msId = await insertMsDirectly(
      dbHandle,
      WORKSPACE_ID,
      uid(SLUG_PREFIX),
      'VocRef Admin MS',
    );
    const title = `VocRef VOC ${uid('admin')}`;
    const voc = await seedVoc({ msId, reporterId: adminActorId, title });

    const resolution = await vocReadService.resolveVocReference({
      actor: actor(adminActorId, 'admin'),
      vocId: voc.id,
    });

    expect(resolution).toEqual({
      visibility_state: 'allowed',
      id: voc.id,
      display_id: voc.displayId,
      title,
    });
  });

  it('in-scope developer (voc.read on the MS) resolves to allowed', async () => {
    const msId = await insertMsDirectly(dbHandle, WORKSPACE_ID, uid(SLUG_PREFIX), 'VocRef Read MS');
    const dev = await insertDevActor(dbHandle, WORKSPACE_ID, uid(USER_SUFFIX));
    await grantCapability(dbHandle, WORKSPACE_ID, dev.id, 'voc.read', msId, adminActorId);
    const title = `VocRef VOC ${uid('read')}`;
    const voc = await seedVoc({ msId, reporterId: adminActorId, title });

    const resolution = await vocReadService.resolveVocReference({
      actor: actor(dev.id, 'developer'),
      vocId: voc.id,
    });

    expect(resolution).toEqual({
      visibility_state: 'allowed',
      id: voc.id,
      display_id: voc.displayId,
      title,
    });
  });

  it('triage-only developer resolves to summary_visible without identifiers', async () => {
    // Positive twin above: the same chain reaches `allowed` for a voc.read dev.
    const msId = await insertMsDirectly(
      dbHandle,
      WORKSPACE_ID,
      uid(SLUG_PREFIX),
      'VocRef Summary MS',
    );
    const dev = await insertDevActor(dbHandle, WORKSPACE_ID, uid(USER_SUFFIX));
    await grantCapability(dbHandle, WORKSPACE_ID, dev.id, 'voc.triage', msId, adminActorId);
    const voc = await seedVoc({
      msId,
      reporterId: adminActorId,
      title: `VocRef VOC ${uid('summary')}`,
    });

    const resolution = await vocReadService.resolveVocReference({
      actor: actor(dev.id, 'developer'),
      vocId: voc.id,
    });

    expect(resolution).toEqual({ visibility_state: 'summary_visible' });
    expect(JSON.stringify(resolution)).not.toContain(voc.id);
    expect(JSON.stringify(resolution)).not.toContain(voc.displayId);
  });

  it('out-of-scope developer resolves to hidden (existence not revealed)', async () => {
    const msId = await insertMsDirectly(
      dbHandle,
      WORKSPACE_ID,
      uid(SLUG_PREFIX),
      'VocRef Hidden MS',
    );
    const dev = await insertDevActor(dbHandle, WORKSPACE_ID, uid(USER_SUFFIX));
    const voc = await seedVoc({
      msId,
      reporterId: adminActorId,
      title: `VocRef VOC ${uid('hidden')}`,
    });

    const resolution = await vocReadService.resolveVocReference({
      actor: actor(dev.id, 'developer'),
      vocId: voc.id,
    });

    expect(resolution).toEqual({ visibility_state: 'hidden' });
  });

  it('reporter user resolves to allowed via the reporter arm', async () => {
    const msId = await insertMsDirectly(
      dbHandle,
      WORKSPACE_ID,
      uid(SLUG_PREFIX),
      'VocRef Reporter MS',
    );
    const reporter = await insertUserActor();
    const title = `VocRef VOC ${uid('reporter')}`;
    const voc = await seedVoc({ msId, reporterId: reporter.id, title });

    const resolution = await vocReadService.resolveVocReference({
      actor: actor(reporter.id, 'user'),
      vocId: voc.id,
    });

    expect(resolution).toEqual({
      visibility_state: 'allowed',
      id: voc.id,
      display_id: voc.displayId,
      title,
    });
  });

  it('non-reporter user without scope resolves to hidden', async () => {
    const msId = await insertMsDirectly(
      dbHandle,
      WORKSPACE_ID,
      uid(SLUG_PREFIX),
      'VocRef Stranger MS',
    );
    const outsider = await insertUserActor();
    const voc = await seedVoc({
      msId,
      reporterId: adminActorId,
      title: `VocRef VOC ${uid('stranger')}`,
    });

    const resolution = await vocReadService.resolveVocReference({
      actor: actor(outsider.id, 'user'),
      vocId: voc.id,
    });

    expect(resolution).toEqual({ visibility_state: 'hidden' });
  });
});
