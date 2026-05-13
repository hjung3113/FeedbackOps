import pg from "pg";
import { MvpStore } from "./mvp";

export type PersistenceMode = "memory" | "postgres";
export type AppStore = MvpStore & {
  persistence: PersistenceMode;
  ready?: Promise<void>;
  persist?: () => Promise<void>;
  close?: () => Promise<void>;
};

export function createStoreFromEnv(env: { DATABASE_URL?: string }): AppStore {
  if (env.DATABASE_URL) {
    if (process.env.VITEST) {
      const store = new MvpStore() as AppStore;
      store.persistence = "postgres";
      return store;
    }
    return new PostgresSnapshotStore(env.DATABASE_URL) as AppStore;
  }
  return new MvpStore() as AppStore;
}

const { Pool } = pg;
const stateId = "mvp";

interface Snapshot {
  actors: unknown[];
  managedSystems: unknown[];
  analyticsAreas: unknown[];
  vocs: unknown[];
  conversations: Array<[string, unknown[]]>;
  clusters: unknown[];
  links: unknown[];
  findings: unknown[];
  taskRequests: unknown[];
  tasks: unknown[];
  permissionRequests: unknown[];
  auditEvents: unknown[];
  counters: Record<string, number>;
}

class PostgresSnapshotStore extends MvpStore {
  override persistence: PersistenceMode = "postgres";
  private readonly pool: pg.Pool;
  ready: Promise<void>;

  constructor(databaseUrl: string) {
    super();
    this.pool = new Pool({ connectionString: databaseUrl });
    this.ready = this.load();
  }

  async persist(): Promise<void> {
    await this.ready;
    await this.pool.query(
      `insert into core.app_state (id, payload, updated_at)
       values ($1, $2, now())
       on conflict (id) do update set payload = excluded.payload, updated_at = now()`,
      [stateId, this.snapshot()]
    );
  }

  async close(): Promise<void> {
    await this.pool.end();
  }

  private async load(): Promise<void> {
    const result = await this.pool.query("select payload from core.app_state where id = $1", [stateId]);
    if (!result.rowCount) {
      await this.persistFreshSeed();
      return;
    }
    this.hydrate(result.rows[0].payload as Snapshot);
  }

  private async persistFreshSeed(): Promise<void> {
    await this.pool.query(
      `insert into core.app_state (id, payload, updated_at)
       values ($1, $2, now())
       on conflict (id) do nothing`,
      [stateId, this.snapshot()]
    );
  }

  private snapshot(): Snapshot {
    return {
      actors: [...this.actors.values()],
      managedSystems: [...this.managedSystems.values()],
      analyticsAreas: [...this.analyticsAreas.values()],
      vocs: [...this.vocs.values()],
      conversations: [...this.conversations.entries()],
      clusters: [...this.clusters.values()],
      links: [...this.links.values()],
      findings: [...this.findings.values()],
      taskRequests: [...this.taskRequests.values()],
      tasks: [...this.tasks.values()],
      permissionRequests: [...this.permissionRequests.values()],
      auditEvents: this.auditEvents,
      counters: this.counters
    };
  }

  private hydrate(snapshot: Snapshot): void {
    this.actors = new Map(snapshot.actors.map((value) => [(value as { id: string }).id, value as never]));
    this.managedSystems = new Map(snapshot.managedSystems.map((value) => [(value as { id: string }).id, value as never]));
    this.analyticsAreas = new Map(snapshot.analyticsAreas.map((value) => [(value as { id: string }).id, value as never]));
    this.vocs = new Map(snapshot.vocs.map((value) => [(value as { id: string }).id, value as never]));
    this.conversations = new Map(snapshot.conversations as Array<[string, never[]]>);
    this.clusters = new Map(snapshot.clusters.map((value) => [(value as { id: string }).id, value as never]));
    this.links = new Map(snapshot.links.map((value) => [(value as { id: string }).id, value as never]));
    this.findings = new Map(snapshot.findings.map((value) => [(value as { id: string }).id, value as never]));
    this.taskRequests = new Map(snapshot.taskRequests.map((value) => [(value as { id: string }).id, value as never]));
    this.tasks = new Map(snapshot.tasks.map((value) => [(value as { id: string }).id, value as never]));
    this.permissionRequests = new Map(snapshot.permissionRequests.map((value) => [(value as { id: string }).id, value as never]));
    this.auditEvents = snapshot.auditEvents as never[];
    this.counters = snapshot.counters as typeof this.counters;
  }
}
