import {
  type Actor,
  type AnalyticsArea,
  type ConversationEntry,
  type EntityLink,
  type Finding,
  type ManagedSystem,
  type RelationType,
  type Severity,
  type Task,
  type TaskRequest,
  type TaskStatus,
  type Voc,
  isForbiddenRelationType,
  richContentHasUnsafeInlineImage
} from "@feedbackops/shared";

type ApiErrorCode =
  | "validation_failed"
  | "unauthorized"
  | "permission_denied"
  | "not_found"
  | "workspace_mismatch"
  | "conflict"
  | "invalid_transition";

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: ApiErrorCode,
    message: string
  ) {
    super(message);
  }
}

interface VocCluster {
  id: string;
  workspaceId: string;
  managedSystemId: string;
  title: string;
  vocIds: string[];
}

interface AuditEvent {
  id: string;
  workspaceId: string;
  type: string;
  metadata: Record<string, unknown>;
}

interface PermissionRequest {
  id: string;
  workspaceId: string;
  managedSystemId: string;
  requesterId: string;
  reason: string;
  status: "pending" | "approved" | "rejected" | "revoked";
}

const now = () => new Date().toISOString();

function makeId(prefix: string, count: number): string {
  return `${prefix}-${count.toString().padStart(4, "0")}`;
}

export class MvpStore {
  persistence: "memory" | "postgres" = "memory";

  actors = new Map<string, Actor>();
  managedSystems = new Map<string, ManagedSystem>();
  analyticsAreas = new Map<string, AnalyticsArea>();
  vocs = new Map<string, Voc>();
  conversations = new Map<string, ConversationEntry[]>();
  clusters = new Map<string, VocCluster>();
  links = new Map<string, EntityLink>();
  findings = new Map<string, Finding>();
  taskRequests = new Map<string, TaskRequest>();
  tasks = new Map<string, Task>();
  permissionRequests = new Map<string, PermissionRequest>();
  auditEvents: AuditEvent[] = [];

  protected counters = {
    voc: 1,
    conversation: 1,
    cluster: 1,
    link: 1,
    finding: 1,
    taskRequest: 1,
    task: 1,
    permissionRequest: 1,
    audit: 1
  };

  constructor() {
    this.seed();
  }

  actor(actorId?: string): Actor {
    if (!actorId) {
      throw new ApiError(401, "unauthorized", "Missing actor.");
    }
    const actor = this.actors.get(actorId);
    if (!actor) {
      throw new ApiError(401, "unauthorized", "Unknown actor.");
    }
    return actor;
  }

  canAccessManagedSystem(actor: Actor, managedSystemId: string): boolean {
    if (actor.explicitDeniedManagedSystemIds?.includes(managedSystemId)) {
      return false;
    }
    if (actor.roleLevel === "Admin") {
      return true;
    }
    return actor.managedSystemIds.includes(managedSystemId);
  }

  assertManagedSystemAccess(actor: Actor, managedSystemId: string): void {
    if (!this.canAccessManagedSystem(actor, managedSystemId)) {
      throw new ApiError(403, "permission_denied", "Actor cannot access this Managed System.");
    }
  }

  createVoc(actor: Actor, body: Record<string, unknown>): Voc {
    const managedSystemId = String(body.managed_system_id ?? "");
    if (!managedSystemId || !body.title || !body.description) {
      throw new ApiError(400, "validation_failed", "managed_system_id, title, and description are required.");
    }
    if ("severity" in body || "reporter_id" in body || "reporter_facing_status" in body || "task_status" in body) {
      throw new ApiError(400, "validation_failed", "Reporter cannot set server-owned VOC fields.");
    }
    if (richContentHasUnsafeInlineImage(String(body.description))) {
      throw new ApiError(400, "validation_failed", "Rich content cannot include unsafe inline images.");
    }
    this.assertManagedSystemAccess(actor, managedSystemId);
    this.assertAnalyticsAreaMatches(String(body.analytics_area_id ?? ""), managedSystemId);

    const voc: Voc = {
      id: makeId("voc", this.counters.voc++),
      workspaceId: actor.workspaceId,
      managedSystemId,
      analyticsAreaId: body.analytics_area_id ? String(body.analytics_area_id) : undefined,
      reporterId: actor.id,
      title: String(body.title),
      description: String(body.description),
      sourceContext: body.source_context as Voc["sourceContext"],
      triageState: "new",
      reporterFacingStatus: "접수됨"
    };
    this.vocs.set(voc.id, voc);
    this.audit(actor.workspaceId, "voc_created", { voc_id: voc.id, managed_system_id: managedSystemId });
    return voc;
  }

