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

const APP_URL = process.env.DATABASE_URL ?? "";
const MIGRATE_URL = process.env.DATABASE_URL_MIGRATE ?? "";
const WORKSPACE_ID = process.env.WORKSPACE_ID ?? "";
const runIntegration = Boolean(APP_URL && MIGRATE_URL && WORKSPACE_ID);
const SLUG_PREFIX = "it-task-status";

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
        `delete from pgboss.job where name = 'tasks.create_public_update_review_candidates'`,
      );
      await migrateHandle.pool.query(
        `delete from voc.public_update_review_candidates where workspace_id = $1`,
        [WORKSPACE_ID],
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
      const response = await patchTask(
        adminCookie,
        task.id,
        { status: "released" },
        {
          idempotencyKey: randomUUID(),
          ifMatch: task.updatedAt,
        },
      );
      expect(response.statusCode).toBe(200);
      const jobs = await migrateHandle.pool.query<{
        data: Record<string, unknown>;
      }>(
        `select data from pgboss.job where name = 'tasks.create_public_update_review_candidates'`,
      );
      expect(jobs.rowCount).toBe(1);
      expect(jobs.rows[0]?.data).toMatchObject({
        workspace_id: WORKSPACE_ID,
        task_id: task.id,
        triggered_by_actor_id: adminActorId,
        linked_vocs: [{ voc_id: voc.id, entity_link_id: link.rows[0]?.id }],
      });
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
