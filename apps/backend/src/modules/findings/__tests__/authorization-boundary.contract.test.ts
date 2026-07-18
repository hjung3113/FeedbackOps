import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { type DbHandle, createDb } from "../../../db/client.js";
import { HttpError } from "../../../lib/errors.js";
import { createAuditService } from "../../core/audit/audit-service.js";
import { createIdempotencyService } from "../../core/idempotency/idempotency-service.js";
import {
  createEntityLinksService,
  type EntityLinksService,
} from "../../entity-links/service.js";
import { insertFindingRow } from "./_seed-helpers.js";
import { createCheckService } from "../../permissions/check-service.js";
import { insertTaskRequestRow } from "../../task-requests/__tests__/_seed-helpers.js";
import {
  createTaskRequestsService,
  type TaskRequestsService,
} from "../../task-requests/service.js";
import { insertTaskRow } from "../../tasks/__tests__/_seed-helpers.js";
import { createTasksService, type TasksService } from "../../tasks/service.js";
import {
  cleanupVocClusterFixtures,
  insertActorRow,
  insertVocClusterRow,
} from "../../voc-clusters/__tests__/_seed-helpers.js";
import {
  createVocClustersService,
  type VocClustersService,
} from "../../voc-clusters/service.js";
import { insertVocDirectly } from "../../voc/__tests__/_seed-helpers.js";
import { createFindingsService, type FindingsService } from "../service.js";

const APP_URL = process.env.DATABASE_URL ?? "";
const MIGRATE_URL = process.env.DATABASE_URL_MIGRATE ?? "";
const runIntegration = Boolean(APP_URL && MIGRATE_URL);

if (!runIntegration) {
  console.warn(
    "[authorization-boundary] skipping integration suite — set DATABASE_URL and DATABASE_URL_MIGRATE to run.",
  );
}

type RoleLevel = "admin" | "developer" | "user";
type Actor = { actor_id: string; workspace_id: string; role_level: RoleLevel };