  listVocs(actor: Actor, managedSystemId?: string): Voc[] {
    if (managedSystemId && managedSystemId !== "all") {
      this.assertManagedSystemAccess(actor, managedSystemId);
    }
    return [...this.vocs.values()].filter((voc) => {
      if (voc.workspaceId !== actor.workspaceId) return false;
      if (managedSystemId && managedSystemId !== "all" && voc.managedSystemId !== managedSystemId) return false;
      return this.canAccessManagedSystem(actor, voc.managedSystemId);
    });
  }

  getVoc(actor: Actor, id: string): Voc {
    const voc = this.vocs.get(id);
    if (!voc || voc.workspaceId !== actor.workspaceId) {
      throw new ApiError(404, "not_found", "VOC not found.");
    }
    this.assertManagedSystemAccess(actor, voc.managedSystemId);
    return voc;
  }

  patchVoc(actor: Actor, id: string, body: Record<string, unknown>): Voc {
    const voc = this.getVoc(actor, id);
    const isReporter = voc.reporterId === actor.id;
    if (isReporter && voc.triageState !== "new" && ("title" in body || "description" in body || "attachments" in body)) {
      throw new ApiError(409, "invalid_transition", "Reporter cannot edit core fields after triage begins.");
    }
    if (("triage_state" in body || "severity" in body || "owner_id" in body) && actor.roleLevel === "User") {
      throw new ApiError(403, "permission_denied", "Reporter cannot triage VOC.");
    }
    if (body.title) voc.title = String(body.title);
    if (body.description) {
      if (richContentHasUnsafeInlineImage(String(body.description))) {
        throw new ApiError(400, "validation_failed", "Rich content cannot include unsafe inline images.");
      }
      voc.description = String(body.description);
    }
    if (body.triage_state) voc.triageState = body.triage_state as Voc["triageState"];
    if (body.severity) voc.severity = body.severity as Severity;
    if (body.reporter_facing_status) voc.reporterFacingStatus = body.reporter_facing_status as Voc["reporterFacingStatus"];
    if (body.owner_id) voc.ownerId = String(body.owner_id);
    this.audit(actor.workspaceId, "voc_updated", { voc_id: id });
    return voc;
  }

  createConversation(actor: Actor, vocId: string, type: ConversationEntry["type"], body: Record<string, unknown>): ConversationEntry {
    const voc = this.getVoc(actor, vocId);
    if (!body.body || richContentHasUnsafeInlineImage(String(body.body))) {
      throw new ApiError(400, "validation_failed", "Safe rich content body is required.");
    }
    if (type === "reporter_reply" && voc.reporterId !== actor.id) {
      throw new ApiError(403, "permission_denied", "Only the reporter can reply.");
    }
    if (type !== "reporter_reply" && actor.roleLevel === "User") {
      throw new ApiError(403, "permission_denied", "Only operators can write this entry.");
    }
    const entry: ConversationEntry = {
      id: makeId("conversation", this.counters.conversation++),
      vocId,
      authorId: actor.id,
      type,
      body: String(body.body),
      createdAt: now()
    };
    this.conversations.set(vocId, [...(this.conversations.get(vocId) ?? []), entry]);
    this.audit(actor.workspaceId, `${type}_created`, { voc_id: vocId });
    return entry;
  }

  reporterSummary(actor: Actor, vocId: string): Record<string, unknown> {
    const voc = this.getVoc(actor, vocId);
    if (actor.roleLevel === "User" && voc.reporterId !== actor.id) {
      throw new ApiError(403, "permission_denied", "Reporter can only view own summary.");
    }
    const publicUpdate = (this.conversations.get(vocId) ?? []).filter((entry) => entry.type === "public_update").at(-1);
    return {
      public_title: voc.title,
      reporter_facing_status: voc.reporterFacingStatus,
      owning_team_public_name: "Analytics Platform",
      ...(publicUpdate
        ? {
            last_public_update_at: publicUpdate.createdAt,
            public_update_excerpt: publicUpdate.body
          }
        : {})
    };
  }

