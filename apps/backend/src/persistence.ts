import pg from "pg";
import {
  type Actor,
  type AnalyticsArea,
  type ConversationEntry,
  type EntityLink,
  type Finding,
  type ManagedSystem,
  type Task,
  type TaskRequest,
  type Voc
} from "@feedbackops/shared";
import { MvpStore } from "./mvp";

export type PersistenceMode = "memory" | "postgres";
export type AppStore = MvpStore & {
  persistence: PersistenceMode;
  ready?: Promise<void>;
  persist?: () => Promise<void>;
  close?: () => Promise<void>;
};

type Queryable = {
  query: (sql: string, params?: unknown[]) => Promise<{ rows: Record<string, unknown>[]; rowCount?: number | null }>;
  end?: () => Promise<void>;
};

type PermissionRequest = MvpStore["permissionRequests"] extends Map<string, infer T> ? T : never;
type AuditEvent = MvpStore["auditEvents"][number];

const { Pool } = pg;

export function createStoreFromEnv(env: { DATABASE_URL?: string }): AppStore {
  if (env.DATABASE_URL) {
    if (process.env.VITEST) {
      const store = new MvpStore() as AppStore;
      store.persistence = "postgres";
      return store;
    }
    return new PostgresRelationalStore(env.DATABASE_URL) as AppStore;
  }
  return new MvpStore() as AppStore;
}

export class PostgresRelationalStore extends MvpStore {
  override persistence: PersistenceMode = "postgres";
  private readonly pool: Queryable;
  private pendingPersist = Promise.resolve();
  ready: Promise<void>;

  constructor(databaseUrlOrPool: string | Queryable) {
    super();
    this.pool = typeof databaseUrlOrPool === "string" ? new Pool({ connectionString: databaseUrlOrPool }) : databaseUrlOrPool;
    this.ready = this.load();
  }

  async persist(): Promise<void> {
    await this.ready;
    this.pendingPersist = this.pendingPersist.catch(() => undefined).then(() => this.saveRelational());
    await this.pendingPersist;
  }

  async close(): Promise<void> {
    await this.pool.end?.();
  }

