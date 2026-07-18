// Task status transition endpoint (#138).
//
// Gate: DATABASE_URL + DATABASE_URL_MIGRATE + WORKSPACE_ID. The verifier runs
// this suite against live Postgres outside the sandbox.

import { randomUUID } from "node:crypto";

import type { FastifyInstance } from "fastify";
import type { PgBoss } from "pg-boss";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { loadConfig } from "../../../config.js";
import { type DbHandle, createDb } from "../../../db/client.js";
import { buildServer } from "../../../server.js";
import { initBoss, shutdownBoss } from "../../../lib/jobs.js";
import { createAuditService } from "../../core/audit/index.js";
import {
  SESSION_COOKIE_NAME,
  cleanupReadTestTables,
  insertDevActor,
  insertMsDirectly,
  loginAs,
  uid,
  insertVocDirectly,
} from "../../voc/__tests__/_seed-helpers.js";
import { insertTaskRow } from "./_seed-helpers.js";
import {
  releasedReviewCandidatesHandler,
  type TaskReleasedReviewCandidatesPayload,
} from "../jobs/released-review-candidates.js";
import { createPublicUpdateReviewCandidatesService } from "../../voc/public-update-review-candidates/service.js";

const APP_URL = process.env.DATABASE_URL ?? "";
const MIGRATE_URL = process.env.DATABASE_URL_MIGRATE ?? "";
const WORKSPACE_ID = process.env.WORKSPACE_ID ?? "";
const runIntegration = Boolean(APP_URL && MIGRATE_URL && WORKSPACE_ID);
const SLUG_PREFIX = "it-task-status";
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function asReleasedReviewCandidatesPayload(
  data: Record<string, unknown> | undefined,
): TaskReleasedReviewCandidatesPayload {
  if (!data) throw new Error("released review-candidate job payload missing");
  return data as unknown as TaskReleasedReviewCandidatesPayload;
}