  createCluster(actor: Actor, body: Record<string, unknown>): VocCluster {
    const managedSystemId = String(body.managed_system_id ?? "");
    this.assertManagedSystemAccess(actor, managedSystemId);
    const vocIds = Array.isArray(body.voc_ids) ? body.voc_ids.map(String) : [];
    for (const vocId of vocIds) {
      const voc = this.getVoc(actor, vocId);
      if (voc.managedSystemId !== managedSystemId) {
        throw new ApiError(400, "validation_failed", "Cluster VOCs must share one Managed System.");
      }
    }
    const cluster: VocCluster = {
      id: makeId("voc-cluster", this.counters.cluster++),
      workspaceId: actor.workspaceId,
      managedSystemId,
      title: String(body.title ?? "Untitled cluster"),
      vocIds
    };
    this.clusters.set(cluster.id, cluster);
    this.audit(actor.workspaceId, "voc_cluster_created", { cluster_id: cluster.id });
    return cluster;
  }

  createFindingFromCluster(actor: Actor, clusterId: string, body: Record<string, unknown>): Finding {
    const cluster = this.clusters.get(clusterId);
    if (!cluster || cluster.workspaceId !== actor.workspaceId) {
      throw new ApiError(404, "not_found", "VOC Cluster not found.");
    }
    this.assertManagedSystemAccess(actor, cluster.managedSystemId);
    const finding = this.createFinding(actor, {
      managed_system_id: cluster.managedSystemId,
      title: body.title,
      summary: body.summary
    });
    this.createEntityLink(actor, {
      source_type: "voc_cluster",
      source_id: cluster.id,
      target_type: "finding",
      target_id: finding.id,
      relation_type: "created_finding",
      visibility: "summary_visible"
    });
    this.audit(actor.workspaceId, "finding_created_from_voc_cluster", { cluster_id: cluster.id, finding_id: finding.id });
    return finding;
  }

  createFindingFromVoc(actor: Actor, vocId: string, body: Record<string, unknown>): Finding {
    const voc = this.getVoc(actor, vocId);
    const finding = this.createFinding(actor, {
      managed_system_id: voc.managedSystemId,
      title: body.title ?? voc.title,
      summary: body.summary ?? voc.description
    });
    this.createEntityLink(actor, {
      source_type: "voc",
      source_id: voc.id,
      target_type: "finding",
      target_id: finding.id,
      relation_type: "created_finding",
      visibility: "summary_visible"
    });
    this.audit(actor.workspaceId, "finding_created_from_voc", { voc_id: voc.id, finding_id: finding.id });
    return finding;
  }

  createFinding(actor: Actor, body: Record<string, unknown>): Finding {
    const managedSystemId = String(body.managed_system_id ?? "");
    this.assertManagedSystemAccess(actor, managedSystemId);
    const finding: Finding = {
      id: makeId("finding", this.counters.finding++),
      workspaceId: actor.workspaceId,
      managedSystemId,
      title: String(body.title ?? "Untitled finding"),
      summary: String(body.summary ?? ""),
      status: "active"
    };
    this.findings.set(finding.id, finding);
    return finding;
  }

  listFindings(actor: Actor, managedSystemId?: string): Finding[] {
    if (managedSystemId && managedSystemId !== "all") {
      this.assertManagedSystemAccess(actor, managedSystemId);
    }
    return [...this.findings.values()].filter((finding) => {
      if (finding.workspaceId !== actor.workspaceId) return false;
      if (managedSystemId && managedSystemId !== "all" && finding.managedSystemId !== managedSystemId) return false;
      return this.canAccessManagedSystem(actor, finding.managedSystemId);
    });
  }

  getFinding(actor: Actor, id: string): Finding {
    const finding = this.findings.get(id);
    if (!finding || finding.workspaceId !== actor.workspaceId) {
      throw new ApiError(404, "not_found", "Finding not found.");
    }
    this.assertManagedSystemAccess(actor, finding.managedSystemId);
    return finding;
  }

