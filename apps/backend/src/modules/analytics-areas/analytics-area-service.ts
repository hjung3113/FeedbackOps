// Analytics Area application service (Slice 2 #11).
//
// Ownership per docs/implementation/02-domain-module-boundaries.md +
// ADR-0017. Mutation contract mirrors managed-system-service (#10):
//   1. Optional Idempotency-Key (ADR-0015).
//   2. checkCapability('workspace.admin') — grill Q3 lock.
//   3. Domain INSERT/UPDATE inside the same transaction.
//   4. Audit row in the SAME transaction (ADR-0008).
//   5. Idempotency record.
//
// The archive helper exposes a tx-scoped variant
// (`cascadeArchiveActiveChildren`) consumed by managed-system-service when
// a Managed System archive cascades to its non-archived Analytics Areas
// (ADR-0017 archive cascade rule). The cascade variant skips the cap
// check + idempotency lookup because the outer service already performed
// both for the parent operation.

import { and, asc, count, eq, isNull } from 'drizzle-orm';
import type { DatabaseError } from 'pg';

import type { AuditEventType } from '@fops/shared';

import type { Db } from '../../db/client.js';
import { analyticsAreas, managedSystems } from '../../db/schema/core.js';
import { HttpError } from '../../lib/errors.js';
import type { AuditService } from '../core/audit/audit-service.js';
import { hashRequestBody } from '../core/idempotency/canonicalize.js';
import type { IdempotencyService } from '../core/idempotency/idempotency-service.js';
import type { ActorContext, CheckService } from '../permissions/check-service.js';

// ADR-0017 AA slug shape — same lower-kebab rule as MS slug.
export const AA_SLUG_REGEX = /^[a-z][a-z0-9-]*$/;

const REGISTERED: AuditEventType = 'analytics_area_registered';
const UPDATED: AuditEventType = 'analytics_area_updated';
const ARCHIVED: AuditEventType = 'analytics_area_archived';

export interface RegisterAnalyticsAreaBody {
  managed_system_id: string;
  slug: string;
  name: string;
  owner_team_id?: string | null | undefined;
}

export interface UpdateAnalyticsAreaBody {
  name?: string | undefined;
  owner_team_id?: string | null | undefined;
}

