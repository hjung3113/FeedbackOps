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

import { and, asc, count, eq, isNull, sql } from 'drizzle-orm';
import type { DatabaseError } from 'pg';

import type { AuditEventType, ManagedSystemDefaultCandidates } from '@fops/shared';

import type { Db } from '../../db/client.js';
import { actors, managedSystems } from '../../db/schema/core.js';
import type { Tx } from '../../db/tx.js';
import { HttpError } from '../../lib/errors.js';
import { cascadeArchiveActiveChildren } from '../analytics-areas/analytics-area-service.js';
import type { AuditService } from '../core/audit/audit-service.js';
import { hashRequestBody } from '../core/idempotency/canonicalize.js';
import type { IdempotencyService } from '../core/idempotency/idempotency-service.js';
import type { ActorContext, CheckService } from '../permissions/check-service.js';
import { readDefaultDiagnostics } from './default-diagnostics.js';
import {
  responsibilityTargetFailure,
  validateResponsibilityDefault,
} from './responsibility-target.js';

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
  default_reviewer_actor_id?: string | null | undefined;
  default_reviewer_team_id?: string | null | undefined;
}

export interface UpdateManagedSystemBody {
  name?: string | undefined;
  external_key?: string | null | undefined;
  default_owner_actor_id?: string | null | undefined;
  default_owner_team_id?: string | null | undefined;
  default_reviewer_actor_id?: string | null | undefined;
  default_reviewer_team_id?: string | null | undefined;
}

export interface ManagedSystemDto {
  id: string;
  workspace_id: string;
  slug: string;
  name: string;
  external_key: string | null;
  default_owner_actor_id: string | null;
  default_owner_team_id: string | null;
  default_reviewer_actor_id: string | null;
  default_reviewer_team_id: string | null;
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
    default_reviewer_actor_id: row.defaultReviewerActorId,
    default_reviewer_team_id: row.defaultReviewerTeamId,
    archived_at: row.archivedAt ? row.archivedAt.toISOString() : null,
    archived_by_actor_id: row.archivedByActorId,
    created_at: row.createdAt.toISOString(),
    updated_at: row.updatedAt.toISOString(),
  };
}