  requestTaskFromVoc(actor: Actor, vocId: string, body: Record<string, unknown>): TaskRequest {
    const voc = this.getVoc(actor, vocId);
    const taskRequest = this.createTaskRequest(actor, {
      managed_system_id: voc.managedSystemId,
      title: body.title ?? voc.title,
      source_type: "voc",
      source_id: voc.id
    });
    this.createEntityLink(actor, {
      source_type: "voc",
      source_id: voc.id,
      target_type: "task_request",
      target_id: taskRequest.id,
      relation_type: "requested_task",
      visibility: "summary_visible"
    });
    this.audit(actor.workspaceId, "task_request_created_from_voc", { voc_id: voc.id, task_request_id: taskRequest.id });
    return taskRequest;
  }

  requestTaskFromFinding(actor: Actor, findingId: string, body: Record<string, unknown>): TaskRequest {
    const finding = this.findings.get(findingId);
    if (!finding || finding.workspaceId !== actor.workspaceId) {
      throw new ApiError(404, "not_found", "Finding not found.");
    }
    this.assertManagedSystemAccess(actor, finding.managedSystemId);
    const taskRequest = this.createTaskRequest(actor, {
      managed_system_id: finding.managedSystemId,
      title: body.title ?? finding.title,
      source_type: "finding",
      source_id: finding.id
    });
    this.createEntityLink(actor, {
      source_type: "finding",
      source_id: finding.id,
      target_type: "task_request",
      target_id: taskRequest.id,
      relation_type: "requested_task",
      visibility: "summary_visible"
    });
    this.audit(actor.workspaceId, "task_request_created_from_finding", { finding_id: finding.id, task_request_id: taskRequest.id });
    return taskRequest;
  }

  createTaskRequest(actor: Actor, body: Record<string, unknown>): TaskRequest {
    const managedSystemId = String(body.managed_system_id ?? "");
    this.assertManagedSystemAccess(actor, managedSystemId);
    const taskRequest: TaskRequest = {
      id: makeId("task-request", this.counters.taskRequest++),
      workspaceId: actor.workspaceId,
      managedSystemId,
      title: String(body.title ?? "Untitled task request"),
      status: "pending_review",
      sourceType: body.source_type as TaskRequest["sourceType"],
      sourceId: String(body.source_id),
      requestedById: actor.id
    };
    this.taskRequests.set(taskRequest.id, taskRequest);
    return taskRequest;
  }

  listTaskRequests(actor: Actor, managedSystemId?: string): TaskRequest[] {
    if (managedSystemId && managedSystemId !== "all") {
      this.assertManagedSystemAccess(actor, managedSystemId);
    }
    return [...this.taskRequests.values()].filter((taskRequest) => {
      if (taskRequest.workspaceId !== actor.workspaceId) return false;
      if (managedSystemId && managedSystemId !== "all" && taskRequest.managedSystemId !== managedSystemId) return false;
      return this.canAccessManagedSystem(actor, taskRequest.managedSystemId);
    });
  }

  approveTaskRequest(actor: Actor, id: string, body: Record<string, unknown>): TaskRequest {
    const taskRequest = this.getTaskRequest(actor, id);
    this.assertCanReviewTaskRequest(actor, taskRequest);
    taskRequest.status = "approved";
    this.audit(actor.workspaceId, "task_request_approved", { task_request_id: id, reason: body.reason ?? null });
    return taskRequest;
  }

  rejectTaskRequest(actor: Actor, id: string, body: Record<string, unknown>): TaskRequest {
    const taskRequest = this.getTaskRequest(actor, id);
    this.assertCanReviewTaskRequest(actor, taskRequest);
    this.assertReviewReason(body);
    if (taskRequest.status === "converted") {
      throw new ApiError(409, "invalid_transition", "Converted Task Request cannot be rejected.");
    }
    taskRequest.status = "rejected";
    this.audit(actor.workspaceId, "task_request_rejected", { task_request_id: id, reason: body.reason });
    return taskRequest;
  }

  requestMoreEvidenceForTaskRequest(actor: Actor, id: string, body: Record<string, unknown>): TaskRequest {
    const taskRequest = this.getTaskRequest(actor, id);
    this.assertCanReviewTaskRequest(actor, taskRequest);
    this.assertReviewReason(body);
    if (taskRequest.status === "converted") {
      throw new ApiError(409, "invalid_transition", "Converted Task Request cannot request more evidence.");
    }
    taskRequest.status = "needs_more_evidence";
    this.audit(actor.workspaceId, "task_request_more_evidence_requested", { task_request_id: id, reason: body.reason });
    return taskRequest;
  }

