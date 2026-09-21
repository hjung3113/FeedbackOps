// VOC application command integration tests — issue #392.
//
// The six VOC mutation commands (createVocCommand, updateVocCommand,
// editVocDescriptionCommand, postPublicUpdateCommand, postReporterReplyCommand,
// postInternalCommentCommand) own the transaction + idempotency frame the HTTP
// routes used to own. These tests call the COMMANDS directly — no HTTP, so the
// mutation rate limit does not apply — with real services wired exactly like
// buildServer wires them.
//
// Harness mirrors findings/__tests__/create-finding-display-id.integration.test.ts:
// a dedicated workspace is created and torn down FK-safely, so the suite is
// hermetic against concurrent VOC HTTP suites sharing the database.
//
// Gate: DATABASE_URL + DATABASE_URL_MIGRATE (migrate pool owns audit_log
// cleanup; fops_app cannot DELETE from core.audit_log).

import { randomUUID } from 'node:crypto';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { type DbHandle, createDb } from '../../../db/client.js';
import { createAuditService } from '../../core/audit/audit-service.js';
import { hashRequestBody } from '../../core/idempotency/canonicalize.js';
import { createIdempotencyService } from '../../core/idempotency/idempotency-service.js';
import { createEntityLinksService } from '../../entity-links/service.js';
import { createCheckService } from '../../permissions/check-service.js';
import { createConversationService, type ConversationService } from '../conversation-service.js';
import { createVocReadService } from '../read-service.js';
import { createVocService, type VocService } from '../service.js';

const APP_URL = process.env.DATABASE_URL ?? '';
const MIGRATE_URL = process.env.DATABASE_URL_MIGRATE ?? '';
const runIntegration = Boolean(APP_URL && MIGRATE_URL);

if (!runIntegration) {
  console.warn(
    '[voc-commands] skipping integration suite — set DATABASE_URL and DATABASE_URL_MIGRATE to run.',
  );
}

