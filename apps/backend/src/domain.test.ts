import request from "supertest";
import { describe, expect, it } from "vitest";
import { createApp } from "./app";
import { MvpStore } from "./mvp";
import { createStoreFromEnv, PostgresRelationalStore, type AppStore } from "./persistence";

const app = createApp();

function createIsolatedApp(): { app: ReturnType<typeof createApp>; store: MvpStore } {
  const store = new MvpStore();
  return { app: createApp(store), store };
}

describe("FeedbackOps backend MVP invariants", () => {
  it("requires managed_system_id when creating VOC", async () => {
    const response = await request(app)
      .post("/vocs")
      .set("x-actor-id", "user-tableau")
      .send({ title: "Slow dashboard", description: "The executive view times out." });

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe("validation_failed");
  });

  it("rejects reporter-submitted severity on VOC create", async () => {
    const response = await request(app)
      .post("/vocs")
      .set("x-actor-id", "user-tableau")
      .send({
        managed_system_id: "ms-tableau",
        title: "Slow dashboard",
        description: "The executive view times out.",
        severity: "high"
      });

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe("validation_failed");
  });

  it("validates analytics area belongs to the selected Managed System", async () => {
    const response = await request(app)
      .post("/vocs")
      .set("x-actor-id", "user-tableau")
      .send({
        managed_system_id: "ms-tableau",
        analytics_area_id: "aa-looker-revenue",
        title: "Wrong area",
        description: "The selected area belongs to another system."
      });

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe("validation_failed");
  });

  it("blocks sibling Managed System access for scoped actors", async () => {
    const response = await request(app)
      .get("/vocs?managed_system_id=ms-looker")
      .set("x-actor-id", "dev-tableau");

    expect(response.status).toBe(403);
    expect(response.body.error.code).toBe("permission_denied");
  });

  it("lets explicit deny override Admin-level allow", async () => {
    const response = await request(app)
      .get("/vocs?managed_system_id=ms-looker")
      .set("x-actor-id", "admin-denied-looker");

    expect(response.status).toBe(403);
    expect(response.body.error.code).toBe("permission_denied");
  });

  it("prevents reporter editing core VOC fields after triage begins", async () => {
    const created = await request(app)
      .post("/vocs")
      .set("x-actor-id", "user-tableau")
      .send({
        managed_system_id: "ms-tableau",
        title: "Missing filters",
        description: "The operational view needs region filters."
      });

    await request(app)
      .patch(`/vocs/${created.body.id}`)
      .set("x-actor-id", "admin")
      .send({ triage_state: "triaging", severity: "high" })
      .expect(200);

    const response = await request(app)
      .patch(`/vocs/${created.body.id}`)
      .set("x-actor-id", "user-tableau")
      .send({ title: "Edited after triage" });

    expect(response.status).toBe(409);
    expect(response.body.error.code).toBe("invalid_transition");
  });

  it("rejects generated_voc relation type and cross-workspace links", async () => {
    const forbiddenRelation = await request(app)
      .post("/entity-links")
      .set("x-actor-id", "admin")
      .send({
        source_type: "survey_response",
        source_id: "sr-1",
        target_type: "voc",
        target_id: "voc-1",
        relation_type: "generated_voc",
        visibility: "summary_visible"
      });

    expect(forbiddenRelation.status).toBe(400);
    expect(forbiddenRelation.body.error.code).toBe("validation_failed");

    const crossWorkspace = await request(app)
      .post("/entity-links")
      .set("x-actor-id", "admin")
      .send({
        source_type: "voc",
        source_id: "voc-seeded-tableau",
        target_type: "finding",
        target_id: "finding-other-workspace",
        relation_type: "created_finding",
        visibility: "summary_visible"
      });

    expect(crossWorkspace.status).toBe(400);
    expect(crossWorkspace.body.error.code).toBe("workspace_mismatch");
  });

  it("does not auto-resolve reporter-facing VOC status when tasks are done or released", async () => {
    const flow = await request(app)
      .post("/vocs/voc-seeded-tableau/request-task")
      .set("x-actor-id", "admin")
      .send({ title: "Repair dashboard cache" })
      .expect(201);

    await request(app)
      .post(`/task-requests/${flow.body.id}/approve`)
      .set("x-actor-id", "admin")
      .send({ reason: "Evidence is sufficient." })
      .expect(200);

    const converted = await request(app)
      .post(`/task-requests/${flow.body.id}/convert-to-task`)
      .set("x-actor-id", "admin")
      .send({})
      .expect(201);

    await request(app)
      .patch(`/tasks/${converted.body.id}`)
      .set("x-actor-id", "admin")
      .send({ status: "Released" })
      .expect(200);

    const voc = await request(app)
      .get("/vocs/voc-seeded-tableau")
      .set("x-actor-id", "admin")
      .expect(200);

    expect(voc.body.reporter_facing_status).toBe("검토 중");
  });

  it("does not expose Survey Response to VOC conversion", async () => {
    await request(app)
      .post("/survey-responses/sr-1/create-voc")
      .set("x-actor-id", "admin")
      .send({})
      .expect(404);
  });

  it("rejects and requests more evidence for Task Requests without creating Tasks", async () => {
    const rejectedRequest = await request(app)
      .post("/vocs/voc-seeded-tableau/request-task")
      .set("x-actor-id", "admin")
      .send({ title: "Reject this execution candidate" })
      .expect(201);

    const rejected = await request(app)
      .post(`/task-requests/${rejectedRequest.body.id}/reject`)
      .set("x-actor-id", "admin")
      .send({ reason: "The evidence does not justify execution yet." })
      .expect(200);

    expect(rejected.body.status).toBe("rejected");

    const rejectedConversion = await request(app)
      .post(`/task-requests/${rejectedRequest.body.id}/convert-to-task`)
      .set("x-actor-id", "admin")
      .send({});

    expect(rejectedConversion.status).toBe(409);
    expect(rejectedConversion.body.error.code).toBe("invalid_transition");

    const evidenceRequest = await request(app)
      .post("/vocs/voc-seeded-tableau/request-task")
      .set("x-actor-id", "admin")
      .send({ title: "Needs better source context" })
      .expect(201);

    const needsMoreEvidence = await request(app)
      .post(`/task-requests/${evidenceRequest.body.id}/request-more-evidence`)
      .set("x-actor-id", "admin")
      .send({ reason: "Attach source dashboards and recent failure examples." })
      .expect(200);

    expect(needsMoreEvidence.body.status).toBe("needs_more_evidence");

    const evidenceConversion = await request(app)
      .post(`/task-requests/${evidenceRequest.body.id}/convert-to-task`)
      .set("x-actor-id", "admin")
      .send({});

    expect(evidenceConversion.status).toBe(409);
    expect(evidenceConversion.body.error.code).toBe("invalid_transition");
  });

  it("requires approval before converting a Task Request to a Task", async () => {
    const taskRequest = await request(app)
      .post("/vocs/voc-seeded-tableau/request-task")
      .set("x-actor-id", "admin")
      .send({ title: "Do not auto approve this request" })
      .expect(201);

    const response = await request(app)
      .post(`/task-requests/${taskRequest.body.id}/convert-to-task`)
      .set("x-actor-id", "admin")
      .send({});

    expect(response.status).toBe(409);
    expect(response.body.error.code).toBe("invalid_transition");
  });

  it("requires review reasons for Task Request approvals", async () => {
    const taskRequest = await request(app)
      .post("/vocs/voc-seeded-tableau/request-task")
      .set("x-actor-id", "admin")
      .send({ title: "Approval needs an audit reason" })
      .expect(201);

    const response = await request(app)
      .post(`/task-requests/${taskRequest.body.id}/approve`)
      .set("x-actor-id", "admin")
      .send({});

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe("validation_failed");
  });

  it("requires explicit self-approval capability and reason for Developer-owned Task Requests", async () => {
    const taskRequest = await request(app)
      .post("/vocs/voc-seeded-tableau/request-task")
      .set("x-actor-id", "dev-tableau")
      .send({ title: "Developer requested work" })
      .expect(201);

    const withoutCapability = await request(app)
      .post(`/task-requests/${taskRequest.body.id}/approve`)
      .set("x-actor-id", "dev-tableau")
      .send({ reason: "I own the context." });

    expect(withoutCapability.status).toBe(403);
    expect(withoutCapability.body.error.code).toBe("permission_denied");

    const privilegedRequest = await request(app)
      .post("/vocs/voc-seeded-tableau/request-task")
      .set("x-actor-id", "dev-tableau-self-approve")
      .send({ title: "Privileged developer requested work" })
      .expect(201);

    const withoutReason = await request(app)
      .post(`/task-requests/${privilegedRequest.body.id}/approve`)
      .set("x-actor-id", "dev-tableau-self-approve")
      .send({});

    expect(withoutReason.status).toBe(400);
    expect(withoutReason.body.error.code).toBe("validation_failed");
  });

  it("exposes required Task Request and Task detail and create endpoints", async () => {
    const taskRequest = await request(app)
      .post("/task-requests")
      .set("x-actor-id", "admin")
      .send({
        managed_system_id: "ms-tableau",
        title: "Standalone execution candidate",
        source_type: "finding",
        source_id: "finding-seeded-tableau"
      })
      .expect(201);

    await request(app).get(`/task-requests/${taskRequest.body.id}`).set("x-actor-id", "admin").expect(200);

    await request(app)
      .post(`/task-requests/${taskRequest.body.id}/approve`)
      .set("x-actor-id", "admin")
      .send({ reason: "Evidence is sufficient." })
      .expect(200);

    const task = await request(app)
      .post(`/task-requests/${taskRequest.body.id}/convert-to-task`)
      .set("x-actor-id", "admin")
      .send({})
      .expect(201);

    await request(app).get(`/tasks/${task.body.id}`).set("x-actor-id", "admin").expect(200);

    await request(app)
      .post("/tasks")
      .set("x-actor-id", "admin")
      .send({ managed_system_id: "ms-tableau", title: "Standalone backstage task" })
      .expect(201);
  });

  it("selects Postgres-backed persistence when DATABASE_URL is configured", () => {
    const store = createStoreFromEnv({ DATABASE_URL: "postgres://feedbackops:feedbackops@localhost:5432/feedbackops" });

    expect(store.persistence).toBe("postgres");
  });

  it("does not acknowledge successful mutations when persistence fails", async () => {
    const store = new MvpStore() as AppStore;
    store.persist = async () => {
      throw new Error("write failed");
    };
    const failingPersistenceApp = createApp(store);

    const response = await request(failingPersistenceApp)
      .post("/vocs")
      .set("x-actor-id", "user-tableau")
      .send({
        managed_system_id: "ms-tableau",
        title: "Persistence should gate response",
        description: "The API must not send 201 before durable write succeeds."
      });

    expect(response.status).toBe(500);
    expect(response.body.error.message).toContain("write failed");
  });

  it("hydrates Postgres mode from normalized relational tables instead of app_state", async () => {
    const queries: string[] = [];
    const pool = {
      query: async (sql: string) => {
        queries.push(sql);
        if (sql.includes("from core.actors")) {
          return { rows: [{ id: "seed-admin", workspace_id: "ws-seed", name: "Seed Admin", role_level: "Admin" }], rowCount: 1 };
        }
        if (sql.includes("from permission.permission_grants")) return { rows: [], rowCount: 0 };
        if (sql.includes("from permission.permission_denies")) return { rows: [], rowCount: 0 };
        if (sql.includes("from core.managed_systems")) {
          return { rows: [{ id: "ms-seed", workspace_id: "ws-seed", name: "Seed System", archived: false }], rowCount: 1 };
        }
        if (sql.includes("from core.analytics_areas")) return { rows: [], rowCount: 0 };
        if (sql.includes("from voc.vocs")) {
          return {
            rows: [
              {
                id: "voc-relational",
                workspace_id: "ws-seed",
                managed_system_id: "ms-seed",
                analytics_area_id: null,
                reporter_id: "seed-admin",
                title: "Relational VOC",
                description: "Loaded from voc.vocs",
                source_context: null,
                severity: "medium",
                triage_state: "triaging",
                reporter_facing_status: "검토 중",
                owner_id: null
              }
            ],
            rowCount: 1
          };
        }
        return { rows: [], rowCount: 0 };
      },
      end: async () => {}
    };

    const store = new PostgresRelationalStore(pool);
    await store.ready;

    expect(store.getVoc(store.actor("seed-admin"), "voc-relational").title).toBe("Relational VOC");
    expect(queries.some((sql) => sql.includes("core.app_state"))).toBe(false);
  });
});

