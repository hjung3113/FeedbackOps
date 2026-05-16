// Managed System application service (Slice 2 #10).
//
// Owns the write-side of the Managed System Registry per
// docs/implementation/02-domain-module-boundaries.md and ADR-0017.
//
// Mutation contract (mirrors permission-request-service / ADR-0008 +
// ADR-0015):
//   1. Optional Idempotency-Key lookup.
//   2. checkCapability('workspace.admin') — grill Q3 lock: no new
//      capability vocab; workspace.admin satisfies every Slice 2 mutation.
//   3. Domain INSERT/UPDATE inside the transaction.
//   4. Audit row in the SAME transaction (ADR-0008 role separation
//      guarantees fops_app can INSERT-only on core.audit_log).
//   5. Idempotency record (optional).
//
// Archive cascade: per ADR-0017 archiving a Managed System archives every
// non-archived child Analytics Area in the same transaction. The AA write
// path lands in Slice 2 #11; until then the inner SELECT returns an empty
// set and `cascaded_analytics_area_ids` is `[]`.

import { and, asc, count, eq, isNull } from 'drizzle-orm';
import type { DatabaseError } from 'pg';

import type { AuditEventType } from '@fops/shared';

import type { Db } from '../../db/client.js';
import { managedSystems } from '../../db/schema/core.js';
import { HttpError } from '../../lib/errors.js';
import { cascadeArchiveActiveChildren } from '../analytics-areas/analytics-area-service.js';
import type { AuditService } from '../core/audit/audit-service.js';
import { hashRequestBody } from '../core/idempotency/canonicalize.js';
import type { IdempotencyService } from '../core/idempotency/idempotency-service.js';
import type { ActorContext, CheckService } from '../permissions/check-service.js';

// ADR-0017 slug shape: lower-kebab, must start with a letter.
export const MS_SLUG_REGEX = /^[a-z][a-z0-9-]*$/;

const REGISTERED: AuditEventType = 'managed_system_registered';
const UPDATED: AuditEventType = 'managed_system_updated';
const ARCHIVED: AuditEventType = 'managed_system_archived';

export interface RegisterManagedSystemBody {
  slug: string;
  name: string;
  external_key?: string | null | undefined;
  default_owner_actor_id?: string | null | undefined;
  default_owner_team_id?: string | null | undefined;
}

export interface UpdateManagedSystemBody {
  name?: string | undefined;
  external_key?: string | null | undefined;
  default_owner_actor_id?: string | null | undefined;
  default_owner_team_id?: string | null | undefined;
}