describe.skipIf(!runIntegration)('VOC application commands (#392)', () => {
  let dbHandle: DbHandle;
  let migrateHandle: DbHandle;
  let vocService: VocService;
  let conversationService: ConversationService;
  const workspaceId = randomUUID();
  let adminActorId = '';
  let reporterActorId = '';
  let managedSystemId = '';

  function paragraphDoc(text: string) {
    return {
      type: 'doc' as const,
      content: [{ type: 'paragraph', content: [{ type: 'text', text }] }],
    };
  }

  function adminActor() {
    return {
      actor_id: adminActorId,
      workspace_id: workspaceId,
      role_level: 'admin' as const,
    };
  }

  function createActorInput() {
    return {
      primary_managed_system_id: managedSystemId,
      title: 'Cmd create VOC',
      description_rich_content: paragraphDoc('command create body'),
      source_context: 'direct_use' as const,
    };
  }

  async function seedVoc(title: string): Promise<{ id: string; updated_at: string }> {
    // If-Match is compared against `row.updatedAt.toISOString()` in the service,
    // so hand back the driver's Date rendered the same way (not `updated_at::text`).
    const res = await migrateHandle.pool.query<{ id: string; updated_at: Date }>(
      `insert into voc.vocs
         (workspace_id, primary_managed_system_id, reporter_id, display_id, title,
          description_rich_content, source_context, reporter_facing_status, triage_state)
       values
         ($1, $2, $3, voc.next_voc_display_id($1::uuid), $4,
          '{"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"body"}]}]}'::jsonb,
          'direct_use', 'received', 'untriaged')
       returning id, updated_at`,
      [workspaceId, managedSystemId, reporterActorId, title],
    );
    const row = res.rows[0];
    if (!row) throw new Error(`seedVoc failed for title=${title}`);
    return { id: row.id, updated_at: row.updated_at.toISOString() };
  }

  async function scalarCount(query: string, params: unknown[]): Promise<number> {
    const res = await dbHandle.pool.query<{ count: number }>(query, params);
    return res.rows[0]?.count ?? 0;
  }

  const vocRowCount = (vocId: string) =>
    scalarCount(`select count(*)::int as count from voc.vocs where id = $1`, [vocId]);

  const idempotencyRowCount = (actorId: string, key: string) =>
    scalarCount(
      `select count(*)::int as count from core.idempotency_keys where actor_id = $1 and key = $2`,
      [actorId, key],
    );

  const publicUpdateCount = (vocId: string) =>
    scalarCount(`select count(*)::int as count from voc.voc_public_updates where voc_id = $1`, [
      vocId,
    ]);

  const internalCommentCount = (vocId: string) =>
    scalarCount(`select count(*)::int as count from voc.voc_internal_comments where voc_id = $1`, [
      vocId,
    ]);

  async function auditEventTypes(vocId: string): Promise<string[]> {
    const res = await migrateHandle.pool.query<{ event_type: string }>(
      `select event_type from core.audit_log where subject_id = $1 and workspace_id = $2`,
      [vocId, workspaceId],
    );
    return res.rows.map((r) => r.event_type);
  }

  beforeAll(async () => {
    dbHandle = createDb(APP_URL);
    migrateHandle = createDb(MIGRATE_URL);
    const auditService = createAuditService();
    const checkService = createCheckService({ db: dbHandle.db });
    const idempotencyService = createIdempotencyService();
    const vocReadService = createVocReadService({
      db: dbHandle.db,
      checkService,
      entityLinksService: createEntityLinksService({
        db: dbHandle.db,
        checkService,
        auditService,
      }),
    });
    vocService = createVocService({
      db: dbHandle.db,
      auditService,
      checkService,
      idempotencyService,
    });
    conversationService = createConversationService({
      db: dbHandle.db,
      auditService,
      checkService,
      idempotencyService,
      vocReadService,
    });

    await migrateHandle.pool.query(`insert into core.workspaces (id, name) values ($1, $2)`, [
      workspaceId,
      'VOC Commands Test Workspace',
    ]);
    const admin = await migrateHandle.pool.query<{ id: string }>(
      `insert into core.actors (workspace_id, external_id, email, display_name, role_level, actor_type)
         values ($1, $2, $3, $4, 'admin', 'internal_member')
       returning id`,
      [
        workspaceId,
        `voc-cmd-admin-${workspaceId}`,
        `voc-cmd-admin-${workspaceId}@local`,
        'VOC Cmd Admin',
      ],
    );
    adminActorId = admin.rows[0]?.id ?? '';
    if (!adminActorId) throw new Error('seed admin actor failed');
    const reporter = await migrateHandle.pool.query<{ id: string }>(
      `insert into core.actors (workspace_id, external_id, email, display_name, role_level, actor_type)
         values ($1, $2, $3, $4, 'developer', 'internal_member')
       returning id`,
      [
        workspaceId,
        `voc-cmd-reporter-${workspaceId}`,
        `voc-cmd-reporter-${workspaceId}@local`,
        'VOC Cmd Reporter',
      ],
    );
    reporterActorId = reporter.rows[0]?.id ?? '';
    if (!reporterActorId) throw new Error('seed reporter actor failed');
    const ms = await migrateHandle.pool.query<{ id: string }>(
      `insert into core.managed_systems (workspace_id, slug, name)
       values ($1, $2, $3)
       returning id`,
      [workspaceId, 'voc-cmd-ms', 'VOC Commands MS'],
    );
    managedSystemId = ms.rows[0]?.id ?? '';
    if (!managedSystemId) throw new Error('seed managed system failed');
  });

  afterAll(async () => {
    if (migrateHandle) {
      // FK-safe order: audit + idempotency first, then VOCs (conversation
      // rows cascade), then reference/seed tables, then the workspace.
      await migrateHandle.pool.query(`delete from core.audit_log where workspace_id = $1`, [
        workspaceId,
      ]);
      await migrateHandle.pool.query(
        `delete from core.idempotency_keys where actor_id in (
           select id from core.actors where workspace_id = $1
         )`,
        [workspaceId],
      );
      await migrateHandle.pool.query(`delete from voc.vocs where workspace_id = $1`, [workspaceId]);
      await migrateHandle.pool.query(`delete from core.managed_systems where workspace_id = $1`, [
        workspaceId,
      ]);
      await migrateHandle.pool.query(`delete from core.actors where workspace_id = $1`, [
        workspaceId,
      ]);
      await migrateHandle.pool.query(`delete from core.display_counters where workspace_id = $1`, [
        workspaceId,
      ]);
      await migrateHandle.pool.query(`delete from core.workspaces where id = $1`, [workspaceId]);
    }
    await dbHandle?.close();
    await migrateHandle?.close();
  });

  it('createVocCommand: 201 → replay with same key+hash is identical with one row; key+hash mismatch → conflict', async () => {
    const actor = { actor_id: adminActorId, workspace_id: workspaceId };
    const input = createActorInput();
    const key = randomUUID();
    const hash = hashRequestBody(input);

    const first = await vocService.createVocCommand({
      actor,
      input,
      idempotencyKey: key,
      requestHash: hash,
    });
    expect(first.status).toBe(201);
    expect(first.body.title).toBe('Cmd create VOC');
    expect(await vocRowCount(first.body.id)).toBe(1);

    const replay = await vocService.createVocCommand({
      actor,
      input,
      idempotencyKey: key,
      requestHash: hash,
    });
    expect(replay).toEqual(first);
    expect(await vocRowCount(first.body.id)).toBe(1);

    await expect(
      vocService.createVocCommand({
        actor,
        input,
        idempotencyKey: key,
        requestHash: hashRequestBody({ ...input, title: 'different intent' }),
      }),
    ).rejects.toMatchObject({ code: 'conflict.idempotency_key_reuse' });
    expect(await vocRowCount(first.body.id)).toBe(1);
  });

  it('createVocCommand: domain failure stores no idempotency record — same key retries the work', async () => {
    const actor = { actor_id: adminActorId, workspace_id: workspaceId };
    const badInput = {
      ...createActorInput(),
      primary_managed_system_id: randomUUID(), // unknown managed system
      title: 'Cmd create doomed',
    };
    const key = randomUUID();
    const hash = hashRequestBody(badInput);

    await expect(
      vocService.createVocCommand({
        actor,
        input: badInput,
        idempotencyKey: key,
        requestHash: hash,
      }),
    ).rejects.toMatchObject({ code: 'not_found.record' });
    expect(await idempotencyRowCount(adminActorId, key)).toBe(0);

    // Retry executes the domain again instead of replaying a cached failure.
    await expect(
      vocService.createVocCommand({
        actor,
        input: badInput,
        idempotencyKey: key,
        requestHash: hash,
      }),
    ).rejects.toMatchObject({ code: 'not_found.record' });
    expect(await idempotencyRowCount(adminActorId, key)).toBe(0);
  });

  it('updateVocCommand: 200 + severity audit; replay returns the recorded body without a second audit row', async () => {
    const voc = await seedVoc('Cmd triage VOC');
    const input = { severity: 'high' as const };
    const key = randomUUID();
    const hash = hashRequestBody({ vocId: voc.id, ifMatch: voc.updated_at, ...input });

    const first = await vocService.updateVocCommand({
      actor: adminActor(),
      vocId: voc.id,
      ifMatch: voc.updated_at,
      input,
      idempotencyKey: key,
      requestHash: hash,
    });
    expect(first.status).toBe(200);
    expect(first.body.severity).toBe('high');
    expect(await auditEventTypes(voc.id)).toContain('voc_severity_set');

    // Replay: identical inputs (including the now-stale ifMatch — the replay
    // path short-circuits before the concurrency check, mirroring the route).
    const replay = await vocService.updateVocCommand({
      actor: adminActor(),
      vocId: voc.id,
      ifMatch: voc.updated_at,
      input,
      idempotencyKey: key,
      requestHash: hash,
    });
    expect(replay).toEqual(first);
    expect((await auditEventTypes(voc.id)).filter((t) => t === 'voc_severity_set')).toHaveLength(1);
  });

  it('updateVocCommand: stale ifMatch → conflict.stale_write and no idempotency record', async () => {
    const voc = await seedVoc('Cmd stale VOC');
    const input = { severity: 'low' as const };
    const staleIfMatch = new Date(Date.parse(voc.updated_at) - 60_000).toISOString();
    const key = randomUUID();
    const hash = hashRequestBody({ vocId: voc.id, ifMatch: staleIfMatch, ...input });

    await expect(
      vocService.updateVocCommand({
        actor: adminActor(),
        vocId: voc.id,
        ifMatch: staleIfMatch,
        input,
        idempotencyKey: key,
        requestHash: hash,
      }),
    ).rejects.toMatchObject({ code: 'conflict.stale_write' });
    expect(await idempotencyRowCount(adminActorId, key)).toBe(0);
  });

  it('postPublicUpdateCommand: 201 + one row; replay adds nothing; hash mismatch → conflict', async () => {
    const voc = await seedVoc('Cmd pubupd VOC');
    const input = {
      skip_public_update: false as const,
      body_rich_content: paragraphDoc('public update body'),
      next_reporter_facing_status: 'reviewing' as const,
    };
    const key = randomUUID();
    const hash = hashRequestBody({ ...input, vocId: voc.id, route: 'voc.public_update' });

    const first = await conversationService.postPublicUpdateCommand({
      actor: adminActor(),
      vocId: voc.id,
      input,
      idempotencyKey: key,
      requestHash: hash,
    });
    expect(first.status).toBe(201);
    expect(first.body.public_update.reporter_facing_status_after).toBe('reviewing');
    expect(await publicUpdateCount(voc.id)).toBe(1);
    expect(await auditEventTypes(voc.id)).toContain('public_update_created');

    const replay = await conversationService.postPublicUpdateCommand({
      actor: adminActor(),
      vocId: voc.id,
      input,
      idempotencyKey: key,
      requestHash: hash,
    });
    expect(replay).toEqual(first);
    expect(await publicUpdateCount(voc.id)).toBe(1);
    expect(
      (await auditEventTypes(voc.id)).filter((t) => t === 'public_update_created'),
    ).toHaveLength(1);

    await expect(
      conversationService.postPublicUpdateCommand({
        actor: adminActor(),
        vocId: voc.id,
        input,
        idempotencyKey: key,
        requestHash: hashRequestBody({
          ...input,
          vocId: voc.id,
          route: 'voc.internal_comment',
        }),
      }),
    ).rejects.toMatchObject({ code: 'conflict.idempotency_key_reuse' });
  });

  it('postInternalCommentCommand: 201 + one row; replay adds nothing', async () => {
    const voc = await seedVoc('Cmd comment VOC');
    const input = {
      body_rich_content: paragraphDoc('internal note'),
      mentions: [],
    };
    const key = randomUUID();
    const hash = hashRequestBody({ ...input, vocId: voc.id, route: 'voc.internal_comment' });

    const first = await conversationService.postInternalCommentCommand({
      actor: adminActor(),
      vocId: voc.id,
      input,
      idempotencyKey: key,
      requestHash: hash,
    });
    expect(first.status).toBe(201);
    expect(first.body.internal_comment.body_rich_content).toEqual(paragraphDoc('internal note'));
    expect(await internalCommentCount(voc.id)).toBe(1);

    const replay = await conversationService.postInternalCommentCommand({
      actor: adminActor(),
      vocId: voc.id,
      input,
      idempotencyKey: key,
      requestHash: hash,
    });
    expect(replay).toEqual(first);
    expect(await internalCommentCount(voc.id)).toBe(1);
  });

  it('manual-frame commands take the actor+key advisory lock: a command blocks while the lock is held elsewhere', async () => {
    // Deterministic lock check (the race test below is probabilistic): hold the
    // SAME pg_advisory_xact_lock key in another transaction; the command must
    // not complete until we release it. A frame without the lock finishes at
    // once and fails this test.
    const voc = await seedVoc('Cmd lock-held VOC');
    const input = { body_rich_content: paragraphDoc('lock note'), mentions: [] };
    const key = randomUUID();
    const hash = hashRequestBody({ ...input, vocId: voc.id, route: 'voc.internal_comment' });

    const holder = await migrateHandle.pool.connect();
    let command: Promise<unknown> | undefined;
    try {
      await holder.query('begin');
      await holder.query('select pg_advisory_xact_lock(hashtext($1), hashtext($2))', [
        adminActorId,
        key,
      ]);

      let settled = false;
      command = conversationService
        .postInternalCommentCommand({
          actor: adminActor(),
          vocId: voc.id,
          input,
          idempotencyKey: key,
          requestHash: hash,
        })
        .finally(() => {
          settled = true;
        });

      // Wait until Postgres actually reports a session blocked on an advisory
      // lock (pg_locks, not granted) — proof the command reached the lock —
      // instead of trusting a fixed sleep. A frame without the lock never
      // shows up here and fails this poll.
      const deadline = Date.now() + 5000;
      let waiting = 0;
      while (Date.now() < deadline && waiting === 0) {
        const res = await migrateHandle.pool.query<{ n: number }>(
          "select count(*)::int as n from pg_locks where locktype = 'advisory' and not granted",
        );
        waiting = res.rows[0]?.n ?? 0;
        if (waiting === 0) await new Promise<void>((resolve) => setTimeout(resolve, 25));
      }
      expect(waiting, 'command must be blocked on the advisory lock').toBeGreaterThan(0);
      // Still blocked after the lock wait is confirmed:
      expect(settled, 'command must wait for the advisory lock').toBe(false);
      expect(await internalCommentCount(voc.id)).toBe(0);

      await holder.query('commit');
      const result = (await command) as { status: number };
      expect(result.status).toBe(201);
      expect(await internalCommentCount(voc.id)).toBe(1);
    } finally {
      await holder.query('rollback').catch(() => undefined);
      holder.release();
      await command?.catch(() => undefined);
    }
  });

  it('manual-frame commands race on the same actor+key+hash: advisory lock serializes → one row, identical bodies', async () => {
    // createVocCommand goes through idempotencyService.runIdempotent; the five
    // other commands use the shared manual frame whose ONLY serialization is
    // pg_advisory_xact_lock. Fire several at once so an unlocked frame would
    // let more than one pass the lookup and insert.
    const voc = await seedVoc('Cmd manual-frame race VOC');
    const input = {
      body_rich_content: paragraphDoc('race note'),
      mentions: [],
    };
    const key = randomUUID();
    const hash = hashRequestBody({ ...input, vocId: voc.id, route: 'voc.internal_comment' });

    const results = await Promise.allSettled(
      Array.from({ length: 6 }, () =>
        conversationService.postInternalCommentCommand({
          actor: adminActor(),
          vocId: voc.id,
          input,
          idempotencyKey: key,
          requestHash: hash,
        }),
      ),
    );

    expect(results.map((r) => r.status)).toEqual(Array(6).fill('fulfilled'));
    const bodies = results.map(
      (r) => (r as PromiseFulfilledResult<{ status: number; body: unknown }>).value,
    );
    for (const value of bodies) {
      expect(value.status).toBe(201);
      expect(value).toEqual(bodies[0]);
    }
    expect(await internalCommentCount(voc.id)).toBe(1);
  });

  it('two createVocCommand calls with same actor+key+hash race: lock serializes → one VOC row, same body', async () => {
    const actor = { actor_id: adminActorId, workspace_id: workspaceId };
    const input = {
      ...createActorInput(),
      title: 'Cmd race VOC',
    };
    const key = randomUUID();
    const hash = hashRequestBody(input);

    const [a, b] = await Promise.all([
      vocService.createVocCommand({ actor, input, idempotencyKey: key, requestHash: hash }),
      vocService.createVocCommand({ actor, input, idempotencyKey: key, requestHash: hash }),
    ]);

    expect(a.status).toBe(201);
    expect(b.status).toBe(201);
    expect(b.body).toEqual(a.body);
    expect(await vocRowCount(a.body.id)).toBe(1);
  });
});