describe("FeedbackOps backend reviewer blocker coverage", () => {
  it("blocks Users from internal Finding and Task execution surfaces while preserving Admin and scoped Developer access", async () => {
    const { app } = createIsolatedApp();

    const userFinding = await request(app)
      .post("/vocs/voc-seeded-tableau/create-finding")
      .set("x-actor-id", "user-tableau")
      .send({ title: "Reporter should not synthesize findings" });
    expect(userFinding.status).toBe(403);
    expect(userFinding.body.error.code).toBe("permission_denied");

    const userVocTaskRequest = await request(app)
      .post("/vocs/voc-seeded-tableau/request-task")
      .set("x-actor-id", "user-tableau")
      .send({ title: "Reporter should not request execution" });
    expect(userVocTaskRequest.status).toBe(403);
    expect(userVocTaskRequest.body.error.code).toBe("permission_denied");

    const userFindingTaskRequest = await request(app)
      .post("/findings/finding-seeded-tableau/request-task")
      .set("x-actor-id", "user-tableau")
      .send({ title: "Reporter should not request execution from findings" });
    expect(userFindingTaskRequest.status).toBe(403);
    expect(userFindingTaskRequest.body.error.code).toBe("permission_denied");

    const userFindings = await request(app).get("/findings").set("x-actor-id", "user-tableau");
    expect(userFindings.status).toBe(403);
    expect(userFindings.body.error.code).toBe("permission_denied");

    const userFindingDetail = await request(app).get("/findings/finding-seeded-tableau").set("x-actor-id", "user-tableau");
    expect(userFindingDetail.status).toBe(403);
    expect(userFindingDetail.body.error.code).toBe("permission_denied");

    const task = await request(app)
      .post("/tasks")
      .set("x-actor-id", "admin")
      .send({ managed_system_id: "ms-tableau", title: "Internal task for access checks" })
      .expect(201);

    const userTasks = await request(app).get("/tasks").set("x-actor-id", "user-tableau");
    expect(userTasks.status).toBe(403);
    expect(userTasks.body.error.code).toBe("permission_denied");

    const userTaskDetail = await request(app).get(`/tasks/${task.body.id}`).set("x-actor-id", "user-tableau");
    expect(userTaskDetail.status).toBe(403);
    expect(userTaskDetail.body.error.code).toBe("permission_denied");

    await request(app)
      .post("/vocs/voc-seeded-tableau/create-finding")
      .set("x-actor-id", "dev-tableau")
      .send({ title: "Developer can synthesize finding" })
      .expect(201);
    await request(app).get("/findings").set("x-actor-id", "dev-tableau").expect(200);
    await request(app).get(`/tasks/${task.body.id}`).set("x-actor-id", "dev-tableau").expect(200);
    await request(app).get("/tasks").set("x-actor-id", "admin").expect(200);
  });

  it("disables non-persistent VOC cluster mutation endpoints while preserving direct VOC to Finding flow", async () => {
    const { app } = createIsolatedApp();

    const cluster = await request(app)
      .post("/voc-clusters")
      .set("x-actor-id", "admin")
      .send({ managed_system_id: "ms-tableau", title: "Performance complaints", voc_ids: ["voc-seeded-tableau"] });
    expect(cluster.status).toBe(410);
    expect(cluster.body.error.code).toBe("not_found");

    const clusterFinding = await request(app)
      .post("/voc-clusters/voc-cluster-0001/create-finding")
      .set("x-actor-id", "admin")
      .send({ title: "Cluster finding" });
    expect(clusterFinding.status).toBe(410);
    expect(clusterFinding.body.error.code).toBe("not_found");

    await request(app)
      .post("/vocs/voc-seeded-tableau/create-finding")
      .set("x-actor-id", "admin")
      .send({ title: "Direct VOC finding", summary: "Direct synthesis remains available." })
      .expect(201);
  });

  it("continues Postgres relational persistence after one failed save", async () => {
    const loadSql = [
      "from core.actors",
      "from permission.permission_grants",
      "from permission.permission_denies",
      "from core.managed_systems",
      "from core.analytics_areas",
      "from voc.vocs",
      "from voc.voc_conversation_entries",
      "from finding.findings",
      "from task.task_requests",
      "from task.tasks",
      "from permission.permission_requests",
      "from core.entity_links",
      "from core.audit_logs"
    ];
    const saveAttempts: string[] = [];
    const pool = {
      query: async (sql: string) => {
        if (sql.trimStart().startsWith("select") && loadSql.some((fragment) => sql.includes(fragment))) {
          if (sql.includes("from core.actors")) {
            return { rows: [{ id: "seed-admin", workspace_id: "ws-seed", name: "Seed Admin", role_level: "Admin" }], rowCount: 1 };
          }
          return { rows: [], rowCount: 0 };
        }
        saveAttempts.push(sql);
        if (sql === "delete from core.entity_links" && saveAttempts.filter((attempt) => attempt === "begin").length === 1) {
          throw new Error("first save failed");
        }
        return { rows: [], rowCount: 0 };
      },
      end: async () => {}
    };

    const store = new PostgresRelationalStore(pool);
    await store.ready;

    await expect(store.persist()).rejects.toThrow("first save failed");
    await expect(store.persist()).resolves.toBeUndefined();
    expect(saveAttempts.filter((sql) => sql === "begin")).toHaveLength(2);
    expect(saveAttempts).toContain("commit");
  });

  it("focuses Users on their own VOCs while Admin and scoped Developer can still see same-system VOCs", async () => {
    const { app, store } = createIsolatedApp();
    store.actors.set("user-tableau-2", {
      id: "user-tableau-2",
      workspaceId: "ws-main",
      name: "Second Reporter",
      roleLevel: "User",
      managedSystemIds: ["ms-tableau"]
    });
    store.vocs.set("voc-other-reporter", {
      id: "voc-other-reporter",
      workspaceId: "ws-main",
      managedSystemId: "ms-tableau",
      reporterId: "user-tableau-2",
      title: "Other reporter VOC",
      description: "Same system, different reporter.",
      triageState: "new",
      reporterFacingStatus: "접수됨"
    });

    const userList = await request(app).get("/vocs?managed_system_id=ms-tableau").set("x-actor-id", "user-tableau").expect(200);
    expect(userList.body).toEqual(expect.arrayContaining([expect.objectContaining({ id: "voc-seeded-tableau" })]));
    expect(userList.body).not.toEqual(expect.arrayContaining([expect.objectContaining({ id: "voc-other-reporter" })]));

    const userRead = await request(app).get("/vocs/voc-other-reporter").set("x-actor-id", "user-tableau");
    expect(userRead.status).toBe(403);
    expect(userRead.body.error.code).toBe("permission_denied");

    await request(app).get("/vocs/voc-other-reporter").set("x-actor-id", "admin").expect(200);
    await request(app).get("/vocs/voc-other-reporter").set("x-actor-id", "dev-tableau").expect(200);
  });

  it("denies Users access to Task Request lists", async () => {
    const { app } = createIsolatedApp();

    const response = await request(app).get("/task-requests").set("x-actor-id", "user-tableau");

    expect(response.status).toBe(403);
    expect(response.body.error.code).toBe("permission_denied");
  });

  it("validates standalone Task Request source, creates its entity link, and audits creation", async () => {
    const { app, store } = createIsolatedApp();
    const created = await request(app)
      .post("/task-requests")
      .set("x-actor-id", "admin")
      .send({
        managed_system_id: "ms-tableau",
        title: "Standalone linked candidate",
        source_type: "finding",
        source_id: "finding-seeded-tableau"
      })
      .expect(201);

    expect([...store.links.values()]).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          sourceType: "finding",
          sourceId: "finding-seeded-tableau",
          targetType: "task_request",
          targetId: created.body.id,
          relationType: "requested_task"
        })
      ])
    );
    expect(store.auditEvents).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: "task_request_created",
          metadata: expect.objectContaining({
            task_request_id: created.body.id,
            source_entity: { type: "finding", id: "finding-seeded-tableau" },
            managed_system_id: "ms-tableau"
          })
        })
      ])
    );
  });

  it("rejects standalone Task Requests when source is missing", async () => {
    const { app } = createIsolatedApp();

    const response = await request(app)
      .post("/task-requests")
      .set("x-actor-id", "admin")
      .send({
        managed_system_id: "ms-tableau",
        title: "Broken candidate",
        source_type: "finding",
        source_id: "finding-missing"
      });

    expect(response.status).toBe(404);
    expect(response.body.error.code).toBe("not_found");
  });

  it("audits explicit-capability self-approval metadata", async () => {
    const { app, store } = createIsolatedApp();
    const taskRequest = await request(app)
      .post("/vocs/voc-seeded-tableau/request-task")
      .set("x-actor-id", "dev-tableau-self-approve")
      .send({ title: "Privileged developer self-approved work" })
      .expect(201);

    await request(app)
      .post(`/task-requests/${taskRequest.body.id}/approve`)
      .set("x-actor-id", "dev-tableau-self-approve")
      .send({ reason: "I have explicit self-approval for this Managed System." })
      .expect(200);

    expect(store.auditEvents).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: "task_request_approved",
          metadata: expect.objectContaining({
            task_request_id: taskRequest.body.id,
            self_approved: true,
            reason: "I have explicit self-approval for this Managed System.",
            source_entity: { type: "voc", id: "voc-seeded-tableau" },
            managed_system_id: "ms-tableau"
          })
        })
      ])
    );
  });
});