  private async load(): Promise<void> {
    const [
      actors,
      grants,
      denies,
      managedSystems,
      analyticsAreas,
      vocs,
      conversations,
      findings,
      taskRequests,
      tasks,
      permissionRequests,
      links,
      auditEvents
    ] = await Promise.all([
      this.pool.query("select id, workspace_id, name, role_level from core.actors order by id"),
      this.pool.query("select actor_id, managed_system_id, capability from permission.permission_grants order by id"),
      this.pool.query("select actor_id, managed_system_id from permission.permission_denies order by id"),
      this.pool.query("select id, workspace_id, name, archived from core.managed_systems order by id"),
      this.pool.query("select id, workspace_id, managed_system_id, name, archived from core.analytics_areas order by id"),
      this.pool.query(
        `select id, workspace_id, managed_system_id, analytics_area_id, reporter_id, title, description,
                source_context, severity, triage_state, reporter_facing_status, owner_id
           from voc.vocs order by id`
      ),
      this.pool.query("select id, voc_id, author_id, entry_type, body, created_at from voc.voc_conversation_entries order by created_at, id"),
      this.pool.query("select id, workspace_id, managed_system_id, title, summary, status from finding.findings order by id"),
      this.pool.query(
        `select id, workspace_id, managed_system_id, title, status, source_type, source_id, requested_by_id
           from task.task_requests order by id`
      ),
      this.pool.query("select id, workspace_id, managed_system_id, title, status, assignee_id, priority from task.tasks order by id"),
      this.pool.query("select id, workspace_id, managed_system_id, requester_id, reason, status from permission.permission_requests order by id"),
      this.pool.query(
        `select id, workspace_id, source_type, source_id, target_type, target_id, relation_type, visibility
           from core.entity_links order by id`
      ),
      this.pool.query("select id, workspace_id, event_type, metadata from core.audit_logs order by created_at, id")
    ]);

    this.actors = new Map(
      actors.rows.map((row) => {
        const actor: Actor = {
          id: text(row.id),
          workspaceId: text(row.workspace_id),
          name: text(row.name),
          roleLevel: text(row.role_level) as Actor["roleLevel"],
          managedSystemIds: grants.rows
            .filter((grant) => grant.actor_id === row.id && !grant.capability)
            .map((grant) => text(grant.managed_system_id)),
          explicitDeniedManagedSystemIds: denies.rows
            .filter((deny) => deny.actor_id === row.id)
            .map((deny) => text(deny.managed_system_id)),
          capabilities: grants.rows.filter((grant) => grant.actor_id === row.id && grant.capability).map((grant) => text(grant.capability))
        };
        if (!actor.explicitDeniedManagedSystemIds?.length) delete actor.explicitDeniedManagedSystemIds;
        if (!actor.capabilities?.length) delete actor.capabilities;
        return [actor.id, actor];
      })
    );
    this.managedSystems = new Map(
      managedSystems.rows.map((row) => [
        text(row.id),
        { id: text(row.id), workspaceId: text(row.workspace_id), name: text(row.name), archived: Boolean(row.archived) } satisfies ManagedSystem
      ])
    );
    this.analyticsAreas = new Map(
      analyticsAreas.rows.map((row) => [
        text(row.id),
        {
          id: text(row.id),
          workspaceId: text(row.workspace_id),
          managedSystemId: text(row.managed_system_id),
          name: text(row.name),
          archived: Boolean(row.archived)
        } satisfies AnalyticsArea
      ])
    );
    this.vocs = new Map(
      vocs.rows.map((row) => [
        text(row.id),
        {
          id: text(row.id),
          workspaceId: text(row.workspace_id),
          managedSystemId: text(row.managed_system_id),
          analyticsAreaId: optionalText(row.analytics_area_id),
          reporterId: text(row.reporter_id),
          title: text(row.title),
          description: text(row.description),
          sourceContext: optionalText(row.source_context) as Voc["sourceContext"],
          severity: optionalText(row.severity) as Voc["severity"],
          triageState: text(row.triage_state) as Voc["triageState"],
          reporterFacingStatus: text(row.reporter_facing_status) as Voc["reporterFacingStatus"],
          ownerId: optionalText(row.owner_id)
        } satisfies Voc
      ])
    );
    this.conversations = new Map();
    for (const row of conversations.rows) {
      const entry: ConversationEntry = {
        id: text(row.id),
        vocId: text(row.voc_id),
        authorId: text(row.author_id),
        type: text(row.entry_type) as ConversationEntry["type"],
        body: text(row.body),
        createdAt: new Date(row.created_at as string | Date).toISOString()
      };
      this.conversations.set(entry.vocId, [...(this.conversations.get(entry.vocId) ?? []), entry]);
    }
    this.findings = new Map(
      findings.rows.map((row) => [
        text(row.id),
        {
          id: text(row.id),
          workspaceId: text(row.workspace_id),
          managedSystemId: text(row.managed_system_id),
          title: text(row.title),
          summary: text(row.summary),
          status: text(row.status) as Finding["status"]
        } satisfies Finding
      ])
    );
    this.taskRequests = new Map(
      taskRequests.rows.map((row) => [
        text(row.id),
        {
          id: text(row.id),
          workspaceId: text(row.workspace_id),
          managedSystemId: text(row.managed_system_id),
          title: text(row.title),
          status: text(row.status) as TaskRequest["status"],
          sourceType: text(row.source_type) as TaskRequest["sourceType"],
          sourceId: text(row.source_id),
          requestedById: text(row.requested_by_id)
        } satisfies TaskRequest
      ])
    );
    this.tasks = new Map(
      tasks.rows.map((row) => [
        text(row.id),
        {
          id: text(row.id),
          workspaceId: text(row.workspace_id),
          managedSystemId: text(row.managed_system_id),
          title: text(row.title),
          status: text(row.status) as Task["status"],
          assigneeId: optionalText(row.assignee_id),
          priority: optionalText(row.priority) as Task["priority"]
        } satisfies Task
      ])
    );
    this.permissionRequests = new Map(
      permissionRequests.rows.map((row) => [
        text(row.id),
        {
          id: text(row.id),
          workspaceId: text(row.workspace_id),
          managedSystemId: text(row.managed_system_id),
          requesterId: text(row.requester_id),
          reason: text(row.reason),
          status: text(row.status) as PermissionRequest["status"]
        } satisfies PermissionRequest
      ])
    );
    this.links = new Map(
      links.rows.map((row) => [
        text(row.id),
        {
          id: text(row.id),
          workspaceId: text(row.workspace_id),
          sourceType: text(row.source_type),
          sourceId: text(row.source_id),
          targetType: text(row.target_type),
          targetId: text(row.target_id),
          relationType: text(row.relation_type) as EntityLink["relationType"],
          visibility: text(row.visibility) as EntityLink["visibility"]
        } satisfies EntityLink
      ])
    );
    this.auditEvents = auditEvents.rows.map((row) => ({
      id: text(row.id),
      workspaceId: text(row.workspace_id),
      type: text(row.event_type),
      metadata: (row.metadata ?? {}) as Record<string, unknown>
    }));
    this.resetCounters();
  }