  convertTaskRequest(actor: Actor, id: string): Task {
    const taskRequest = this.getTaskRequest(actor, id);
    if (taskRequest.status === "pending_review") {
      taskRequest.status = "approved";
    }
    if (taskRequest.status !== "approved") {
      throw new ApiError(409, "invalid_transition", "Task Request must be approved before conversion.");
    }
    const task: Task = {
      id: makeId("task", this.counters.task++),
      workspaceId: actor.workspaceId,
      managedSystemId: taskRequest.managedSystemId,
      title: taskRequest.title,
      status: "Backlog"
    };
    taskRequest.status = "converted";
    this.tasks.set(task.id, task);
    this.createEntityLink(actor, {
      source_type: "task_request",
      source_id: taskRequest.id,
      target_type: "task",
      target_id: task.id,
      relation_type: "converted_to_task",
      visibility: "summary_visible"
    });
    this.audit(actor.workspaceId, "task_request_converted", { task_request_id: id, task_id: task.id });
    return task;
  }

  patchTask(actor: Actor, id: string, body: Record<string, unknown>): Task {
    const task = this.tasks.get(id);
    if (!task || task.workspaceId !== actor.workspaceId) {
      throw new ApiError(404, "not_found", "Task not found.");
    }
    this.assertManagedSystemAccess(actor, task.managedSystemId);
    if (body.status) {
      task.status = body.status as TaskStatus;
    }
    this.audit(actor.workspaceId, "task_updated", { task_id: id, status: task.status });
    return task;
  }

  listTasks(actor: Actor, managedSystemId?: string): Task[] {
    if (managedSystemId && managedSystemId !== "all") {
      this.assertManagedSystemAccess(actor, managedSystemId);
    }
    return [...this.tasks.values()].filter((task) => {
      if (task.workspaceId !== actor.workspaceId) return false;
      if (managedSystemId && managedSystemId !== "all" && task.managedSystemId !== managedSystemId) return false;
      return this.canAccessManagedSystem(actor, task.managedSystemId);
    });
  }

  listManagedSystems(actor: Actor): ManagedSystem[] {
    return [...this.managedSystems.values()].filter(
      (system) => system.workspaceId === actor.workspaceId && this.canAccessManagedSystem(actor, system.id)
    );
  }

  listAnalyticsAreas(actor: Actor, managedSystemId?: string): AnalyticsArea[] {
    if (managedSystemId) {
      this.assertManagedSystemAccess(actor, managedSystemId);
    }
    return [...this.analyticsAreas.values()].filter((area) => {
      if (area.workspaceId !== actor.workspaceId) return false;
      if (managedSystemId && area.managedSystemId !== managedSystemId) return false;
      return this.canAccessManagedSystem(actor, area.managedSystemId);
    });
  }

  createPermissionRequest(actor: Actor, body: Record<string, unknown>): PermissionRequest {
    const managedSystemId = String(body.managed_system_id ?? "");
    if (!managedSystemId || !body.reason) {
      throw new ApiError(400, "validation_failed", "managed_system_id and reason are required.");
    }
    const permissionRequest: PermissionRequest = {
      id: makeId("permission-request", this.counters.permissionRequest++),
      workspaceId: actor.workspaceId,
      managedSystemId,
      requesterId: actor.id,
      reason: String(body.reason),
      status: "pending"
    };
    this.permissionRequests.set(permissionRequest.id, permissionRequest);
    this.audit(actor.workspaceId, "permission_request_created", {
      permission_request_id: permissionRequest.id,
      managed_system_id: managedSystemId
    });
    return permissionRequest;
  }

  listPermissionRequests(actor: Actor): PermissionRequest[] {
    if (actor.roleLevel === "Admin") {
      return [...this.permissionRequests.values()].filter((request) => request.workspaceId === actor.workspaceId);
    }
    return [...this.permissionRequests.values()].filter((request) => request.workspaceId === actor.workspaceId && request.requesterId === actor.id);
  }

  approvePermissionRequest(actor: Actor, id: string): PermissionRequest {
    if (actor.roleLevel !== "Admin") {
      throw new ApiError(403, "permission_denied", "Only Admin can approve permission requests.");
    }
    const permissionRequest = this.permissionRequests.get(id);
    if (!permissionRequest || permissionRequest.workspaceId !== actor.workspaceId) {
      throw new ApiError(404, "not_found", "Permission Request not found.");
    }
    permissionRequest.status = "approved";
    this.audit(actor.workspaceId, "permission_request_approved", { permission_request_id: id });
    return permissionRequest;
  }

