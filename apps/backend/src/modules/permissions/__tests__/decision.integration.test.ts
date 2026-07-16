import { randomUUID } from "node:crypto";

import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { loadConfig } from "../../../config.js";
import { type DbHandle, createDb } from "../../../db/client.js";
import { SESSION_COOKIE_NAME } from "../../../middleware/require-session.js";
import { buildServer } from "../../../server.js";
import { insertDevActor } from "../../voc/__tests__/_seed-helpers.js";
import { createCheckService } from "../check-service.js";

const APP_URL = process.env.DATABASE_URL ?? "";
const MIGRATE_URL = process.env.DATABASE_URL_MIGRATE ?? "";
const WORKSPACE_ID = process.env.WORKSPACE_ID ?? "";
const runIntegration = Boolean(APP_URL && MIGRATE_URL && WORKSPACE_ID);
const TEST_REASON = "perm-decision-it:";

function sessionCookie(setCookie: string | string[] | undefined): string {
  const values = Array.isArray(setCookie) ? setCookie : [setCookie];
  const value = values
    .find((entry) => entry)
    ?.match(new RegExp(`${SESSION_COOKIE_NAME}=([^;]+)`))?.[1];
  if (!value) throw new Error("mock login did not set a session cookie");
  return value;
}

async function loginAs(
  app: FastifyInstance,
  externalId: string,
): Promise<string> {
  const response = await app.inject({
    method: "POST",
    url: "/auth/mock-login",
    headers: { "user-agent": "permission-decision-integration-test" },
    payload: { external_id: externalId },
  });
  return sessionCookie(response.headers["set-cookie"]);
}