describe("FeedbackOps backend VOC-to-execution flow", () => {
  it("exposes minimum MVP API surfaces from the implementation contract", async () => {
    await request(app).get("/managed-systems").set("x-actor-id", "admin").expect(200);
    await request(app).get("/analytics-areas?managed_system_id=ms-tableau").set("x-actor-id", "admin").expect(200);

    const permissionRequest = await request(app)
      .post("/permission-requests")
      .set("x-actor-id", "user-tableau")
      .send({ managed_system_id: "ms-tableau", reason: "Need to inspect follow-up work." })
      .expect(201);

    await request(app).get("/permission-requests").set("x-actor-id", "admin").expect(200);
    await request(app).post(`/permission-requests/${permissionRequest.body.id}/approve`).set("x-actor-id", "admin").send({}).expect(200);

    const finding = await request(app)
      .post("/vocs/voc-seeded-tableau/create-finding")
      .set("x-actor-id", "admin")
      .send({ title: "Direct VOC finding", summary: "Single VOC has enough evidence." })
      .expect(201);

    await request(app).get("/findings").set("x-actor-id", "admin").expect(200);
    await request(app).get(`/findings/${finding.body.id}`).set("x-actor-id", "admin").expect(200);
    await request(app).get("/task-requests").set("x-actor-id", "admin").expect(200);
    await request(app).get("/tasks").set("x-actor-id", "admin").expect(200);
  });

  it("preserves source context from VOC to finding to reviewed backlog task", async () => {
    const finding = await request(app)
      .post("/vocs/voc-seeded-tableau/create-finding")
      .set("x-actor-id", "admin")
      .send({ title: "Tableau dashboard performance regression", summary: "Repeated complaints point to cache misses." })
      .expect(201);

    const requestTask = await request(app)
      .post(`/findings/${finding.body.id}/request-task`)
      .set("x-actor-id", "admin")
      .send({ title: "Investigate cache regression" })
      .expect(201);

    await request(app)
      .post(`/task-requests/${requestTask.body.id}/approve`)
      .set("x-actor-id", "admin")
      .send({ reason: "Evidence is sufficient." })
      .expect(200);

    const task = await request(app)
      .post(`/task-requests/${requestTask.body.id}/convert-to-task`)
      .set("x-actor-id", "admin")
      .send({})
      .expect(201);

    expect(task.body.status).toBe("Backlog");

    const links = await request(app)
      .get("/entity-links")
      .set("x-actor-id", "admin")
      .expect(200);

    expect(links.body).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ source_id: "voc-seeded-tableau", target_id: finding.body.id, relation_type: "created_finding" }),
        expect.objectContaining({ source_id: finding.body.id, target_id: requestTask.body.id, relation_type: "requested_task" }),
        expect.objectContaining({ source_id: requestTask.body.id, target_id: task.body.id, relation_type: "converted_to_task" })
      ])
    );
  });

  it("separates public updates, reporter replies, internal comments, and reporter summaries", async () => {
    await request(app)
      .post("/vocs/voc-seeded-tableau/public-updates")
      .set("x-actor-id", "admin")
      .send({ body: "We are reviewing the cache behavior." })
      .expect(201);

    await request(app)
      .post("/vocs/voc-seeded-tableau/reporter-replies")
      .set("x-actor-id", "user-tableau")
      .send({ body: "This affects the Monday report." })
      .expect(201);

    await request(app)
      .post("/vocs/voc-seeded-tableau/internal-comments")
      .set("x-actor-id", "admin")
      .send({ body: "Private severity and developer notes." })
      .expect(201);

    const summary = await request(app)
      .get("/vocs/voc-seeded-tableau/reporter-summary")
      .set("x-actor-id", "user-tableau")
      .expect(200);

    expect(summary.body).toEqual({
      public_title: "Seeded Tableau VOC",
      reporter_facing_status: "검토 중",
      owning_team_public_name: "Analytics Platform",
      last_public_update_at: expect.any(String),
      public_update_excerpt: "We are reviewing the cache behavior."
    });
    expect(JSON.stringify(summary.body)).not.toContain("Private severity");
    expect(JSON.stringify(summary.body)).not.toContain("Released");
    expect(JSON.stringify(summary.body)).not.toContain("high");
  });

  it("shows and repairs high-severity follow-up dashboard queues", async () => {
    const before = await request(app).get("/dashboard/action-queues").set("x-actor-id", "admin").expect(200);

    expect(before.body.high_severity_follow_up).toEqual(
      expect.arrayContaining([expect.objectContaining({ id: "voc-high-unlinked", next_action: "Create Finding or Task Request" })])
    );

    await request(app)
      .post("/vocs/voc-high-unlinked/request-task")
      .set("x-actor-id", "admin")
      .send({ title: "Follow up high severity issue" })
      .expect(201);

    const after = await request(app).get("/dashboard/action-queues").set("x-actor-id", "admin").expect(200);

    expect(after.body.high_severity_follow_up).not.toEqual(
      expect.arrayContaining([expect.objectContaining({ id: "voc-high-unlinked" })])
    );
  });
});
