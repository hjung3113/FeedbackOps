import { type DbHandle, createDb } from '../db/client.js';
import { paragraphDoc } from './rich-content-fixtures.js';

// ── VOC direct SQL insert (bypasses REST + rate limit) ───────────────────────

export interface InsertVocOpts {
  severity?: 'low' | 'medium' | 'high' | 'critical';
  triageState?: 'untriaged' | 'triaged' | 'needs_more_information' | 'dismissed_not_actionable';
  ownerUserId?: string;
  postponedAt?: boolean; // if true, sets triage_state_review_postponed_at = now()
}

export async function insertVocDirectly(
  dbHandle: DbHandle,
  workspaceId: string,
  msId: string,
  reporterId: string,
  title: string,
  opts: InsertVocOpts = {},
): Promise<{ id: string; updated_at: string }> {
  const {
    severity = null,
    triageState = 'untriaged',
    ownerUserId = null,
    postponedAt = false,
  } = opts;

  const res = await dbHandle.pool.query<{ id: string; updated_at: string }>(
    `insert into voc.vocs
       (workspace_id, primary_managed_system_id, reporter_id, display_id, title,
        description_rich_content, source_context, reporter_facing_status, triage_state,
        severity, owner_user_id, triage_state_review_postponed_at)
     values
       ($1, $2, $3, voc.next_voc_display_id($1::uuid), $4,
        '{"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"body"}]}]}'::jsonb,
        'direct_use', 'received', $5,
        $6, $7, ${postponedAt ? 'now()' : 'NULL'})
     returning id, updated_at::text as updated_at`,
    [workspaceId, msId, reporterId, title, triageState, severity, ownerUserId],
  );
  const row = res.rows[0];
  if (!row) throw new Error(`insertVocDirectly failed for title=${title}`);
  return { id: row.id, updated_at: row.updated_at };
}

export async function insertPublicUpdate(
  dbHandle: DbHandle,
  vocId: string,
  actorId: string,
  opts?: { createdAt?: string },
): Promise<string> {
  const body = paragraphDoc('public update');
  const createdAt = opts?.createdAt ?? undefined;
  let res;
  if (createdAt) {
    res = await dbHandle.pool.query<{ id: string }>(
      `insert into voc.voc_public_updates
         (voc_id, actor_id, body_rich_content, reporter_facing_status_before, reporter_facing_status_after, skip_public_update, created_at)
       values ($1, $2, $3::jsonb, 'received', 'received', false, $4::timestamptz)
       returning id`,
      [vocId, actorId, JSON.stringify(body), createdAt],
    );
  } else {
    res = await dbHandle.pool.query<{ id: string }>(
      `insert into voc.voc_public_updates
         (voc_id, actor_id, body_rich_content, reporter_facing_status_before, reporter_facing_status_after, skip_public_update)
       values ($1, $2, $3::jsonb, 'received', 'received', false)
       returning id`,
      [vocId, actorId, JSON.stringify(body)],
    );
  }
  const id = res.rows[0]?.id;
  if (!id) throw new Error('insertPublicUpdate: no id returned');
  return id;
}

export async function insertPublicUpdateReviewCandidateDirectly(
  dbHandle: DbHandle,
  input: {
    workspaceId: string;
    primaryManagedSystemId: string;
    vocId: string;
    taskId: string;
    triggeredByActorId: string;
  },
): Promise<{ id: string; sourceEntityLinkId: string }> {
  const result = await dbHandle.pool.query<{ id: string; source_entity_link_id: string }>(
    `with inserted_link as (
       insert into core.entity_links (
         workspace_id, source_type, source_id, target_type, target_id,
         relation_type, visibility, status, managed_system_id, created_by
       )
       values ($1, 'voc', $2, 'task', $3, 'evidence_of', 'internal_only', 'active', $4, $5)
       returning id
     )
     insert into voc.public_update_review_candidates (
       workspace_id, voc_id, source_task_id, source_entity_link_id,
       release_event_id, correlation_id, triggered_by_actor_id
     )
     select $1, $2, $3, inserted_link.id, gen_random_uuid(), gen_random_uuid(), $5
       from inserted_link
     returning id, source_entity_link_id`,
    [
      input.workspaceId,
      input.vocId,
      input.taskId,
      input.primaryManagedSystemId,
      input.triggeredByActorId,
    ],
  );
  const row = result.rows[0];
  if (!row) throw new Error('insertPublicUpdateReviewCandidateDirectly failed');
  return { id: row.id, sourceEntityLinkId: row.source_entity_link_id };
}

// ── Cleanup helpers ──────────────────────────────────────────────────────────