describe.skipIf(!runIntegration)("permission request decisions", () => {
  let db: DbHandle;
  let migrateDb: DbHandle;
  let app: FastifyInstance;
  let adminCookie: string;
  let adminId: string;
  let requesterId: string;
  let requesterExternalId: string;

  beforeAll(async () => {
    process.env.NODE_ENV = "test";
    db = createDb(APP_URL);
    migrateDb = createDb(MIGRATE_URL);
    app = await buildServer({ config: loadConfig(), dbHandle: db });
    await app.ready();
    adminCookie = await loginAs(app, "mock-admin-1");
    const admin = await db.pool.query<{ id: string }>(
      `select id from core.actors where workspace_id = $1 and external_id = 'mock-admin-1'`,
      [WORKSPACE_ID],
    );
    adminId = admin.rows[0]?.id ?? "";
    if (!adminId) throw new Error("mock admin missing");
  });

  beforeEach(async () => {
    const actor = await insertDevActor(
      db,
      WORKSPACE_ID,
      `perm-decision-${randomUUID()}`,
    );
    requesterId = actor.id;
    requesterExternalId = actor.externalId;
  });

  afterAll(async () => {
    await app?.close();
    await db?.close();
    await migrateDb?.close();
  });

  async function seedRequest(
    input: {
      capability?: string;
      managedSystemId?: string | null;
      status?: string;
    } = {},
  ): Promise<string> {
    const inserted = await db.pool.query<{ id: string }>(
      `insert into permission.permission_requests
        (workspace_id, requester_actor_id, requested_capability, requested_managed_system_id, reason, status)
       values ($1, $2, $3, $4, $5, $6) returning id`,
      [
        WORKSPACE_ID,
        requesterId,
        input.capability ?? "voc.read",
        input.managedSystemId ?? null,
        `${TEST_REASON}${randomUUID()}`,
        input.status ?? "pending",
      ],
    );
    return inserted.rows[0]?.id ?? "";
  }

  function decide(
    id: string,
    action: "approve" | "reject" | "need-more-info" | "deny",
    payload: Record<string, unknown>,
    cookie = adminCookie,
    key?: string,
  ) {
    return app.inject({
      method: "POST",
      url: `/permissions/requests/${id}/${action}`,
      headers: {
        cookie: `${SESSION_COOKIE_NAME}=${cookie}`,
        "content-type": "application/json",
        ...(key ? { "idempotency-key": key } : {}),
      },
      payload,
    });
  }

  async function requestStatus(id: string): Promise<string> {
    const result = await db.pool.query<{ status: string }>(
      "select status from permission.permission_requests where id = $1",
      [id],
    );
    return result.rows[0]?.status ?? "";
  }

  it("approve mints workspace and managed-system grants consumed by check-service", async () => {
    const workspaceRequest = await seedRequest();
    expect((await decide(workspaceRequest, "approve", {})).statusCode).toBe(
      200,
    );
    const check = createCheckService({ db: db.db });
    expect(
      await check.checkCapability(
        {
          actor_id: requesterId,
          workspace_id: WORKSPACE_ID,
          role_level: "developer",
        },
        "voc.read",
        { workspace_id: WORKSPACE_ID },
      ),
    ).toMatchObject({ allow: true, via: "direct_grant" });
    const approvalAudit = await db.pool.query<{ count: string }>(
      `select count(*) from core.audit_log where subject_id = $1 and event_type = 'permission_approved'`,
      [workspaceRequest],
    );
    expect(Number(approvalAudit.rows[0]?.count)).toBe(1);

    const managedSystem = await db.pool.query<{ id: string }>(
      `insert into core.managed_systems (workspace_id, slug, name) values ($1, $2, 'Decision Test MS') returning id`,
      [WORKSPACE_ID, `perm-decision-${randomUUID()}`],
    );
    const msId = managedSystem.rows[0]?.id ?? "";
    const scopedRequest = await seedRequest({
      managedSystemId: msId,
      capability: "finding.read",
    });
    expect((await decide(scopedRequest, "approve", {})).statusCode).toBe(200);
    expect(
      await check.checkCapability(
        {
          actor_id: requesterId,
          workspace_id: WORKSPACE_ID,
          role_level: "developer",
        },
        "finding.read",
        { workspace_id: WORKSPACE_ID, managed_system_id: msId },
      ),
    ).toMatchObject({ allow: true, via: "managed_system_scope" });
  });

  it("deny overrides an existing grant, transitions rejected, and is audited once", async () => {
    const id = await seedRequest();
    await db.pool.query(
      `insert into permission.permission_grants
        (workspace_id, actor_id, capability, granted_by_actor_id) values ($1, $2, 'voc.read', $3)`,
      [WORKSPACE_ID, requesterId, adminId],
    );
    const response = await decide(
      id,
      "deny",
      { reason: "Access explicitly denied." },
      adminCookie,
      randomUUID(),
    );
    expect(response.statusCode).toBe(200);
    expect(await requestStatus(id)).toBe("rejected");
    const decision = await createCheckService({ db: db.db }).checkCapability(
      {
        actor_id: requesterId,
        workspace_id: WORKSPACE_ID,
        role_level: "developer",
      },
      "voc.read",
      { workspace_id: WORKSPACE_ID },
    );
    expect(decision).toMatchObject({ allow: false, reason: "explicit_deny" });
    const audit = await db.pool.query<{ count: string }>(
      `select count(*) from core.audit_log where subject_id = $1 and event_type = 'permission_denied'`,
      [id],
    );
    expect(Number(audit.rows[0]?.count)).toBe(1);
  });

  it("reject and need-more-info only transition the request and mint no grant", async () => {
    const rejected = await seedRequest();
    const moreInfo = await seedRequest({ capability: "finding.read" });
    expect(
      (await decide(rejected, "reject", { reason: "Not justified." }))
        .statusCode,
    ).toBe(200);
    expect(
      (
        await decide(moreInfo, "need-more-info", {
          note: "Please provide scope.",
        })
      ).statusCode,
    ).toBe(200);
    expect(await requestStatus(rejected)).toBe("rejected");
    expect(await requestStatus(moreInfo)).toBe("needs_more_info");
    const grants = await db.pool.query<{ count: string }>(
      `select count(*) from permission.permission_grants where actor_id = $1 and capability in ('voc.read', 'finding.read')`,
      [requesterId],
    );
    expect(Number(grants.rows[0]?.count)).toBe(0);
    const audit = await db.pool.query<{ event_type: string; count: string }>(
      `select event_type, count(*) from core.audit_log
        where subject_id in ($1, $2)
        group by event_type`,
      [rejected, moreInfo],
    );
    expect(audit.rows).toEqual(
      expect.arrayContaining([
        { event_type: "permission_rejected", count: "1" },
        { event_type: "permission_needs_more_info", count: "1" },
      ]),
    );
  });

  it("enforces admin-only, stale-write, duplicate grant, idempotency, and reason gates", async () => {
    const developerCookie = await loginAs(app, requesterExternalId);
    for (const action of [
      "approve",
      "reject",
      "need-more-info",
      "deny",
    ] as const) {
      const id = await seedRequest({
        capability: action === "need-more-info" ? "finding.read" : "voc.read",
      });
      const payload =
        action === "need-more-info"
          ? { note: "n" }
          : action === "approve"
            ? {}
            : { reason: "r" };
      expect(
        (await decide(id, action, payload, developerCookie)).statusCode,
      ).toBe(403);
    }
    const approved = await seedRequest();
    expect((await decide(approved, "approve", {})).statusCode).toBe(200);
    expect(
      (await decide(approved, "reject", { reason: "late" })).json().code,
    ).toBe("conflict.stale_write");

    const duplicate = await seedRequest();
    expect((await decide(duplicate, "approve", {})).statusCode).toBe(409);
    expect((await decide(duplicate, "approve", {})).json().code).toBe(
      "conflict.capability_already_granted",
    );

    const keyed = await seedRequest({ capability: "finding.manage" });
    const key = randomUUID();
    const first = await decide(keyed, "approve", {}, adminCookie, key);
    const replay = await decide(keyed, "approve", {}, adminCookie, key);
    expect(replay.json()).toEqual(first.json());
    const grantCount = await db.pool.query<{ count: string }>(
      `select count(*) from permission.permission_grants where actor_id = $1 and capability = 'finding.manage'`,
      [requesterId],
    );
    expect(Number(grantCount.rows[0]?.count)).toBe(1);

    for (const [action, payload] of [
      ["reject", { reason: "" }],
      ["deny", { reason: "" }],
      ["need-more-info", { note: "" }],
    ] as const) {
      expect(
        (
          await decide(
            await seedRequest({ capability: "workspace.read" }),
            action,
            payload,
          )
        ).statusCode,
      ).toBe(400);
    }
    expect(
      (
        await decide(
          await seedRequest({ capability: "workspace.admin" }),
          "approve",
          {},
        )
      ).statusCode,
    ).toBe(400);
    expect(
      (
        await decide(
          await seedRequest({ capability: "workspace.read" }),
          "approve",
          {},
        )
      ).statusCode,
    ).toBe(200);
  });
});
