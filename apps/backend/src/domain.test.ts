import request from "supertest";
import { describe, expect, it } from "vitest";
import { createApp } from "./app";
import { createStoreFromEnv } from "./persistence";

const app = createApp();

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

  it("selects Postgres-backed persistence when DATABASE_URL is configured", () => {
    const store = createStoreFromEnv({ DATABASE_URL: "postgres://feedbackops:feedbackops@localhost:5432/feedbackops" });

    expect(store.persistence).toBe("postgres");
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

  it("preserves source context from VOC cluster to finding to reviewed backlog task", async () => {
    const cluster = await request(app)
      .post("/voc-clusters")
      .set("x-actor-id", "admin")
      .send({ managed_system_id: "ms-tableau", title: "Performance complaints", voc_ids: ["voc-seeded-tableau"] })
      .expect(201);

    const finding = await request(app)
      .post(`/voc-clusters/${cluster.body.id}/create-finding`)
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
        expect.objectContaining({ source_id: cluster.body.id, target_id: finding.body.id, relation_type: "created_finding" }),
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