/** Cleans all VOC read-test fixtures from product tables. Scopes by MS slug prefix.
 *
 * Cleanup order:
 *   1. permission_grants (references actors)
 *   2. voc_permission_decisions_seed_fixture (fops_app has DELETE on this table)
 *   3. voc.vocs — conversation tables (public_updates, reporter_replies, internal_comments)
 *      have ON DELETE CASCADE on voc_id, so cascade automatically. fops_app has no
 *      DELETE on conversation tables; they are append-only at the product layer.
 *   4. analytics_areas, managed_systems (MS delete requires no voc referencing it)
 *   5. sessions, idempotency_keys, rate_limits, actors
 */
export async function cleanupReadTestTables(
  dbHandle: DbHandle,
  workspaceId: string,
  msSlugPrefix: string,
): Promise<void> {
  // 1. Clean grants + denies for test dev actors before removing actors.
  await dbHandle.pool.query(
    `delete from permission.permission_grants
      where workspace_id = $1
        and actor_id in (
          select id from core.actors where external_id like 'mock-dev-read-%' and workspace_id = $1
        )`,
    [workspaceId],
  );
  await dbHandle.pool.query(
    `delete from permission.permission_denies
      where workspace_id = $1
        and actor_id in (
          select id from core.actors where external_id like 'mock-dev-read-%' and workspace_id = $1
        )`,
    [workspaceId],
  );

  // 1b. Access requests raised by those actors. `permission_requests
  //     .requester_actor_id` is the second FK into core.actors (after
  //     audit_log) that blocks the actor delete at the end of this helper;
  //     fops_app does hold DELETE here, so the app pool is enough.
  await dbHandle.pool.query(
    `delete from permission.permission_requests
      where workspace_id = $1
        and requester_actor_id in (
          select id from core.actors where external_id like 'mock-dev-read-%' and workspace_id = $1
        )`,
    [workspaceId],
  );

  // 2. Clean permission decisions seed fixture (fops_app has DELETE).
  await dbHandle.pool.query(
    `delete from voc.voc_permission_decisions_seed_fixture
      where voc_id in (
        select id from voc.vocs
         where primary_managed_system_id in (
           select id from core.managed_systems where slug like $1 and workspace_id = $2
         )
      )`,
    [`${msSlugPrefix}%`, workspaceId],
  );

  // 2b. PLAN-22 C7b — clean voc_attachments rows by storage_key workspace
  //     prefix. Rows linked via voc_id cascade with the VOC delete below;
  //     this catches unlinked + comment-linked rows seeded by C7b tests.
  await dbHandle.pool.query(`delete from voc.voc_attachments where storage_key like $1 || '/%'`, [
    workspaceId,
  ]);

  // 3. Delete VOCs — conversation tables cascade automatically (ON DELETE CASCADE).
  //    fops_app has DELETE on voc.vocs, but NOT on conversation tables.
  await dbHandle.pool.query(
    `delete from voc.vocs
      where primary_managed_system_id in (
        select id from core.managed_systems where slug like $1 and workspace_id = $2
      )`,
    [`${msSlugPrefix}%`, workspaceId],
  );

  // 4. Remove analytics_areas and managed_systems.
  await dbHandle.pool.query(
    `delete from core.analytics_areas
      where managed_system_id in (
        select id from core.managed_systems where slug like $1 and workspace_id = $2
      )`,
    [`${msSlugPrefix}%`, workspaceId],
  );
  await dbHandle.pool.query(
    `delete from core.managed_systems where slug like $1 and workspace_id = $2`,
    [`${msSlugPrefix}%`, workspaceId],
  );

  // 5. Sessions (only dev test actors, not admin/reporter), idempotency, rate limits, actors.
  // WHY (N-MAJ-3 cycle-2 fix): scope deletes to this test suite's actor cohort so
  // concurrent PATCH/POST suites sharing the same DB (pool=forks) are not affected.
  // idempotency_keys: keyed by actor_id → match test-created dev actors only.
  // rate_limits: keyed by actor_id (authenticated) or req.ip (anonymous fallback, see
  // rate-limit-pg-store.ts). Dev test actors are identified by external_id prefix
  // 'mock-dev-read-'; IP fallback rows are scoped by the loopback prefix '127.0.0.'.
  await dbHandle.pool.query(
    `delete from core.idempotency_keys
      where actor_id in (
        select id from core.actors
          where external_id like 'mock-dev-read-%' and workspace_id = $1
      )`,
    [workspaceId],
  );
  await dbHandle.pool.query(
    `delete from core.rate_limits
      where key in (
        select id::text from core.actors
          where external_id like 'mock-dev-read-%' and workspace_id = $1
      )
      or key like '127.0.0.%'`,
    [workspaceId],
  );
  // Only delete sessions belonging to test-created dev actors, NOT admin/reporter sessions.
  // Admin and reporter sessions are created in beforeAll and must survive beforeEach cleanup.
  await dbHandle.pool.query(
    `delete from core.sessions
       where actor_id in (
         select id from core.actors where external_id like 'mock-dev-read-%' and workspace_id = $1
       )`,
    [workspaceId],
  );
  // 6. Audit rows written while the dev actors made requests. Every request
  //    these actors issue writes core.audit_log, and audit_log.actor_id is a
  //    plain FK to core.actors — so the delete below fails with
  //    audit_log_actor_id_actors_id_fk unless the audit rows go first. That
  //    failure aborts the whole afterAll hook, which is why every fixture
  //    after it leaked into the next run (#205).
  //
  //    fops_app has no DELETE on core.audit_log by design (ADR-0008/0019), so
  //    this one statement has to go through the migrate role. When
  //    DATABASE_URL_MIGRATE is not exported the suites that call this helper
  //    are gated off anyway, so skipping is safe.
  await clearAuditLogForDevActors(workspaceId);

  await dbHandle.pool.query(
    `delete from core.actors where external_id like 'mock-dev-read-%' and workspace_id = $1`,
    [workspaceId],
  );
}