  listEntityLinks(actor: Actor): EntityLink[] {
    return [...this.links.values()].filter((link) => link.workspaceId === actor.workspaceId);
  }

  createEntityLink(actor: Actor, body: Record<string, unknown>): EntityLink {
    const relationType = String(body.relation_type);
    if (isForbiddenRelationType(relationType)) {
      throw new ApiError(400, "validation_failed", "generated_voc relation is forbidden.");
    }
    const sourceWorkspaceId = this.entityWorkspace(String(body.source_type), String(body.source_id));
    const targetWorkspaceId = this.entityWorkspace(String(body.target_type), String(body.target_id));
    if (sourceWorkspaceId !== actor.workspaceId || targetWorkspaceId !== actor.workspaceId || sourceWorkspaceId !== targetWorkspaceId) {
      throw new ApiError(400, "workspace_mismatch", "Entity link endpoints reject cross-workspace links.");
    }
    const link: EntityLink = {
      id: makeId("link", this.counters.link++),
      workspaceId: actor.workspaceId,
      sourceType: String(body.source_type),
      sourceId: String(body.source_id),
      targetType: String(body.target_type),
      targetId: String(body.target_id),
      relationType: relationType as RelationType,
      visibility: (body.visibility ?? "summary_visible") as EntityLink["visibility"]
    };
    this.links.set(link.id, link);
    return link;
  }

  dashboardQueues(actor: Actor): Record<string, unknown[]> {
    const links = [...this.links.values()].filter((link) => link.workspaceId === actor.workspaceId);
    const highSeverityFollowUp = this.listVocs(actor, "all")
      .filter((voc) => voc.severity === "high" || voc.severity === "critical")
      .filter(
        (voc) =>
          !links.some(
            (link) =>
              link.sourceType === "voc" &&
              link.sourceId === voc.id &&
              (link.relationType === "created_finding" || link.relationType === "requested_task")
          )
      )
      .map((voc) => ({
        id: voc.id,
        title: voc.title,
        reason: "High severity VOC has no Finding, Task Request, Task, or no-follow-up decision.",
        next_action: "Create Finding or Task Request"
      }));

    return {
      high_severity_follow_up: highSeverityFollowUp,
      task_requests_pending_review: [...this.taskRequests.values()]
        .filter((taskRequest) => taskRequest.workspaceId === actor.workspaceId && taskRequest.status === "pending_review")
        .filter((taskRequest) => this.canAccessManagedSystem(actor, taskRequest.managedSystemId))
        .map((taskRequest) => ({ id: taskRequest.id, title: taskRequest.title, next_action: "Review Task Request" }))
    };
  }

  private getTaskRequest(actor: Actor, id: string): TaskRequest {
    const taskRequest = this.taskRequests.get(id);
    if (!taskRequest || taskRequest.workspaceId !== actor.workspaceId) {
      throw new ApiError(404, "not_found", "Task Request not found.");
    }
    this.assertManagedSystemAccess(actor, taskRequest.managedSystemId);
    return taskRequest;
  }

  private assertCanReviewTaskRequest(actor: Actor, taskRequest: TaskRequest): void {
    if (actor.roleLevel === "User") {
      throw new ApiError(403, "permission_denied", "User cannot review task requests.");
    }
    if (taskRequest.requestedById === actor.id && actor.roleLevel === "Developer" && !actor.capabilities?.includes("task_request_self_approval")) {
      throw new ApiError(403, "permission_denied", "Self-approval requires explicit capability.");
    }
  }

  private assertReviewReason(body: Record<string, unknown>): void {
    if (!body.reason) {
      throw new ApiError(400, "validation_failed", "reason is required for Task Request review decisions.");
    }
  }

  private assertAnalyticsAreaMatches(analyticsAreaId: string, managedSystemId: string): void {
    if (!analyticsAreaId) return;
    const analyticsArea = this.analyticsAreas.get(analyticsAreaId);
    if (!analyticsArea || analyticsArea.managedSystemId !== managedSystemId) {
      throw new ApiError(400, "validation_failed", "analytics_area_id must belong to managed_system_id.");
    }
  }