describe.skipIf(!runIntegration)(
  "PATCH /tasks/:id status transition (#138)",
  () => {
    let dbHandle: DbHandle;
    let migrateHandle: DbHandle;
    let app: FastifyInstance;
    let adminCookie: string;
    let adminActorId: string;
    let boss: PgBoss;

    beforeAll(async () => {
      process.env.NODE_ENV = "test";
      dbHandle = createDb(APP_URL);
      migrateHandle = createDb(MIGRATE_URL);
      boss = await initBoss({ connectionString: APP_URL });
      app = await buildServer({ config: loadConfig(), dbHandle, boss });
      await app.ready();
      adminCookie = await loginAs(app, "mock-admin-1");
      const actors = await dbHandle.pool.query<{ id: string }>(
        `select id from core.actors where workspace_id = $1 and external_id = 'mock-admin-1'`,
        [WORKSPACE_ID],
      );
      adminActorId = actors.rows[0]?.id ?? "";
      if (!adminActorId) throw new Error("seed admin actor not found");
    });

    beforeEach(async () => cleanupFixtures());

    afterAll(async () => {
      await cleanupFixtures();
      await app?.close();
      await shutdownBoss(boss);
      await dbHandle?.close();
      await migrateHandle?.close();
    });

    async function cleanupFixtures(): Promise<void> {
      if (!migrateHandle) return;
      await migrateHandle.pool.query(
        `delete from pgboss.job_common where name = 'tasks.create_public_update_review_candidates'`,
      );
      await migrateHandle.pool.query(
        `delete from voc.public_update_review_candidates where workspace_id = $1`,
        [WORKSPACE_ID],
      );
      // #165 fixtures create direct VOC -> Task links. They reference the
      // fixture Managed System, so remove them before the shared VOC cleanup
      // deletes that parent.
      await migrateHandle.pool.query(
        `delete from core.entity_links
          where workspace_id = $1
            and managed_system_id in (
              select id from core.managed_systems
               where workspace_id = $1 and slug like $2
            )`,
        [WORKSPACE_ID, `${SLUG_PREFIX}%`],
      );
      await migrateHandle.pool.query(
        `delete from core.audit_log
          where workspace_id = $1
            and event_type = 'task_status_changed'
            and subject_id in (
              select task.id
              from task.tasks task
              join core.managed_systems managed_system
                on managed_system.id = task.primary_managed_system_id
              where task.workspace_id = $1
                and managed_system.workspace_id = $1
                and managed_system.slug like $2
            )`,
        [WORKSPACE_ID, `${SLUG_PREFIX}%`],
      );
      await migrateHandle.pool.query(
        `delete from core.idempotency_keys
        where actor_id in (select id from core.actors where workspace_id = $1 and external_id like 'mock-dev-task-status-%')
           or actor_id = (select id from core.actors where workspace_id = $1 and external_id = 'mock-admin-1')`,
        [WORKSPACE_ID],
      );
      await migrateHandle.pool.query(
        `delete from task.tasks where workspace_id = $1 and primary_managed_system_id in (
         select id from core.managed_systems where workspace_id = $1 and slug like $2
       )`,
        [WORKSPACE_ID, `${SLUG_PREFIX}%`],
      );
      await migrateHandle.pool.query(
        `delete from permission.permission_grants where workspace_id = $1 and actor_id in (
         select id from core.actors where workspace_id = $1 and external_id like 'mock-dev-task-status-%'
       )`,
        [WORKSPACE_ID],
      );
      await migrateHandle.pool.query(
        `delete from core.rate_limits where key like $1 || ':%' or key like '127.0.0.%'`,
        [WORKSPACE_ID],
      );
      await cleanupReadTestTables(dbHandle, WORKSPACE_ID, SLUG_PREFIX);
    }

    async function seedTask(status: "backlog" | "todo" | "doing" = "backlog") {
      const msId = await insertMsDirectly(
        dbHandle,
        WORKSPACE_ID,
        uid(SLUG_PREFIX),
        "Task Status MS",
      );
      const task = await insertTaskRow(migrateHandle, {
        workspaceId: WORKSPACE_ID,
        primaryManagedSystemId: msId,
        status,
        createdBy: adminActorId,
      });
      const row = await dbHandle.pool.query<{ updated_at: Date }>(
        `select updated_at from task.tasks where id = $1`,
        [task.id],
      );
      const updatedAt = row.rows[0]?.updated_at?.toISOString();
      if (!updatedAt) throw new Error("seed task updated_at missing");
      return { ...task, msId, updatedAt };
    }

    function patchTask(
      cookie: string,
      taskId: string,
      body: Record<string, unknown>,
      headers: { idempotencyKey?: string; ifMatch?: string } = {},
    ) {
      const requestHeaders: Record<string, string> = {
        cookie: `${SESSION_COOKIE_NAME}=${cookie}`,
        "content-type": "application/json",
      };
      if (headers.idempotencyKey !== undefined)
        requestHeaders["idempotency-key"] = headers.idempotencyKey;
      if (headers.ifMatch !== undefined)
        requestHeaders["if-match"] = headers.ifMatch;
      return app.inject({
        method: "PATCH",
        url: `/tasks/${taskId}`,
        headers: requestHeaders,
        payload: body,
      });
    }

    it("changes status, returns Task Detail, and writes task_status_changed audit detail", async () => {
      const task = await seedTask();
      const res = await patchTask(
        adminCookie,
        task.id,
        { status: "doing" },
        {
          idempotencyKey: randomUUID(),
          ifMatch: task.updatedAt,
        },
      );

      expect(res.statusCode).toBe(200);
      expect(res.json()).toMatchObject({
        id: task.id,
        status: "doing",
        source: null,
      });
      const audit = await dbHandle.pool.query<{ detail: unknown }>(
        `select detail from core.audit_log where workspace_id = $1 and event_type = 'task_status_changed' and subject_id = $2`,
        [WORKSPACE_ID, task.id],
      );
      expect(audit.rowCount).toBe(1);
      expect(audit.rows[0]?.detail).toEqual({ from: "backlog", to: "doing" });
    });

    it("atomically snapshots an eligible direct VOC link into one real pg-boss job", async () => {
      const task = await seedTask("doing");
      const voc = await insertVocDirectly(
        migrateHandle,
        WORKSPACE_ID,
        task.msId,
        adminActorId,
        "Release candidate VOC",
      );
      const link = await migrateHandle.pool.query<{ id: string }>(
        `insert into core.entity_links (
          workspace_id, source_type, source_id, target_type, target_id,
          relation_type, visibility, status, managed_system_id, created_by
        ) values ($1, 'voc', $2, 'task', $3, 'evidence_of', 'internal_only', 'active', $4, $5)
        returning id`,
        [WORKSPACE_ID, voc.id, task.id, task.msId, adminActorId],
      );
      const idempotencyKey = randomUUID();
      const response = await patchTask(
        adminCookie,
        task.id,
        { status: "released" },
        {
          idempotencyKey,
          ifMatch: task.updatedAt,
        },
      );
      expect(response.statusCode).toBe(200);
      const jobs = await migrateHandle.pool.query<{
        data: Record<string, unknown>;
      }>(
        `select data from pgboss.job_common where name = 'tasks.create_public_update_review_candidates'`,
      );
      expect(jobs.rowCount).toBe(1);
      expect(jobs.rows[0]?.data).toMatchObject({
        workspace_id: WORKSPACE_ID,
        task_id: task.id,
        correlation_id: idempotencyKey,
        triggered_by_actor_id: adminActorId,
        linked_vocs: [{ voc_id: voc.id, entity_link_id: link.rows[0]?.id }],
      });
      const releaseEventId = jobs.rows[0]?.data.release_event_id;
      expect(releaseEventId).toEqual(expect.any(String));
      expect(releaseEventId).toMatch(UUID_PATTERN);
      const handler = releasedReviewCandidatesHandler({
        publicUpdateReviewCandidatesService: createPublicUpdateReviewCandidatesService({
          db: dbHandle.db,
          auditService: createAuditService(),
        }),
      });
      await handler([
        { data: asReleasedReviewCandidatesPayload(jobs.rows[0]?.data) },
      ]);
      const candidates = await migrateHandle.pool.query<{ release_event_id: string }>(
        `select release_event_id from voc.public_update_review_candidates
          where source_task_id = $1 and voc_id = $2`,
        [task.id, voc.id],
      );
      expect(candidates.rows).toEqual([{ release_event_id: releaseEventId }]);
    });

    it("publishes one two-VOC snapshot only for a real transition into released", async () => {
      const task = await seedTask("doing");
      const owner = await insertDevActor(dbHandle, WORKSPACE_ID, uid("release-owner"));
      const vocs = await Promise.all(
        ["First", "Second"].map((title) =>
          insertVocDirectly(migrateHandle, WORKSPACE_ID, task.msId, owner.id, title),
        ),
      );
      const links = await Promise.all(
        vocs.map((voc) =>
          migrateHandle.pool.query<{ id: string }>(
            `insert into core.entity_links (
              workspace_id, source_type, source_id, target_type, target_id,
              relation_type, visibility, status, managed_system_id, created_by
            ) values ($1, 'voc', $2, 'task', $3, 'evidence_of', 'internal_only', 'active', $4, $5)
            returning id`,
            [WORKSPACE_ID, voc.id, task.id, task.msId, adminActorId],
          ),
        ),
      );
      const key = randomUUID();
      const released = await patchTask(
        adminCookie,
        task.id,
        { status: "released" },
        { idempotencyKey: key, ifMatch: task.updatedAt },
      );
      expect(released.statusCode).toBe(200);
      const jobRows = await migrateHandle.pool.query<{ data: Record<string, unknown> }>(
        `select data from pgboss.job_common where name = 'tasks.create_public_update_review_candidates'`,
      );
      expect(jobRows.rowCount).toBe(1);
      expect(jobRows.rows[0]?.data).toMatchObject({
        correlation_id: key,
        triggered_by_actor_id: adminActorId,
        linked_vocs: [
          { voc_id: vocs[0]?.id, entity_link_id: links[0]?.rows[0]?.id },
          { voc_id: vocs[1]?.id, entity_link_id: links[1]?.rows[0]?.id },
        ],
      });
      const firstReleaseEventId = jobRows.rows[0]?.data.release_event_id;
      expect(firstReleaseEventId).toEqual(expect.any(String));
      expect(firstReleaseEventId).toMatch(UUID_PATTERN);
      const handler = releasedReviewCandidatesHandler({
        publicUpdateReviewCandidatesService: createPublicUpdateReviewCandidatesService({
          db: dbHandle.db,
          auditService: createAuditService(),
        }),
      });
      await handler([
        { data: asReleasedReviewCandidatesPayload(jobRows.rows[0]?.data) },
      ]);
      const persistedCandidates = await migrateHandle.pool.query<{ voc_id: string; release_event_id: string }>(
        `select voc_id, release_event_id
           from voc.public_update_review_candidates
          where source_task_id = $1
          order by voc_id`,
        [task.id],
      );
      expect(persistedCandidates.rows).toEqual(
        vocs.map((voc) => voc.id)
          .sort()
          .map((vocId) => ({ voc_id: vocId, release_event_id: firstReleaseEventId })),
      );

      const releaseBody = released.json<{ updated_at: string }>();
      const same = await patchTask(
        adminCookie,
        task.id,
        { status: "released" },
        { idempotencyKey: randomUUID(), ifMatch: releaseBody.updated_at },
      );
      expect(same.statusCode).toBe(200);
      const reopened = await patchTask(
        adminCookie,
        task.id,
        { status: "reopened" },
        { idempotencyKey: randomUUID(), ifMatch: releaseBody.updated_at },
      );
      expect(reopened.statusCode).toBe(200);
      const secondRelease = await patchTask(
        adminCookie,
        task.id,
        { status: "released" },
        { idempotencyKey: randomUUID(), ifMatch: reopened.json<{ updated_at: string }>().updated_at },
      );
      expect(secondRelease.statusCode).toBe(200);
      const releaseEvents = await migrateHandle.pool.query<{ data: Record<string, unknown> }>(
        `select data from pgboss.job_common
          where name = 'tasks.create_public_update_review_candidates'
          order by created_on`,
      );
      expect(releaseEvents.rowCount).toBe(2);
      const secondReleaseEventId = releaseEvents.rows[1]?.data.release_event_id;
      expect(secondReleaseEventId).toEqual(expect.any(String));
      expect(secondReleaseEventId).toMatch(UUID_PATTERN);
      expect(secondReleaseEventId).not.toBe(firstReleaseEventId);
      const replay = await patchTask(
        adminCookie,
        task.id,
        { status: "released" },
        { idempotencyKey: key, ifMatch: task.updatedAt },
      );
      expect(replay.statusCode).toBe(200);
      const after = await migrateHandle.pool.query(
        `select 1 from pgboss.job_common where name = 'tasks.create_public_update_review_candidates'`,
      );
      expect(after.rowCount).toBe(2);
    });

    it("does not publish for stale, unauthorized, or failed release mutations", async () => {
      const task = await seedTask("doing");
      const countJobs = async () =>
        migrateHandle.pool.query(
          `select 1 from pgboss.job_common where name = 'tasks.create_public_update_review_candidates'`,
        );
      const stale = await patchTask(
        adminCookie,
        task.id,
        { status: "released" },
        { idempotencyKey: randomUUID(), ifMatch: "2000-01-01T00:00:00.000Z" },
      );
      expect(stale.statusCode).toBe(409);
      expect((await countJobs()).rowCount).toBe(0);
      const dev = await insertDevActor(dbHandle, WORKSPACE_ID, uid("release-denied"));
      const denied = await patchTask(
        await loginAs(app, dev.externalId),
        task.id,
        { status: "released" },
        { idempotencyKey: randomUUID(), ifMatch: task.updatedAt },
      );
      expect(denied.statusCode).toBe(403);
      expect((await countJobs()).rowCount).toBe(0);
      const invalid = await patchTask(
        adminCookie,
        task.id,
        { status: "not-a-status" },
        { idempotencyKey: randomUUID(), ifMatch: task.updatedAt },
      );
      expect(invalid.statusCode).toBe(422);
      expect((await countJobs()).rowCount).toBe(0);
    });

    it("excludes detached links and archived VOCs from the release snapshot", async () => {
      const task = await seedTask("doing");
      const archivedVoc = await insertVocDirectly(
        migrateHandle,
        WORKSPACE_ID,
        task.msId,
        adminActorId,
        "Archived candidate VOC",
      );
      const detachedVoc = await insertVocDirectly(
        migrateHandle,
        WORKSPACE_ID,
        task.msId,
        adminActorId,
        "Detached candidate VOC",
      );
      await migrateHandle.pool.query(
        `update voc.vocs set archived_at = now() where id = $1`,
        [archivedVoc.id],
      );
      await migrateHandle.pool.query(
        `insert into core.entity_links (
          workspace_id, source_type, source_id, target_type, target_id,
          relation_type, visibility, status, managed_system_id, created_by
        ) values
          ($1, 'voc', $2, 'task', $4, 'evidence_of', 'internal_only', 'active', $5, $6),
          ($1, 'voc', $3, 'task', $4, 'evidence_of', 'internal_only', 'detached', $5, $6)`,
        [WORKSPACE_ID, archivedVoc.id, detachedVoc.id, task.id, task.msId, adminActorId],
      );
      const res = await patchTask(
        adminCookie,
        task.id,
        { status: "released" },
        { idempotencyKey: randomUUID(), ifMatch: task.updatedAt },
      );
      expect(res.statusCode).toBe(200);
      const jobs = await migrateHandle.pool.query(
        `select 1 from pgboss.job_common where name = 'tasks.create_public_update_review_candidates'`,
      );
      expect(jobs.rowCount).toBe(0);
    });

    it("rolls back the status and leaves zero jobs when enqueue fails inside the transaction", async () => {
      const task = await seedTask("doing");
      const voc = await insertVocDirectly(
        migrateHandle,
        WORKSPACE_ID,
        task.msId,
        adminActorId,
        "Rollback candidate VOC",
      );
      await migrateHandle.pool.query(
        `insert into core.entity_links (
          workspace_id, source_type, source_id, target_type, target_id,
          relation_type, visibility, status, managed_system_id, created_by
        ) values ($1, 'voc', $2, 'task', $3, 'evidence_of', 'internal_only', 'active', $4, $5)`,
        [WORKSPACE_ID, voc.id, task.id, task.msId, adminActorId],
      );
      await migrateHandle.pool.query(`
        create or replace function core.fail_issue_165_audit()
        returns trigger language plpgsql as $$
        begin
          raise exception 'forced audit failure after enqueue';
        end;
        $$;
        create trigger fail_issue_165_audit
          before insert on core.audit_log
          for each row execute function core.fail_issue_165_audit();
      `);
      try {
        const res = await patchTask(
          adminCookie,
          task.id,
          { status: "released" },
          { idempotencyKey: randomUUID(), ifMatch: task.updatedAt },
        );
        expect(res.statusCode).toBe(500);
        const taskAfter = await migrateHandle.pool.query<{ status: string }>(
          `select status from task.tasks where id = $1`,
          [task.id],
        );
        expect(taskAfter.rows[0]?.status).toBe("doing");
        const jobs = await migrateHandle.pool.query(
          `select 1 from pgboss.job_common where name = 'tasks.create_public_update_review_candidates'`,
        );
        expect(jobs.rowCount).toBe(0);
        const audits = await migrateHandle.pool.query(
          `select 1 from core.audit_log
            where event_type = 'task_status_changed' and subject_id = $1`,
          [task.id],
        );
        expect(audits.rowCount).toBe(0);
      } finally {
        await migrateHandle.pool.query(`
          drop trigger if exists fail_issue_165_audit on core.audit_log;
          drop function if exists core.fail_issue_165_audit();
        `);
      }
    });

    it("returns 404 for a missing task", async () => {
      const res = await patchTask(
        adminCookie,
        randomUUID(),
        { status: "doing" },
        {
          idempotencyKey: randomUUID(),
          ifMatch: new Date().toISOString(),
        },
      );
      expect(res.statusCode).toBe(404);
    });

    it("rejects an invalid or non-strict status body", async () => {
      const task = await seedTask();
      for (const body of [
        { status: "invalid" },
        { status: "doing", extra: true },
      ]) {
        const res = await patchTask(adminCookie, task.id, body, {
          idempotencyKey: randomUUID(),
          ifMatch: task.updatedAt,
        });
        expect(res.statusCode).toBe(422);
        expect(res.json<{ code: string }>().code).toBe("validation.failed");
      }
    });

    it("rejects a malformed If-Match header with the required-header validation shape", async () => {
      const task = await seedTask();
      const res = await patchTask(
        adminCookie,
        task.id,
        { status: "doing" },
        {
          idempotencyKey: randomUUID(),
          ifMatch: "not-an-iso-timestamp",
        },
      );

      expect(res.statusCode).toBe(422);
      expect(res.json()).toMatchObject({
        code: "validation.failed",
        detail: {
          fields: [{ path: ["headers", "if-match"], code: "required" }],
        },
      });
    });

    it("denies a Developer without finding.manage on the task Managed System", async () => {
      const task = await seedTask();
      const dev = await insertDevActor(
        dbHandle,
        WORKSPACE_ID,
        uid("mock-dev-task-status"),
      );
      const devCookie = await loginAs(app, dev.externalId);
      const res = await patchTask(
        devCookie,
        task.id,
        { status: "doing" },
        {
          idempotencyKey: randomUUID(),
          ifMatch: task.updatedAt,
        },
      );
      expect(res.statusCode).toBe(403);
      expect(res.json<{ code: string }>().code).toBe("permission.denied");
    });

    it("returns stale_write with current_updated_at for an authorised stale request", async () => {
      const task = await seedTask();
      const res = await patchTask(
        adminCookie,
        task.id,
        { status: "doing" },
        {
          idempotencyKey: randomUUID(),
          ifMatch: "2000-01-01T00:00:00.000Z",
        },
      );
      expect(res.statusCode).toBe(409);
      expect(res.json()).toMatchObject({
        code: "conflict.stale_write",
        detail: { current_updated_at: task.updatedAt },
      });
    });

    it("treats a same-status request as a no-op without an audit row", async () => {
      const task = await seedTask("todo");
      const res = await patchTask(
        adminCookie,
        task.id,
        { status: "todo" },
        {
          idempotencyKey: randomUUID(),
          ifMatch: task.updatedAt,
        },
      );
      expect(res.statusCode).toBe(200);
      expect(res.json()).toMatchObject({
        id: task.id,
        status: "todo",
        updated_at: task.updatedAt,
      });
      const audits = await dbHandle.pool.query<{ n: number }>(
        `select count(*)::int as n from core.audit_log where workspace_id = $1 and event_type = 'task_status_changed' and subject_id = $2`,
        [WORKSPACE_ID, task.id],
      );
      expect(audits.rows[0]?.n).toBe(0);
    });

    it("replays the cached response for the same key, body, and If-Match", async () => {
      const task = await seedTask();
      const key = randomUUID();
      const first = await patchTask(
        adminCookie,
        task.id,
        { status: "doing" },
        { idempotencyKey: key, ifMatch: task.updatedAt },
      );
      const second = await patchTask(
        adminCookie,
        task.id,
        { status: "doing" },
        { idempotencyKey: key, ifMatch: task.updatedAt },
      );
      expect(first.statusCode).toBe(200);
      expect(second.statusCode).toBe(200);
      expect(second.json()).toEqual(first.json());
    });

    it("requires both Idempotency-Key and If-Match headers", async () => {
      const task = await seedTask();
      const missingKey = await patchTask(
        adminCookie,
        task.id,
        { status: "doing" },
        { ifMatch: task.updatedAt },
      );
      const missingMatch = await patchTask(
        adminCookie,
        task.id,
        { status: "doing" },
        { idempotencyKey: randomUUID() },
      );
      expect(missingKey.statusCode).toBe(422);
      expect(missingMatch.statusCode).toBe(422);
    });
  },
);