async function requireWorkspaceAdmin(
  checkService: CheckService,
  actor: ActorContext,
  tx: Tx,
): Promise<void> {
  // S-002: thread the open mutation tx so the capability check sees writes
  // performed earlier in the same transaction (e.g. a freshly inserted
  // grant) and serialises against concurrent revokes.
  const decision = await checkService.checkCapability(
    actor,
    'workspace.admin',
    { workspace_id: actor.workspace_id },
    { tx },
  );
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
        fields: [{ path: ['slug'], code: 'invalid_slug_format' }],
      });
    }
    if (body.default_owner_actor_id && body.default_owner_team_id) {
      throw new HttpError(
        'validation.failed',
        'default_owner_actor_id and default_owner_team_id are mutually exclusive',
        {
          fields: [
            { path: ['default_owner_actor_id'], code: 'mutually_exclusive' },
            { path: ['default_owner_team_id'], code: 'mutually_exclusive' },
          ],
        },
      );
    }
    const requestHash = hashRequestBody(body);

    return await db.transaction(async (tx) => {
      const run = async () => {
        await requireWorkspaceAdmin(checkService, actor, tx);

        await validateResponsibilityDefault(
          tx,
          checkService,
          actor.workspace_id,
          undefined,
          'owner',
          body.default_owner_actor_id,
          body.default_owner_team_id,
        );
        await validateResponsibilityDefault(
          tx,
          checkService,
          actor.workspace_id,
          undefined,
          'reviewer',
          body.default_reviewer_actor_id,
          body.default_reviewer_team_id,
        );
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
              defaultReviewerActorId: body.default_reviewer_actor_id ?? null,
              defaultReviewerTeamId: body.default_reviewer_team_id ?? null,
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
              fields: [{ path: ['slug'], code: 'duplicate_slug' }],
            });
          }
          throw err;
        }

        await auditService.record(tx, {
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
            default_reviewer_actor_id: inserted.defaultReviewerActorId,
            default_reviewer_team_id: inserted.defaultReviewerTeamId,
          },
        });

        const dto = toDto(inserted);
        return { status: 201, body: dto };
      };

      return options.idempotencyKey
        ? idempotencyService.runIdempotent(
            tx,
            actor.actor_id,
            options.idempotencyKey,
            requestHash,
            run,
          )
        : run();
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
      const run = async () => {
        await requireWorkspaceAdmin(checkService, actor, tx);

        const existingRows = await tx
          .select()
          .from(managedSystems)
          .where(and(eq(managedSystems.workspaceId, actor.workspace_id), eq(managedSystems.id, id)))
          .limit(1)
          .for('update');
        const existing = existingRows[0];
        if (!existing) {
          throw new HttpError('not_found.record', 'managed_system not found');
        }

        // ADR-0019 Section A: archived rows are immutable. Re-registration
        // via slug reuse (ADR-0017:63) is the only path to "edit a retired
        // registry entry" — the audit/historical record on the original row
        // stays frozen.
        if (existing.archivedAt !== null) {
          throw new HttpError(
            'conflict.record_archived',
            'managed_system is archived and cannot be updated',
            { fields: [{ path: ['id'], code: 'record_archived' }] },
          );
        }

        // Build change diff. Slug is intentionally not in the body type;
        // immutability is enforced at the route boundary (422).
        const changes: Record<string, { from: string | null; to: string | null }> = {};
        const patch: Partial<{
          name: string;
          externalKey: string | null;
          defaultOwnerActorId: string | null;
          defaultOwnerTeamId: string | null;
          defaultReviewerActorId: string | null;
          defaultReviewerTeamId: string | null;
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

        if (
          body.default_reviewer_actor_id !== undefined &&
          body.default_reviewer_actor_id !== existing.defaultReviewerActorId
        ) {
          changes.default_reviewer_actor_id = {
            from: existing.defaultReviewerActorId,
            to: body.default_reviewer_actor_id ?? null,
          };
          patch.defaultReviewerActorId = body.default_reviewer_actor_id ?? null;
        }
        if (
          body.default_reviewer_team_id !== undefined &&
          body.default_reviewer_team_id !== existing.defaultReviewerTeamId
        ) {
          changes.default_reviewer_team_id = {
            from: existing.defaultReviewerTeamId,
            to: body.default_reviewer_team_id ?? null,
          };
          patch.defaultReviewerTeamId = body.default_reviewer_team_id ?? null;
        }
        if (body.default_owner_actor_id !== undefined || body.default_owner_team_id !== undefined) {
          await validateResponsibilityDefault(
            tx,
            checkService,
            actor.workspace_id,
            id,
            'owner',
            body.default_owner_actor_id !== undefined
              ? body.default_owner_actor_id
              : existing.defaultOwnerActorId,
            body.default_owner_team_id !== undefined
              ? body.default_owner_team_id
              : existing.defaultOwnerTeamId,
          );
        }
        if (
          body.default_reviewer_actor_id !== undefined ||
          body.default_reviewer_team_id !== undefined
        ) {
          await validateResponsibilityDefault(
            tx,
            checkService,
            actor.workspace_id,
            id,
            'reviewer',
            body.default_reviewer_actor_id !== undefined
              ? body.default_reviewer_actor_id
              : existing.defaultReviewerActorId,
            body.default_reviewer_team_id !== undefined
              ? body.default_reviewer_team_id
              : existing.defaultReviewerTeamId,
          );
        }

        if (Object.keys(changes).length === 0) {
          const dto = toDto(existing);
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
            {
              fields: [
                { path: ['default_owner_actor_id'], code: 'mutually_exclusive' },
                { path: ['default_owner_team_id'], code: 'mutually_exclusive' },
              ],
            },
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

        // The row is exclusively locked until commit. Do not use transaction-start now().
        const changedAt = await tx.execute<{ changed_at: string }>(
          sql`select to_char(clock_timestamp() at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') as changed_at`,
        );
        const configurationChangedAt = changedAt.rows[0]?.changed_at;
        if (!configurationChangedAt) throw new HttpError('internal.unexpected', 'DB clock missing');
        await auditService.record(tx, {
          workspace_id: actor.workspace_id,
          actor_id: actor.actor_id,
          event_type: UPDATED,
          subject_type: 'managed_system',
          subject_id: id,
          summary: `Managed System updated: ${updated.slug}`,
          detail: {
            managed_system_id: id,
            changes,
            configuration_changed_at: configurationChangedAt,
          },
        });

        const dto = toDto(updated);
        return { status: 200, body: dto };
      };

      return options.idempotencyKey
        ? idempotencyService.runIdempotent(
            tx,
            actor.actor_id,
            options.idempotencyKey,
            requestHash,
            run,
          )
        : run();
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
      const run = async () => {
        await requireWorkspaceAdmin(checkService, actor, tx);

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
        const cascadedIds = await cascadeArchiveActiveChildren(tx, auditService, {
          workspaceId: actor.workspace_id,
          actorId: actor.actor_id,
          managedSystemId: id,
          now,
        });

        await auditService.record(tx, {
          workspace_id: actor.workspace_id,
          actor_id: actor.actor_id,
          event_type: ARCHIVED,
          subject_type: 'managed_system',
          subject_id: id,
          summary: `Managed System archived: ${archived.slug}`,
          detail: { managed_system_id: id, cascaded_analytics_area_ids: cascadedIds },
        });

        const body = { ...toDto(archived), cascaded_analytics_area_ids: cascadedIds };
        return { status: 200, body };
      };

      return options.idempotencyKey
        ? idempotencyService.runIdempotent(
            tx,
            actor.actor_id,
            options.idempotencyKey,
            requestHash,
            run,
          )
        : run();
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

  async function getDefaultCandidates(actor: ActorContext, managedSystemId?: string) {
    return db.transaction(async (tx): Promise<ManagedSystemDefaultCandidates> => {
      await requireWorkspaceAdmin(checkService, actor, tx);
      let system: Row | undefined;
      if (managedSystemId) {
        [system] = await tx
          .select()
          .from(managedSystems)
          .where(
            and(
              eq(managedSystems.id, managedSystemId),
              eq(managedSystems.workspaceId, actor.workspace_id),
            ),
          )
          .limit(1);
        if (!system) throw new HttpError('not_found.record', 'managed_system not found');
      }
      const candidates = await tx
        .select({ id: actors.id, display_name: actors.displayName })
        .from(actors)
        .where(
          and(eq(actors.workspaceId, actor.workspace_id), eq(actors.actorType, 'internal_member')),
        )
        .orderBy(asc(actors.displayName), asc(actors.id));
      const result: ManagedSystemDefaultCandidates = { owners: [], reviewers: [] };
      for (const candidate of candidates) {
        for (const kind of ['owner', 'reviewer'] as const) {
          const eligible = !(await responsibilityTargetFailure(
            tx,
            checkService,
            actor.workspace_id,
            managedSystemId,
            kind,
            candidate.id,
            null,
          ));
          const current =
            kind === 'owner' ? system?.defaultOwnerActorId : system?.defaultReviewerActorId;
          if (eligible || candidate.id === current) {
            result[kind === 'owner' ? 'owners' : 'reviewers'].push({ ...candidate, eligible });
          }
        }
      }
      return result;
    });
  }

  async function getDefaultDiagnostics(actor: ActorContext) {
    return db.transaction(async (tx) => {
      await requireWorkspaceAdmin(checkService, actor, tx);
      return readDefaultDiagnostics(tx, checkService, actor.workspace_id);
    });
  }

  return {
    getDefaultCandidates,
    getDefaultDiagnostics,
    registerManagedSystem,
    updateManagedSystem,
    archiveManagedSystem,
    listManagedSystems,
  };
}

export type ManagedSystemService = ReturnType<typeof createManagedSystemService>;