  private entityWorkspace(type: string, id: string): string {
    const collection =
      type === "voc"
        ? this.vocs
        : type === "voc_cluster"
          ? this.clusters
          : type === "finding"
            ? this.findings
            : type === "task_request"
              ? this.taskRequests
              : type === "task"
                ? this.tasks
                : undefined;
    const record = collection?.get(id);
    if (!record) {
      return "missing";
    }
    return record.workspaceId;
  }

  private audit(workspaceId: string, type: string, metadata: Record<string, unknown>): void {
    this.auditEvents.push({
      id: makeId("audit", this.counters.audit++),
      workspaceId,
      type,
      metadata
    });
  }

  private seed(): void {
    this.managedSystems.set("ms-tableau", { id: "ms-tableau", workspaceId: "ws-main", name: "Tableau" });
    this.managedSystems.set("ms-looker", { id: "ms-looker", workspaceId: "ws-main", name: "Looker" });
    this.analyticsAreas.set("aa-tableau-exec", {
      id: "aa-tableau-exec",
      workspaceId: "ws-main",
      managedSystemId: "ms-tableau",
      name: "Executive Reporting"
    });
    this.analyticsAreas.set("aa-looker-revenue", {
      id: "aa-looker-revenue",
      workspaceId: "ws-main",
      managedSystemId: "ms-looker",
      name: "Revenue Analytics"
    });
    this.actors.set("admin", {
      id: "admin",
      workspaceId: "ws-main",
      name: "Admin",
      roleLevel: "Admin",
      managedSystemIds: []
    });
    this.actors.set("admin-denied-looker", {
      id: "admin-denied-looker",
      workspaceId: "ws-main",
      name: "Denied Admin",
      roleLevel: "Admin",
      managedSystemIds: [],
      explicitDeniedManagedSystemIds: ["ms-looker"]
    });
    this.actors.set("dev-tableau", {
      id: "dev-tableau",
      workspaceId: "ws-main",
      name: "Tableau Developer",
      roleLevel: "Developer",
      managedSystemIds: ["ms-tableau"]
    });
    this.actors.set("user-tableau", {
      id: "user-tableau",
      workspaceId: "ws-main",
      name: "Reporter",
      roleLevel: "User",
      managedSystemIds: ["ms-tableau"]
    });
    this.vocs.set("voc-seeded-tableau", {
      id: "voc-seeded-tableau",
      workspaceId: "ws-main",
      managedSystemId: "ms-tableau",
      analyticsAreaId: "aa-tableau-exec",
      reporterId: "user-tableau",
      title: "Seeded Tableau VOC",
      description: "Dashboard is intermittently slow.",
      severity: "medium",
      triageState: "triaging",
      reporterFacingStatus: "검토 중",
      ownerId: "dev-tableau"
    });
    this.vocs.set("voc-high-unlinked", {
      id: "voc-high-unlinked",
      workspaceId: "ws-main",
      managedSystemId: "ms-tableau",
      reporterId: "user-tableau",
      title: "High severity unlinked VOC",
      description: "Month-end finance dashboard is down.",
      severity: "high",
      triageState: "triaged",
      reporterFacingStatus: "검토 중",
      ownerId: "dev-tableau"
    });
    this.findings.set("finding-other-workspace", {
      id: "finding-other-workspace",
      workspaceId: "ws-other",
      managedSystemId: "ms-other",
      title: "Other workspace finding",
      summary: "Out of scope",
      status: "active"
    });
  }
}

export function toApi<T>(value: T): T {
  return JSON.parse(
    JSON.stringify(value)
      .replaceAll("workspaceId", "workspace_id")
      .replaceAll("managedSystemId", "managed_system_id")
      .replaceAll("analyticsAreaId", "analytics_area_id")
      .replaceAll("reporterId", "reporter_id")
      .replaceAll("triageState", "triage_state")
      .replaceAll("reporterFacingStatus", "reporter_facing_status")
      .replaceAll("ownerId", "owner_id")
      .replaceAll("sourceType", "source_type")
      .replaceAll("sourceId", "source_id")
      .replaceAll("targetType", "target_type")
      .replaceAll("targetId", "target_id")
      .replaceAll("relationType", "relation_type")
      .replaceAll("requestedById", "requested_by_id")
      .replaceAll("createdAt", "created_at")
  ) as T;
}