export interface ManagedSystemDto {
  id: string;
  workspace_id: string;
  slug: string;
  name: string;
  external_key: string | null;
  default_owner_actor_id: string | null;
  default_owner_team_id: string | null;
  archived_at: string | null;
  archived_by_actor_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface ManagedSystemServiceResult<T> {
  status: number;
  body: T;
}

export interface MutationOptions {
  idempotencyKey?: string;
}

export interface ListManagedSystemsQuery {
  include_archived?: boolean;
  slug?: string;
  limit?: number;
  offset?: number;
}

export interface ListManagedSystemsResult {
  items: ManagedSystemDto[];
  total: number;
}

export interface ManagedSystemServiceDeps {
  db: Db;
  checkService: CheckService;
  auditService: AuditService;
  idempotencyService: IdempotencyService;
}

type Row = typeof managedSystems.$inferSelect;

function toDto(row: Row): ManagedSystemDto {
  return {
    id: row.id,
    workspace_id: row.workspaceId,
    slug: row.slug,
    name: row.name,
    external_key: row.externalKey,
    default_owner_actor_id: row.defaultOwnerActorId,
    default_owner_team_id: row.defaultOwnerTeamId,
    archived_at: row.archivedAt ? row.archivedAt.toISOString() : null,
    archived_by_actor_id: row.archivedByActorId,
    created_at: row.createdAt.toISOString(),
    updated_at: row.updatedAt.toISOString(),
  };
}

async function requireWorkspaceAdmin(
  checkService: CheckService,
  actor: ActorContext,
): Promise<void> {
  const decision = await checkService.checkCapability(actor, 'workspace.admin', {
    workspace_id: actor.workspace_id,
  });
  if (decision.allow !== true) {
    throw new HttpError('permission.denied', 'workspace.admin required');
  }
}

export function createManagedSystemService(deps: ManagedSystemServiceDeps) {
  const { db, checkService, auditService, idempotencyService } = deps;

  async function registerManagedSystem(
    actor: ActorContext,
    body: RegisterManagedSystemBody,
    options: MutationOptions = {},
  ): Promise<ManagedSystemServiceResult<ManagedSystemDto>> {
    if (!MS_SLUG_REGEX.test(body.slug)) {
      throw new HttpError('validation.failed', 'slug must match lower-kebab pattern', {
        field: 'slug',
        pattern: MS_SLUG_REGEX.source,
      });
    }
    if (body.default_owner_actor_id && body.default_owner_team_id) {
      throw new HttpError(
        'validation.failed',
        'default_owner_actor_id and default_owner_team_id are mutually exclusive',
        { fields: ['default_owner_actor_id', 'default_owner_team_id'] },
      );
    }
    const requestHash = hashRequestBody(body);

    return await db.transaction(async (tx) => {
      if (options.idempotencyKey) {
        const hit = await idempotencyService.lookup(
          tx as unknown as Db,
          actor.actor_id,
          options.idempotencyKey,
          requestHash,
        );
        if (hit.kind === 'match') {
          return { status: hit.status, body: hit.body as ManagedSystemDto };
        }
        if (hit.kind === 'mismatch') {
          throw new HttpError(
            'conflict.idempotency_key_reuse',
            'Idempotency-Key reused with a different request body',
          );
        }
      }

      await requireWorkspaceAdmin(checkService, actor);

      let inserted: Row;
      try {
        const rows = await tx
          .insert(managedSystems)
          .values({
            workspaceId: actor.workspace_id,
            slug: body.slug,
            name: body.name,
            externalKey: body.external_key ?? null,
            defaultOwnerActorId: body.default_owner_actor_id ?? null,
            defaultOwnerTeamId: body.default_owner_team_id ?? null,
          })
          .returning();
        const row = rows[0];
        if (!row) {
          throw new HttpError('internal.unexpected', 'managed_systems insert returned no row');
        }
        inserted = row;
      } catch (err) {
        const pgErr = err as DatabaseError;
        if (pgErr?.code === '23505') {
          throw new HttpError('conflict.duplicate_slug', 'slug already in use', {
            slug: body.slug,
          });
        }
        throw err;
      }

      await auditService.record(tx as unknown as Db, {
        workspace_id: actor.workspace_id,
        actor_id: actor.actor_id,
        event_type: REGISTERED,
        subject_type: 'managed_system',
        subject_id: inserted.id,
        summary: `Managed System registered: ${inserted.slug}`,
        detail: {
          slug: inserted.slug,
          name: inserted.name,
          external_key: inserted.externalKey,
          default_owner_actor_id: inserted.defaultOwnerActorId,
          default_owner_team_id: inserted.defaultOwnerTeamId,
        },
      });

      const dto = toDto(inserted);
      if (options.idempotencyKey) {
        await idempotencyService.record(
          tx as unknown as Db,
          actor.actor_id,
          options.idempotencyKey,
          requestHash,
          201,
          dto,
        );
      }
      return { status: 201, body: dto };
    });
  }

  async function updateManagedSystem(
    actor: ActorContext,
    id: string,
    body: UpdateManagedSystemBody,
    options: MutationOptions = {},
  ): Promise<ManagedSystemServiceResult<ManagedSystemDto>> {
    const requestHash = hashRequestBody({ id, ...body });

    return await db.transaction(async (tx) => {
      if (options.idempotencyKey) {
        const hit = await idempotencyService.lookup(
          tx as unknown as Db,
          actor.actor_id,
          options.idempotencyKey,
          requestHash,
        );
        if (hit.kind === 'match') {
          return { status: hit.status, body: hit.body as ManagedSystemDto };
        }
        if (hit.kind === 'mismatch') {
          throw new HttpError(
            'conflict.idempotency_key_reuse',
            'Idempotency-Key reused with a different request body',
          );
        }
      }

      await requireWorkspaceAdmin(checkService, actor);

      const existingRows = await tx
        .select()
        .from(managedSystems)
        .where(and(eq(managedSystems.workspaceId, actor.workspace_id), eq(managedSystems.id, id)))
        .limit(1);
      const existing = existingRows[0];
      if (!existing) {
        throw new HttpError('not_found.record', 'managed_system not found');
      }

      // Build change diff. Slug is intentionally not in the body type;
      // immutability is enforced at the route boundary (422).
      const changes: Record<string, { from: string | null; to: string | null }> = {};
      const patch: Partial<{
        name: string;
        externalKey: string | null;
        defaultOwnerActorId: string | null;
        defaultOwnerTeamId: string | null;
      }> = {};

      if (body.name !== undefined && body.name !== existing.name) {
        changes.name = { from: existing.name, to: body.name };
        patch.name = body.name;
      }
      if (body.external_key !== undefined && body.external_key !== existing.externalKey) {
        changes.external_key = { from: existing.externalKey, to: body.external_key ?? null };
        patch.externalKey = body.external_key ?? null;
      }
      if (
        body.default_owner_actor_id !== undefined &&
        body.default_owner_actor_id !== existing.defaultOwnerActorId
      ) {
        changes.default_owner_actor_id = {
          from: existing.defaultOwnerActorId,
          to: body.default_owner_actor_id ?? null,
        };
        patch.defaultOwnerActorId = body.default_owner_actor_id ?? null;
      }
      if (
        body.default_owner_team_id !== undefined &&
        body.default_owner_team_id !== existing.defaultOwnerTeamId
      ) {
        changes.default_owner_team_id = {
          from: existing.defaultOwnerTeamId,
          to: body.default_owner_team_id ?? null,
        };
        patch.defaultOwnerTeamId = body.default_owner_team_id ?? null;
      }

      if (Object.keys(changes).length === 0) {
        const dto = toDto(existing);
        if (options.idempotencyKey) {
          await idempotencyService.record(
            tx as unknown as Db,
            actor.actor_id,
            options.idempotencyKey,
            requestHash,
            200,
            dto,
          );
        }
        return { status: 200, body: dto };
      }

      // Effective default_owner XOR check after the patch. The DB-level
      // CHECK already enforces this, but emitting a clean validation error
      // is friendlier than a 500 wrapping a 23514.
      const effectiveActor =
        body.default_owner_actor_id !== undefined
          ? body.default_owner_actor_id
          : existing.defaultOwnerActorId;
      const effectiveTeam =
        body.default_owner_team_id !== undefined
          ? body.default_owner_team_id
          : existing.defaultOwnerTeamId;
      if (effectiveActor && effectiveTeam) {
        throw new HttpError(
          'validation.failed',
          'default_owner_actor_id and default_owner_team_id are mutually exclusive',
          { fields: ['default_owner_actor_id', 'default_owner_team_id'] },
        );
      }

      const updatedRows = await tx
        .update(managedSystems)
        .set({ ...patch, updatedAt: new Date() })
        .where(and(eq(managedSystems.workspaceId, actor.workspace_id), eq(managedSystems.id, id)))
        .returning();
      const updated = updatedRows[0];
      if (!updated) {
        throw new HttpError('internal.unexpected', 'managed_systems update returned no row');
      }

      await auditService.record(tx as unknown as Db, {
        workspace_id: actor.workspace_id,
        actor_id: actor.actor_id,
        event_type: UPDATED,
        subject_type: 'managed_system',
        subject_id: id,
        summary: `Managed System updated: ${updated.slug}`,
        detail: { managed_system_id: id, changes },
      });

      const dto = toDto(updated);
      if (options.idempotencyKey) {
        await idempotencyService.record(
          tx as unknown as Db,
          actor.actor_id,
          options.idempotencyKey,
          requestHash,
          200,
          dto,
        );
      }
      return { status: 200, body: dto };
    });
  }

  async function archiveManagedSystem(
    actor: ActorContext,
    id: string,
    options: MutationOptions = {},
  ): Promise<
    ManagedSystemServiceResult<ManagedSystemDto & { cascaded_analytics_area_ids: string[] }>
  > {
    const requestHash = hashRequestBody({ id, op: 'archive' });

    return await db.transaction(async (tx) => {
      if (options.idempotencyKey) {
        const hit = await idempotencyService.lookup(
          tx as unknown as Db,
          actor.actor_id,
          options.idempotencyKey,
          requestHash,
        );
        if (hit.kind === 'match') {
          return {
            status: hit.status,
            body: hit.body as ManagedSystemDto & { cascaded_analytics_area_ids: string[] },
          };
        }
        if (hit.kind === 'mismatch') {
          throw new HttpError(
            'conflict.idempotency_key_reuse',
            'Idempotency-Key reused with a different request body',
          );
        }
      }

      await requireWorkspaceAdmin(checkService, actor);

      const existingRows = await tx
        .select()
        .from(managedSystems)
        .where(and(eq(managedSystems.workspaceId, actor.workspace_id), eq(managedSystems.id, id)))
        .limit(1);
      const existing = existingRows[0];
      if (!existing) {
        throw new HttpError('not_found.record', 'managed_system not found');
      }

      // Idempotent: already archived → return current state, no audit row,
      // no cascade re-walk.
      if (existing.archivedAt !== null) {
        const body = { ...toDto(existing), cascaded_analytics_area_ids: [] as string[] };
        if (options.idempotencyKey) {
          await idempotencyService.record(
            tx as unknown as Db,
            actor.actor_id,
            options.idempotencyKey,
            requestHash,
            200,
            body,
          );
        }
        return { status: 200, body };
      }

      const now = new Date();
      const archivedRows = await tx
        .update(managedSystems)
        .set({ archivedAt: now, archivedByActorId: actor.actor_id, updatedAt: now })
        .where(and(eq(managedSystems.workspaceId, actor.workspace_id), eq(managedSystems.id, id)))
        .returning();
      const archived = archivedRows[0];
      if (!archived) {
        throw new HttpError('internal.unexpected', 'managed_systems archive returned no row');
      }

      // Cascade walk over child Analytics Areas (Slice 2 #11 activation).
      // Each archived child gets its own `analytics_area_archived` audit
      // row with `cascade_source_managed_system_id = id` so a single
      // BI query can pivot from either direction. A failure in any child
      // aborts the whole transaction.
      const cascadedIds = await cascadeArchiveActiveChildren(tx as unknown as Db, auditService, {
        workspaceId: actor.workspace_id,
        actorId: actor.actor_id,
        managedSystemId: id,
        now,
      });

      await auditService.record(tx as unknown as Db, {
        workspace_id: actor.workspace_id,
        actor_id: actor.actor_id,
        event_type: ARCHIVED,
        subject_type: 'managed_system',
        subject_id: id,
        summary: `Managed System archived: ${archived.slug}`,
        detail: { managed_system_id: id, cascaded_analytics_area_ids: cascadedIds },
      });

      const body = { ...toDto(archived), cascaded_analytics_area_ids: cascadedIds };
      if (options.idempotencyKey) {
        await idempotencyService.record(
          tx as unknown as Db,
          actor.actor_id,
          options.idempotencyKey,
          requestHash,
          200,
          body,
        );
      }
      return { status: 200, body };
    });
  }

  async function listManagedSystems(
    actor: ActorContext,
    query: ListManagedSystemsQuery = {},
  ): Promise<ListManagedSystemsResult> {
    const includeArchived = query.include_archived === true;
    const limit = Math.min(Math.max(query.limit ?? 100, 1), 500);
    const offset = Math.max(query.offset ?? 0, 0);

    const conds = [eq(managedSystems.workspaceId, actor.workspace_id)];
    if (!includeArchived) conds.push(isNull(managedSystems.archivedAt));
    if (query.slug !== undefined) conds.push(eq(managedSystems.slug, query.slug));
    const where = and(...conds);

    const rows = await db
      .select()
      .from(managedSystems)
      .where(where)
      .orderBy(asc(managedSystems.slug))
      .limit(limit)
      .offset(offset);

    const totalRows = await db.select({ value: count() }).from(managedSystems).where(where);
    const total = Number(totalRows[0]?.value ?? 0);

    return { items: rows.map(toDto), total };
  }

  return {
    registerManagedSystem,
    updateManagedSystem,
    archiveManagedSystem,
    listManagedSystems,
  };
}

export type ManagedSystemService = ReturnType<typeof createManagedSystemService>;