async function clearAuditLogForDevActors(workspaceId: string): Promise<void> {
  const migrateUrl = process.env.DATABASE_URL_MIGRATE ?? '';
  if (!migrateUrl) return;

  const migrateHandle = createDb(migrateUrl);
  try {
    await migrateHandle.pool.query(
      `delete from core.audit_log
        where actor_id in (
          select id from core.actors
           where external_id like 'mock-dev-read-%' and workspace_id = $1
        )`,
      [workspaceId],
    );
  } finally {
    await migrateHandle.close();
  }
}

/**
 * Cleans the test-created actor cohort whose external_id starts with
 * `externalIdPrefix` in one workspace: dependent rows first, then the actors.
 * Generic counterpart of the mock-dev-read-* cleanup inside
 * cleanupReadTestTables, for suites that create other cohorts (the nav-resolve
 * suite's mock-user-plain-* actors, #731 FIX1). Order mirrors that cleanup:
 * permission grants/denies/requests (FK into core.actors), idempotency keys,
 * rate limits (authenticated actor-id key or loopback IP fallback), sessions,
 * audit rows through the migrate role (fops_app has no DELETE on
 * core.audit_log), then the actors themselves.
 */
export async function cleanupTestActorsByExternalIdPrefix(
  dbHandle: DbHandle,
  workspaceId: string,
  externalIdPrefix: string,
): Promise<void> {
  const cohortSub = `select id from core.actors
      where external_id like $2 and workspace_id = $1`;
  await dbHandle.pool.query(
    `delete from permission.permission_grants
      where workspace_id = $1 and actor_id in (${cohortSub})`,
    [workspaceId, `${externalIdPrefix}%`],
  );
  await dbHandle.pool.query(
    `delete from permission.permission_denies
      where workspace_id = $1 and actor_id in (${cohortSub})`,
    [workspaceId, `${externalIdPrefix}%`],
  );
  await dbHandle.pool.query(
    `delete from permission.permission_requests
      where workspace_id = $1 and requester_actor_id in (${cohortSub})`,
    [workspaceId, `${externalIdPrefix}%`],
  );
  await dbHandle.pool.query(
    `delete from core.idempotency_keys
      where actor_id in (${cohortSub})`,
    [workspaceId, `${externalIdPrefix}%`],
  );
  await dbHandle.pool.query(
    `delete from core.rate_limits
      where key in (
        select id::text from core.actors where external_id like $2 and workspace_id = $1
      )
      or key like '127.0.0.%'`,
    [workspaceId, `${externalIdPrefix}%`],
  );
  await dbHandle.pool.query(
    `delete from core.sessions
       where actor_id in (${cohortSub})`,
    [workspaceId, `${externalIdPrefix}%`],
  );

  const migrateUrl = process.env.DATABASE_URL_MIGRATE ?? '';
  if (migrateUrl) {
    const migrateHandle = createDb(migrateUrl);
    try {
      await migrateHandle.pool.query(
        `delete from core.audit_log
          where actor_id in (${cohortSub})`,
        [workspaceId, `${externalIdPrefix}%`],
      );
    } finally {
      await migrateHandle.close();
    }
  }

  await dbHandle.pool.query(
    `delete from core.actors where external_id like $2 and workspace_id = $1`,
    [workspaceId, `${externalIdPrefix}%`],
  );
}