describe.skipIf(!runIntegration)(
  "Finding authorization consumer contract (#169)",
  () => {
    let dbHandle: DbHandle;
    let migrateHandle: DbHandle;
    let findingsService: FindingsService;
    let expiringFindingsService: FindingsService;
    let entityLinksService: EntityLinksService;
    let vocClustersService: VocClustersService;
    let tasksService: TasksService;
    let taskRequestsService: TaskRequestsService;
    let applicationNow = new Date("2040-01-01T00:00:00.000Z");

    const workspaceId = randomUUID();
    const actorIds: Record<string, string> = {};
    const managedSystemIds: string[] = [];
    const findingIds: string[] = [];
    const taskIds: string[] = [];
    const taskRequestIds: string[] = [];
    const clusterIds: string[] = [];
    const vocIds: string[] = [];
    const grantIds: string[] = [];
    const ids = {
      activeMs: "",
      archivedMs: "",
      activeFinding: "",
      archivedFinding: "",
      activeTask: "",
      archivedTask: "",
      activeTaskRequest: "",
      archivedTaskRequest: "",
      activeCluster: "",
      activeVoc: "",
    };

    function actor(name: string, role_level: RoleLevel): Actor {
      const actor_id = actorIds[name];
      if (!actor_id) throw new Error(`missing fixture actor: ${name}`);
      return { actor_id, workspace_id: workspaceId, role_level };
    }

    async function insertManagedSystem(
      slug: string,
      archived = false,
    ): Promise<string> {
      const result = await migrateHandle.pool.query<{ id: string }>(
        `insert into core.managed_systems (workspace_id, slug, name, archived_at)
       values ($1, $2, $3, $4)
       returning id`,
        [
          workspaceId,
          slug,
          slug,
          archived ? new Date("2039-12-01T00:00:00.000Z") : null,
        ],
      );
      const id = result.rows[0]?.id;
      if (!id) throw new Error(`seed managed system failed: ${slug}`);
      managedSystemIds.push(id);
      return id;
    }

    async function grant(
      actorId: string,
      capability: "finding.read" | "finding.manage",
      managedSystemId: string,
      expiresAt: Date | null = null,
    ): Promise<void> {
      const result = await migrateHandle.pool.query<{ id: string }>(
        `insert into permission.permission_grants (
          workspace_id, actor_id, capability, managed_system_id, expires_at, granted_by_actor_id
        ) values ($1, $2, $3, $4, $5, $6)
        returning id`,
        [
          workspaceId,
          actorId,
          capability,
          managedSystemId,
          expiresAt,
          actorIds.admin,
        ],
      );
      const id = result.rows[0]?.id;
      if (!id) throw new Error(`seed grant failed: ${capability}`);
      grantIds.push(id);
    }

    beforeAll(async () => {
      dbHandle = createDb(APP_URL);
      migrateHandle = createDb(MIGRATE_URL);
      const auditService = createAuditService();
      const idempotencyService = createIdempotencyService();
      const checkService = createCheckService({ db: dbHandle.db });
      const expiringCheckService = createCheckService({
        db: dbHandle.db,
        now: () => applicationNow,
      });

      entityLinksService = createEntityLinksService({
        db: dbHandle.db,
        auditService,
        checkService,
      });
      findingsService = createFindingsService({
        db: dbHandle.db,
        auditService,
        checkService,
        idempotencyService,
        entityLinksService,
      });
      expiringFindingsService = createFindingsService({
        db: dbHandle.db,
        auditService,
        checkService: expiringCheckService,
        idempotencyService,
        entityLinksService,
      });
      vocClustersService = createVocClustersService({
        db: dbHandle.db,
        auditService,
        checkService,
        idempotencyService,
      });
      tasksService = createTasksService({
        db: dbHandle.db,
        auditService,
        checkService,
        idempotencyService,
      });
      taskRequestsService = createTaskRequestsService({
        db: dbHandle.db,
        auditService,
        checkService,
        idempotencyService,
      });

      await migrateHandle.pool.query(
        "insert into core.workspaces (id, name) values ($1, $2)",
        [workspaceId, "Finding authorization consumer contract"],
      );

      for (const [name, roleLevel] of [
        ["admin", "admin"],
        ["scopedDeveloper", "developer"],
        ["unscopedDeveloper", "developer"],
        ["userWithGrant", "user"],
        ["reporterWithGrant", "user"],
        ["expiringDeveloper", "developer"],
      ] as const) {
        actorIds[name] = (
          await insertActorRow(migrateHandle, {
            workspaceId,
            externalId: `authorization-boundary-${name}-${workspaceId}`,
            roleLevel,
          })
        ).id;
      }

      ids.activeMs = await insertManagedSystem("authorization-boundary-active");
      ids.archivedMs = await insertManagedSystem(
        "authorization-boundary-archived",
        true,
      );

      for (const managedSystemId of [ids.activeMs, ids.archivedMs]) {
        await grant(actorIds.scopedDeveloper!, "finding.read", managedSystemId);
        await grant(
          actorIds.scopedDeveloper!,
          "finding.manage",
          managedSystemId,
        );
        await grant(actorIds.userWithGrant!, "finding.read", managedSystemId);
        await grant(actorIds.userWithGrant!, "finding.manage", managedSystemId);
      }
      await grant(actorIds.reporterWithGrant!, "finding.read", ids.activeMs);
      await grant(
        actorIds.expiringDeveloper!,
        "finding.read",
        ids.activeMs,
        new Date("2040-01-01T00:01:00.000Z"),
      );

      ids.activeFinding = (
        await insertFindingRow(migrateHandle, {
          workspaceId,
          primaryManagedSystemId: ids.activeMs,
          sourceId: randomUUID(),
          createdBy: actorIds.admin!,
        })
      ).id;
      ids.archivedFinding = (
        await insertFindingRow(migrateHandle, {
          workspaceId,
          primaryManagedSystemId: ids.archivedMs,
          sourceId: randomUUID(),
          createdBy: actorIds.admin!,
        })
      ).id;
      findingIds.push(ids.activeFinding, ids.archivedFinding);

      ids.activeTask = (
        await insertTaskRow(migrateHandle, {
          workspaceId,
          primaryManagedSystemId: ids.activeMs,
          createdBy: actorIds.admin!,
        })
      ).id;
      ids.archivedTask = (
        await insertTaskRow(migrateHandle, {
          workspaceId,
          primaryManagedSystemId: ids.archivedMs,
          createdBy: actorIds.admin!,
        })
      ).id;
      taskIds.push(ids.activeTask, ids.archivedTask);

      ids.activeTaskRequest = (
        await insertTaskRequestRow(migrateHandle, {
          workspaceId,
          sourceId: ids.activeFinding,
          primaryManagedSystemId: ids.activeMs,
          requesterActorId: actorIds.admin!,
        })
      ).id;
      ids.archivedTaskRequest = (
        await insertTaskRequestRow(migrateHandle, {
          workspaceId,
          sourceId: ids.archivedFinding,
          primaryManagedSystemId: ids.archivedMs,
          requesterActorId: actorIds.admin!,
        })
      ).id;
      taskRequestIds.push(ids.activeTaskRequest, ids.archivedTaskRequest);

      ids.activeCluster = (
        await insertVocClusterRow(migrateHandle, {
          workspaceId,
          primaryManagedSystemId: ids.activeMs,
          createdBy: actorIds.admin!,
        })
      ).id;
      clusterIds.push(ids.activeCluster);

      ids.activeVoc = (
        await insertVocDirectly(
          migrateHandle,
          workspaceId,
          ids.activeMs,
          actorIds.reporterWithGrant!,
          "Finding authorization boundary evidence VOC",
        )
      ).id;
      vocIds.push(ids.activeVoc);

      await migrateHandle.pool.query(
        `insert into core.entity_links (
          workspace_id, source_type, source_id, target_type, target_id,
          relation_type, visibility, status, managed_system_id, created_by
        ) values
          ($1, 'finding', $2, 'task', $3, 'requested_task', 'internal_only', 'active', $4, $5),
          ($1, 'finding', $6, 'task', $7, 'requested_task', 'internal_only', 'active', $8, $5),
          ($1, 'voc', $9, 'finding', $2, 'evidence_of', 'internal_only', 'active', $4, $5)`,
        [
          workspaceId,
          ids.activeFinding,
          ids.activeTask,
          ids.activeMs,
          actorIds.admin,
          ids.archivedFinding,
          ids.archivedTask,
          ids.archivedMs,
          ids.activeVoc,
        ],
      );
    });

    afterAll(async () => {
      if (migrateHandle) {
        await migrateHandle.pool.query(
          "delete from core.entity_links where workspace_id = $1",
          [workspaceId],
        );
        await migrateHandle.pool.query(
          "delete from task.tasks where id = any($1::uuid[])",
          [taskIds],
        );
        await migrateHandle.pool.query(
          "delete from task_request.task_requests where id = any($1::uuid[])",
          [taskRequestIds],
        );
        await cleanupVocClusterFixtures(migrateHandle, {
          workspaceId,
          actorIds: Object.values(actorIds),
          managedSystemIds,
          clusterIds,
          findingIds,
          vocIds,
          permissionGrantIds: grantIds,
          deleteWorkspace: true,
        });
      }
      await dbHandle?.close();
      await migrateHandle?.close();
    });

    it("uses the real Finding single-read consumer and its injected application clock", async () => {
      await expect(
        findingsService.getFinding({
          actor: actor("userWithGrant", "user"),
          findingId: ids.activeFinding,
        }),
      ).rejects.toMatchObject({
        code: "permission.denied",
      } satisfies Partial<HttpError>);
      await expect(
        findingsService.getFinding({
          actor: actor("unscopedDeveloper", "developer"),
          findingId: ids.activeFinding,
        }),
      ).rejects.toMatchObject({
        code: "permission.denied",
      } satisfies Partial<HttpError>);
      await expect(
        findingsService.getFinding({
          actor: actor("scopedDeveloper", "developer"),
          findingId: ids.activeFinding,
        }),
      ).resolves.toMatchObject({ id: ids.activeFinding });
      await expect(
        findingsService.getFinding({
          actor: actor("scopedDeveloper", "developer"),
          findingId: ids.archivedFinding,
        }),
      ).resolves.toMatchObject({ id: ids.archivedFinding });

      applicationNow = new Date("2040-01-01T00:00:00.000Z");
      await expect(
        expiringFindingsService.getFinding({
          actor: actor("expiringDeveloper", "developer"),
          findingId: ids.activeFinding,
        }),
      ).resolves.toMatchObject({ id: ids.activeFinding });
      applicationNow = new Date("2040-01-01T00:02:00.000Z");
      await expect(
        expiringFindingsService.getFinding({
          actor: actor("expiringDeveloper", "developer"),
          findingId: ids.activeFinding,
        }),
      ).rejects.toMatchObject({
        code: "permission.denied",
      } satisfies Partial<HttpError>);
    });

    it("keeps explicit-grant reporter visibility through Entity Links consumers", async () => {
      const listActiveFindingTargetLinks = (actorInput: Actor) =>
        entityLinksService.listLinks({
          actor: actorInput,
          endpoint: { type: "finding", id: ids.activeFinding },
          side: "target",
        });

      await expect(listActiveFindingTargetLinks(actor("reporterWithGrant", "user"))).resolves.toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            source_id: ids.activeVoc,
            source_type: "voc",
            target_id: ids.activeFinding,
            target_type: "finding",
            relation_type: "evidence_of",
            visibility_state: "allowed",
          }),
        ]),
      );
      await expect(
        listActiveFindingTargetLinks(actor("unscopedDeveloper", "developer")),
      ).rejects.toMatchObject({
        code: "not_found.record",
      } satisfies Partial<HttpError>);
      await expect(
        entityLinksService.listLinks({
          actor: actor("scopedDeveloper", "developer"),
          endpoint: { type: "finding", id: ids.activeFinding },
        }),
      ).resolves.toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            source_id: ids.activeFinding,
            relation_type: "requested_task",
          }),
        ]),
      );
      await expect(
        entityLinksService.listLinks({
          actor: actor("scopedDeveloper", "developer"),
          endpoint: { type: "finding", id: ids.archivedFinding },
        }),
      ).resolves.toEqual(
        expect.arrayContaining([
          expect.objectContaining({ source_id: ids.archivedFinding }),
        ]),
      );
    });

    it("keeps VOC Cluster on its intentional role-gated list-scope consumer", async () => {
      await expect(
        vocClustersService.getCluster({
          actor: actor("userWithGrant", "user"),
          clusterId: ids.activeCluster,
        }),
      ).rejects.toMatchObject({
        code: "not_found.record",
      } satisfies Partial<HttpError>);
      await expect(
        vocClustersService.getCluster({
          actor: actor("unscopedDeveloper", "developer"),
          clusterId: ids.activeCluster,
        }),
      ).rejects.toMatchObject({
        code: "not_found.record",
      } satisfies Partial<HttpError>);
      await expect(
        vocClustersService.getCluster({
          actor: actor("scopedDeveloper", "developer"),
          clusterId: ids.activeCluster,
        }),
      ).resolves.toMatchObject({ id: ids.activeCluster });
    });

    it("enforces role-gated Task point reads before delegated Finding manage decisions", async () => {
      await expect(
        tasksService.getTask({
          actor: actor("userWithGrant", "user"),
          taskId: ids.activeTask,
        }),
      ).rejects.toMatchObject({
        code: "permission.denied",
      } satisfies Partial<HttpError>);
      await expect(
        tasksService.getTask({
          actor: actor("unscopedDeveloper", "developer"),
          taskId: ids.activeTask,
        }),
      ).rejects.toMatchObject({
        code: "permission.denied",
      } satisfies Partial<HttpError>);
      await expect(
        tasksService.getTask({
          actor: actor("scopedDeveloper", "developer"),
          taskId: ids.activeTask,
        }),
      ).resolves.toMatchObject({ id: ids.activeTask });
      await expect(
        tasksService.getTask({
          actor: actor("scopedDeveloper", "developer"),
          taskId: ids.archivedTask,
        }),
      ).resolves.toMatchObject({ id: ids.archivedTask });
    });

    it("enforces Task Request consumer role gates and preserves archived point decisions", async () => {
      await expect(
        taskRequestsService.listTaskRequests({
          actor: actor("userWithGrant", "user"),
        }),
      ).rejects.toMatchObject({
        code: "permission.denied",
      } satisfies Partial<HttpError>);
      await expect(
        taskRequestsService.listTaskRequests({
          actor: actor("unscopedDeveloper", "developer"),
        }),
      ).resolves.toEqual({ items: [] });
      await expect(
        taskRequestsService.listTaskRequests({
          actor: actor("scopedDeveloper", "developer"),
        }),
      ).resolves.toMatchObject({
        items: expect.arrayContaining([
          expect.objectContaining({ id: ids.activeTaskRequest }),
          expect.objectContaining({ id: ids.archivedTaskRequest }),
        ]),
      });
    });

    it("locks the user-with-grant policy matrix for every Finding authorization consumer", async () => {
      const userWithGrant = actor("userWithGrant", "user");
      const reporterWithGrant = actor("reporterWithGrant", "user");
      const matrix = [
        ["entity-links", () => expect(entityLinksService.listLinks({ actor: reporterWithGrant, endpoint: { type: "finding", id: ids.activeFinding }, side: "target" })).resolves.toEqual(expect.arrayContaining([expect.objectContaining({ source_id: ids.activeVoc, target_id: ids.activeFinding, relation_type: "evidence_of", visibility_state: "allowed" })]))],
        ["voc-clusters", () => expect(vocClustersService.getCluster({ actor: userWithGrant, clusterId: ids.activeCluster })).rejects.toMatchObject({ code: "not_found.record" } satisfies Partial<HttpError>)],
        ["tasks", () => expect(tasksService.getTask({ actor: userWithGrant, taskId: ids.activeTask })).rejects.toMatchObject({ code: "permission.denied" } satisfies Partial<HttpError>)],
        ["task-requests", () => expect(taskRequestsService.listTaskRequests({ actor: userWithGrant })).rejects.toMatchObject({ code: "permission.denied" } satisfies Partial<HttpError>)],
      ] as const;

      expect(matrix.map(([surface]) => surface)).toEqual([
        "entity-links", "voc-clusters", "tasks", "task-requests",
      ]);
      for (const [, exercise] of matrix) await exercise();
    });
  },
);