export interface AnalyticsAreaDto {
  id: string;
  workspace_id: string;
  managed_system_id: string;
  slug: string;
  name: string;
  owner_team_id: string | null;
  archived_at: string | null;
  archived_by_actor_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface ServiceResult<T> {
  status: number;
  body: T;
}

export interface MutationOptions {
  idempotencyKey?: string;
}

export interface ListAnalyticsAreasQuery {
  managed_system_id?: string;
  include_archived?: boolean;
  limit?: number;
  offset?: number;
}

export interface ListAnalyticsAreasResult {
  items: AnalyticsAreaDto[];
  total: number;
}

export interface AnalyticsAreaServiceDeps {
  db: Db;
  checkService: CheckService;
  auditService: AuditService;
  idempotencyService: IdempotencyService;
}

type Row = typeof analyticsAreas.$inferSelect;

function toDto(row: Row): AnalyticsAreaDto {
  return {
    id: row.id,
    workspace_id: row.workspaceId,
    managed_system_id: row.managedSystemId,
    slug: row.slug,
    name: row.name,
    owner_team_id: row.ownerTeamId,
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

// Tx-scoped archive of a single AA. Writes the row update AND the audit
// row; caller is responsible for the cap check and idempotency frame.
// Returns the archived row's id (or null when the row was already
// archived — caller decides whether that is an error or a no-op).
export async function archiveAnalyticsAreaInTx(
  tx: Db,
  auditService: AuditService,
  args: {
    workspaceId: string;
    actorId: string;
    analyticsAreaId: string;
    cascadeSourceManagedSystemId: string | null;
    now: Date;
  },
): Promise<string | null> {
  const rows = await tx
    .update(analyticsAreas)
    .set({ archivedAt: args.now, archivedByActorId: args.actorId, updatedAt: args.now })
    .where(
      and(
        eq(analyticsAreas.workspaceId, args.workspaceId),
        eq(analyticsAreas.id, args.analyticsAreaId),
        isNull(analyticsAreas.archivedAt),
      ),
    )
    .returning({ id: analyticsAreas.id });
  const row = rows[0];
  if (!row) return null;
  await auditService.record(tx, {
    workspace_id: args.workspaceId,
    actor_id: args.actorId,
    event_type: ARCHIVED,
    subject_type: 'analytics_area',
    subject_id: row.id,
    summary: 'Analytics Area archived',
    detail: {
      analytics_area_id: row.id,
      cascade_source_managed_system_id: args.cascadeSourceManagedSystemId,
    },
  });
  return row.id;
}

// Cascade variant called from managed-system-service when a MS archive
// fans out to its non-archived child AAs. Returns the list of archived
// AA ids so the caller can populate `cascaded_analytics_area_ids` in the
// MS archive audit detail.
export async function cascadeArchiveActiveChildren(
  tx: Db,
  auditService: AuditService,
  args: {
    workspaceId: string;
    actorId: string;
    managedSystemId: string;
    now: Date;
  },
): Promise<string[]> {
  const children = await tx
    .select({ id: analyticsAreas.id })
    .from(analyticsAreas)
    .where(
      and(
        eq(analyticsAreas.workspaceId, args.workspaceId),
        eq(analyticsAreas.managedSystemId, args.managedSystemId),
        isNull(analyticsAreas.archivedAt),
      ),
    );
  const ids: string[] = [];
  for (const c of children) {
    const archivedId = await archiveAnalyticsAreaInTx(tx, auditService, {
      workspaceId: args.workspaceId,
      actorId: args.actorId,
      analyticsAreaId: c.id,
      cascadeSourceManagedSystemId: args.managedSystemId,
      now: args.now,
    });
    if (archivedId) ids.push(archivedId);
  }
  return ids;
}

export function createAnalyticsAreaService(deps: AnalyticsAreaServiceDeps) {
  const { db, checkService, auditService, idempotencyService } = deps;

  async function registerAnalyticsArea(
    actor: ActorContext,
    body: RegisterAnalyticsAreaBody,
    options: MutationOptions = {},
  ): Promise<ServiceResult<AnalyticsAreaDto>> {
    if (!AA_SLUG_REGEX.test(body.slug)) {
      throw new HttpError('validation.failed', 'slug must match lower-kebab pattern', {
        field: 'slug',
        pattern: AA_SLUG_REGEX.source,
      });
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
          return { status: hit.status, body: hit.body as AnalyticsAreaDto };
        }
        if (hit.kind === 'mismatch') {
          throw new HttpError(
            'conflict.idempotency_key_reuse',
            'Idempotency-Key reused with a different request body',
          );
        }
      }

      await requireWorkspaceAdmin(checkService, actor);

      // Parent MS must exist, share the workspace, and not be archived.
      const msRows = await tx
        .select({
          id: managedSystems.id,
          workspaceId: managedSystems.workspaceId,
          archivedAt: managedSystems.archivedAt,
        })
        .from(managedSystems)
        .where(eq(managedSystems.id, body.managed_system_id))
        .limit(1);
      const ms = msRows[0];
      if (!ms || ms.workspaceId !== actor.workspace_id) {
        throw new HttpError('not_found.record', 'managed_system not found in workspace');
      }
      if (ms.archivedAt !== null) {
        throw new HttpError(
          'conflict.parent_archived',
          'cannot register an Analytics Area under an archived Managed System',
          { managed_system_id: body.managed_system_id },
        );
      }

      let inserted: Row;
      try {
        const rows = await tx
          .insert(analyticsAreas)
          .values({
            workspaceId: actor.workspace_id,
            managedSystemId: body.managed_system_id,
            slug: body.slug,
            name: body.name,
            ownerTeamId: body.owner_team_id ?? null,
          })
          .returning();
        const row = rows[0];
        if (!row) {
          throw new HttpError('internal.unexpected', 'analytics_areas insert returned no row');
        }
        inserted = row;
      } catch (err) {
        const pgErr = err as DatabaseError;
        if (pgErr?.code === '23505') {
          throw new HttpError('conflict.duplicate_slug', 'slug already in use under this MS', {
            slug: body.slug,
            managed_system_id: body.managed_system_id,
          });
        }
        throw err;
      }

      await auditService.record(tx as unknown as Db, {
        workspace_id: actor.workspace_id,
        actor_id: actor.actor_id,
        event_type: REGISTERED,
        subject_type: 'analytics_area',
        subject_id: inserted.id,
        summary: `Analytics Area registered: ${inserted.slug}`,
        detail: {
          workspace_id: actor.workspace_id,
          managed_system_id: inserted.managedSystemId,
          slug: inserted.slug,
          name: inserted.name,
          owner_team_id: inserted.ownerTeamId,
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

  async function updateAnalyticsArea(
    actor: ActorContext,
    id: string,
    body: UpdateAnalyticsAreaBody,
    options: MutationOptions = {},
  ): Promise<ServiceResult<AnalyticsAreaDto>> {
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
          return { status: hit.status, body: hit.body as AnalyticsAreaDto };
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
        .from(analyticsAreas)
        .where(and(eq(analyticsAreas.workspaceId, actor.workspace_id), eq(analyticsAreas.id, id)))
        .limit(1);
      const existing = existingRows[0];
      if (!existing) {
        throw new HttpError('not_found.record', 'analytics_area not found');
      }

      const changes: Record<string, { from: string | null; to: string | null }> = {};
      const patch: Partial<{ name: string; ownerTeamId: string | null }> = {};

      if (body.name !== undefined && body.name !== existing.name) {
        changes.name = { from: existing.name, to: body.name };
        patch.name = body.name;
      }
      if (
        body.owner_team_id !== undefined &&
        (body.owner_team_id ?? null) !== existing.ownerTeamId
      ) {
        changes.owner_team_id = {
          from: existing.ownerTeamId,
          to: body.owner_team_id ?? null,
        };
        patch.ownerTeamId = body.owner_team_id ?? null;
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

      const updatedRows = await tx
        .update(analyticsAreas)
        .set({ ...patch, updatedAt: new Date() })
        .where(and(eq(analyticsAreas.workspaceId, actor.workspace_id), eq(analyticsAreas.id, id)))
        .returning();
      const updated = updatedRows[0];
      if (!updated) {
        throw new HttpError('internal.unexpected', 'analytics_areas update returned no row');
      }

      await auditService.record(tx as unknown as Db, {
        workspace_id: actor.workspace_id,
        actor_id: actor.actor_id,
        event_type: UPDATED,
        subject_type: 'analytics_area',
        subject_id: id,
        summary: `Analytics Area updated: ${updated.slug}`,
        detail: { analytics_area_id: id, changes },
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

  async function archiveAnalyticsArea(
    actor: ActorContext,
    id: string,
    options: MutationOptions = {},
  ): Promise<ServiceResult<AnalyticsAreaDto>> {
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
          return { status: hit.status, body: hit.body as AnalyticsAreaDto };
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
        .from(analyticsAreas)
        .where(and(eq(analyticsAreas.workspaceId, actor.workspace_id), eq(analyticsAreas.id, id)))
        .limit(1);
      const existing = existingRows[0];
      if (!existing) {
        throw new HttpError('not_found.record', 'analytics_area not found');
      }
      if (existing.archivedAt !== null) {
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

      const now = new Date();
      await archiveAnalyticsAreaInTx(tx as unknown as Db, auditService, {
        workspaceId: actor.workspace_id,
        actorId: actor.actor_id,
        analyticsAreaId: id,
        cascadeSourceManagedSystemId: null,
        now,
      });

      const refreshed = await tx
        .select()
        .from(analyticsAreas)
        .where(and(eq(analyticsAreas.workspaceId, actor.workspace_id), eq(analyticsAreas.id, id)))
        .limit(1);
      const row = refreshed[0];
      if (!row) {
        throw new HttpError('internal.unexpected', 'analytics_areas archive lost row');
      }
      const dto = toDto(row);
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

  async function listAnalyticsAreas(
    actor: ActorContext,
    query: ListAnalyticsAreasQuery = {},
  ): Promise<ListAnalyticsAreasResult> {
    const includeArchived = query.include_archived === true;
    const limit = Math.min(Math.max(query.limit ?? 100, 1), 500);
    const offset = Math.max(query.offset ?? 0, 0);

    const conds = [eq(analyticsAreas.workspaceId, actor.workspace_id)];
    if (query.managed_system_id !== undefined) {
      conds.push(eq(analyticsAreas.managedSystemId, query.managed_system_id));
    }
    if (!includeArchived) conds.push(isNull(analyticsAreas.archivedAt));
    const where = and(...conds);

    const rows = await db
      .select()
      .from(analyticsAreas)
      .where(where)
      .orderBy(asc(analyticsAreas.managedSystemId), asc(analyticsAreas.slug))
      .limit(limit)
      .offset(offset);

    const totalRows = await db.select({ value: count() }).from(analyticsAreas).where(where);
    const total = Number(totalRows[0]?.value ?? 0);

    return { items: rows.map(toDto), total };
  }

  return {
    registerAnalyticsArea,
    updateAnalyticsArea,
    archiveAnalyticsArea,
    listAnalyticsAreas,
  };
}

export type AnalyticsAreaService = ReturnType<typeof createAnalyticsAreaService>;