  private async saveRelational(): Promise<void> {
    await this.pool.query("begin");
    try {
      await this.pool.query("delete from core.entity_links");
      await this.pool.query("delete from task.tasks");
      await this.pool.query("delete from task.task_requests");
      await this.pool.query("delete from finding.findings");
      await this.pool.query("delete from voc.voc_conversation_entries");
      await this.pool.query("delete from voc.vocs");
      await this.pool.query("delete from permission.permission_requests");
      await this.pool.query("delete from permission.permission_denies");
      await this.pool.query("delete from permission.permission_grants");
      await this.pool.query("delete from core.audit_logs");
      await this.pool.query("delete from core.analytics_areas");
      await this.pool.query("delete from core.managed_systems");
      await this.pool.query("delete from core.actors");

      for (const actor of this.actors.values()) {
        await this.pool.query("insert into core.actors (id, workspace_id, name, role_level) values ($1, $2, $3, $4)", [
          actor.id,
          actor.workspaceId,
          actor.name,
          actor.roleLevel
        ]);
      }
      for (const managedSystem of this.managedSystems.values()) {
        await this.pool.query("insert into core.managed_systems (id, workspace_id, name, archived) values ($1, $2, $3, $4)", [
          managedSystem.id,
          managedSystem.workspaceId,
          managedSystem.name,
          managedSystem.archived ?? false
        ]);
      }
      for (const actor of this.actors.values()) {
        for (const managedSystemId of actor.managedSystemIds) {
          await this.pool.query(
            "insert into permission.permission_grants (id, workspace_id, actor_id, managed_system_id, capability) values ($1, $2, $3, $4, null)",
            [`grant-${actor.id}-${managedSystemId}`, actor.workspaceId, actor.id, managedSystemId]
          );
        }
        for (const capability of actor.capabilities ?? []) {
          for (const managedSystemId of actor.managedSystemIds) {
            await this.pool.query(
              "insert into permission.permission_grants (id, workspace_id, actor_id, managed_system_id, capability) values ($1, $2, $3, $4, $5)",
              [`grant-${actor.id}-${managedSystemId}-${capability}`, actor.workspaceId, actor.id, managedSystemId, capability]
            );
          }
        }
        for (const managedSystemId of actor.explicitDeniedManagedSystemIds ?? []) {
          await this.pool.query(
            "insert into permission.permission_denies (id, workspace_id, actor_id, managed_system_id, reason) values ($1, $2, $3, $4, $5)",
            [`deny-${actor.id}-${managedSystemId}`, actor.workspaceId, actor.id, managedSystemId, "Explicit deny"]
          );
        }
      }
      for (const area of this.analyticsAreas.values()) {
        await this.pool.query(
          "insert into core.analytics_areas (id, workspace_id, managed_system_id, name, archived) values ($1, $2, $3, $4, $5)",
          [area.id, area.workspaceId, area.managedSystemId, area.name, area.archived ?? false]
        );
      }
      for (const request of this.permissionRequests.values()) {
        await this.pool.query(
          "insert into permission.permission_requests (id, workspace_id, managed_system_id, requester_id, reason, status) values ($1, $2, $3, $4, $5, $6)",
          [request.id, request.workspaceId, request.managedSystemId, request.requesterId, request.reason, request.status]
        );
      }
      for (const voc of this.vocs.values()) {
        await this.pool.query(
          `insert into voc.vocs (
             id, workspace_id, managed_system_id, analytics_area_id, reporter_id, title, description,
             source_context, severity, triage_state, reporter_facing_status, owner_id
           ) values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
          [
            voc.id,
            voc.workspaceId,
            voc.managedSystemId,
            voc.analyticsAreaId ?? null,
            voc.reporterId,
            voc.title,
            voc.description,
            voc.sourceContext ?? null,
            voc.severity ?? null,
            voc.triageState,
            voc.reporterFacingStatus,
            voc.ownerId ?? null
          ]
        );
      }
      for (const entries of this.conversations.values()) {
        for (const entry of entries) {
          const voc = this.vocs.get(entry.vocId);
          await this.pool.query(
            "insert into voc.voc_conversation_entries (id, workspace_id, voc_id, author_id, entry_type, body, created_at) values ($1, $2, $3, $4, $5, $6, $7)",
            [entry.id, voc?.workspaceId ?? "missing", entry.vocId, entry.authorId, entry.type, entry.body, entry.createdAt]
          );
        }
      }
      for (const finding of this.findings.values()) {
        await this.pool.query(
          "insert into finding.findings (id, workspace_id, managed_system_id, title, summary, status) values ($1, $2, $3, $4, $5, $6)",
          [finding.id, finding.workspaceId, finding.managedSystemId, finding.title, finding.summary, finding.status]
        );
      }
      for (const request of this.taskRequests.values()) {
        await this.pool.query(
          "insert into task.task_requests (id, workspace_id, managed_system_id, title, status, source_type, source_id, requested_by_id) values ($1, $2, $3, $4, $5, $6, $7, $8)",
          [
            request.id,
            request.workspaceId,
            request.managedSystemId,
            request.title,
            request.status,
            request.sourceType,
            request.sourceId,
            request.requestedById
          ]
        );
      }
      for (const task of this.tasks.values()) {
        await this.pool.query(
          "insert into task.tasks (id, workspace_id, managed_system_id, title, status, assignee_id, priority) values ($1, $2, $3, $4, $5, $6, $7)",
          [task.id, task.workspaceId, task.managedSystemId, task.title, task.status, task.assigneeId ?? null, task.priority ?? null]
        );
      }
      for (const link of this.links.values()) {
        await this.pool.query(
          "insert into core.entity_links (id, workspace_id, source_type, source_id, target_type, target_id, relation_type, visibility) values ($1, $2, $3, $4, $5, $6, $7, $8)",
          [link.id, link.workspaceId, link.sourceType, link.sourceId, link.targetType, link.targetId, link.relationType, link.visibility]
        );
      }
      for (const event of this.auditEvents) {
        await this.pool.query("insert into core.audit_logs (id, workspace_id, event_type, metadata) values ($1, $2, $3, $4)", [
          event.id,
          event.workspaceId,
          event.type,
          event.metadata
        ]);
      }
      await this.pool.query("commit");
    } catch (error) {
      await this.pool.query("rollback");
      throw error;
    }
  }

  private resetCounters(): void {
    this.counters = {
      voc: nextCounter(this.vocs.keys(), "voc"),
      conversation: nextCounter([...this.conversations.values()].flat().map((entry) => entry.id), "conversation"),
      cluster: nextCounter(this.clusters.keys(), "voc-cluster"),
      link: nextCounter(this.links.keys(), "link"),
      finding: nextCounter(this.findings.keys(), "finding"),
      taskRequest: nextCounter(this.taskRequests.keys(), "task-request"),
      task: nextCounter(this.tasks.keys(), "task"),
      permissionRequest: nextCounter(this.permissionRequests.keys(), "permission-request"),
      audit: nextCounter(this.auditEvents.map((event) => event.id), "audit")
    };
  }
}

function text(value: unknown): string {
  return String(value);
}

function optionalText(value: unknown): string | undefined {
  return value === null || value === undefined ? undefined : String(value);
}

function nextCounter(ids: Iterable<string>, prefix: string): number {
  let max = 0;
  for (const id of ids) {
    const match = new RegExp(`^${prefix}-(\\d+)$`).exec(id);
    if (match) max = Math.max(max, Number(match[1]));
  }
  return max + 1;
}
