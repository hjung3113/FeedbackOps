import type {
  CreateMilestoneRequest,
  ListMilestonesQuery,
  MilestoneDetailDto,
  MilestoneDto,
  MilestoneProgress,
  PatchMilestoneRequest,
} from '@fops/shared';

import type { Db } from '../../db/client.js';
import type { Tx } from '../../db/tx.js';
import { HttpError } from '../../lib/errors.js';
import { lockAnalyticsArea } from '../analytics-areas/index.js';
import { findWorkspaceActor } from '../auth/index.js';
import type { AuditService } from '../core/audit/audit-service.js';
import type { IdempotencyService } from '../core/idempotency/idempotency-service.js';
import { checkFindingManage, hasElevatedFindingRole } from '../findings/authorization.js';
import { findSourceFindingForMilestone } from '../findings/index.js';
import { lockManagedSystem } from '../managed-systems/index.js';
import type { CheckService } from '../permissions/check-service.js';
import { type MilestoneTaskCounts, countTasksByMilestone } from '../tasks/index.js';
import {
  type MilestoneRow,
  findMilestoneById,
  insertMilestone,
  listMilestonesByWorkspace,
  lockMilestoneForUpdate,
  updateMilestone,
} from './repo.js';

export interface MilestonesActor {
  actor_id: string;
  workspace_id: string;
  role_level: 'admin' | 'developer' | 'user';
}

export interface MilestonesServiceDeps {
  db: Db;
  auditService: AuditService;
  checkService: CheckService;
  idempotencyService: IdempotencyService;
}

// #514 B1c — child-Task progress buckets: released_done = done + released
// (B1 formula); in_flight = doing + review + reopened (counting reopened as
// in flight is the design §7 item 4 proposal); queued = backlog + todo;
// total = child count; percent = total === 0 ? 0 : round(100*released_done/total).
// GROUP BY omits empty Milestones, so a missing id reads as all zeros.
function toMilestoneProgress(counts: MilestoneTaskCounts | undefined): MilestoneProgress {
  const { released_done, in_flight, queued, total } = counts ?? {
    released_done: 0,
    in_flight: 0,
    queued: 0,
    total: 0,
  };
  return {
    released_done,
    in_flight,
    queued,
    total,
    percent: total === 0 ? 0 : Math.round((100 * released_done) / total),
  };
}

function milestoneToDto(row: MilestoneRow, progress: MilestoneProgress): MilestoneDto {
  return {
    id: row.id,
    workspace_id: row.workspace_id,
    display_id: row.display_id,
    primary_managed_system_id: row.primary_managed_system_id,
    title: row.title,
    why: row.why,
    status: row.status,
    owner_actor_id: row.owner_actor_id,
    analytics_area_id: row.analytics_area_id,
    start_date: row.start_date,
    target_date: row.target_date,
    created_by: row.created_by,
    created_at: row.created_at.toISOString(),
    updated_at: row.updated_at.toISOString(),
    progress,
  };
}

// Same lock order and scope rules as assertConversionAnalyticsArea in
// tasks/service.ts: lock the Managed System before the Analytics Area, or the
// Milestone insert's FK KEY SHARE can deadlock against a concurrent AA
// archive.
async function assertMilestoneAnalyticsArea(args: {
  tx: Tx;
  workspaceId: string;
  analyticsAreaId: string | null | undefined;
  managedSystemId: string;
}): Promise<void> {
  if (!args.analyticsAreaId) return;
  await lockManagedSystem(args.tx, args.workspaceId, args.managedSystemId);
  const aa = await lockAnalyticsArea(args.tx, args.workspaceId, args.analyticsAreaId);
  if (!aa) throw new HttpError('not_found.record', 'analytics area not found');
  if (aa.managed_system_id !== args.managedSystemId) {
    throw new HttpError('validation.failed', 'analytics_area does not belong to managed_system', {
      fields: [{ path: ['analytics_area_id'], code: 'out_of_scope' }],
    });
  }
  if (aa.archived_at !== null) {
    throw new HttpError('conflict.parent_archived', 'analytics area archived', {
      fields: [{ path: ['analytics_area_id'], code: 'parent_archived' }],
    });
  }
}

async function assertMilestoneOwner(args: {
  tx: Tx;
  workspaceId: string;
  ownerActorId: string;
  managedSystemId: string;
  checkService: CheckService;
}): Promise<void> {
  const owner = await findWorkspaceActor(args.tx, {
    workspaceId: args.workspaceId,
    actorId: args.ownerActorId,
  });
  if (!owner) throw new HttpError('not_found.record', 'owner actor not found');

  const canOwnMilestone = (
    await checkFindingManage(
      args.checkService,
      {
        actor_id: owner.id,
        workspace_id: args.workspaceId,
        role_level: owner.role_level,
      },
      args.managedSystemId,
      { requireElevatedRole: true },
      { tx: args.tx },
    )
  ).allow;
  if (!canOwnMilestone) {
    throw new HttpError(
      'validation.failed',
      'owner actor lacks finding.manage on this managed system',
      {
        fields: [{ path: ['owner_actor_id'], code: 'out_of_scope' }],
      },
    );
  }
}

export function createMilestonesService(deps: MilestonesServiceDeps) {
  async function createMilestone(args: {
    actor: MilestonesActor;
    input: CreateMilestoneRequest;
    idempotencyKey: string;
    requestHash: string;
  }): Promise<{ status: number; body: MilestoneDto }> {
    if (!hasElevatedFindingRole(args.actor)) {
      throw new HttpError('permission.denied', 'finding.manage capability required');
    }
    return deps.db.transaction(async (tx) => {
      return deps.idempotencyService.runIdempotent(
        tx,
        args.actor.actor_id,
        args.idempotencyKey,
        args.requestHash,
        async () => {
          const managedSystem = await lockManagedSystem(
            tx,
            args.actor.workspace_id,
            args.input.primary_managed_system_id,
          );
          if (!managedSystem) throw new HttpError('not_found.record', 'managed system not found');
          if (managedSystem.archived_at !== null) {
            throw new HttpError('conflict.parent_archived', 'parent managed system is archived', {
              fields: [{ path: ['primary_managed_system_id'], code: 'parent_archived' }],
            });
          }

          const canManage = (
            await checkFindingManage(
              deps.checkService,
              args.actor,
              args.input.primary_managed_system_id,
              { requireElevatedRole: true },
              { tx },
            )
          ).allow;
          if (!canManage) {
            throw new HttpError('permission.denied', 'finding.manage capability required');
          }

          if (args.input.owner_actor_id !== undefined) {
            await assertMilestoneOwner({
              tx,
              workspaceId: args.actor.workspace_id,
              ownerActorId: args.input.owner_actor_id,
              managedSystemId: args.input.primary_managed_system_id,
              checkService: deps.checkService,
            });
          }

          await assertMilestoneAnalyticsArea({
            tx,
            workspaceId: args.actor.workspace_id,
            analyticsAreaId: args.input.analytics_area_id,
            managedSystemId: args.input.primary_managed_system_id,
          });

          const row = await insertMilestone(tx, {
            workspaceId: args.actor.workspace_id,
            primaryManagedSystemId: args.input.primary_managed_system_id,
            title: args.input.title,
            why: args.input.why,
            ownerActorId: args.input.owner_actor_id ?? args.actor.actor_id,
            analyticsAreaId: args.input.analytics_area_id ?? null,
            startDate: args.input.start_date,
            targetDate: args.input.target_date,
            createdBy: args.actor.actor_id,
            ...(args.input.status !== undefined ? { status: args.input.status } : {}),
          });

          await deps.auditService.record(tx, {
            workspace_id: args.actor.workspace_id,
            actor_id: args.actor.actor_id,
            event_type: 'milestone_created',
            subject_type: 'milestone',
            subject_id: row.id,
            summary: 'Milestone created',
            detail: {
              milestone_id: row.id,
              display_id: row.display_id,
              primary_managed_system_id: row.primary_managed_system_id,
            },
          });

          return { status: 201, body: milestoneToDto(row, toMilestoneProgress(undefined)) };
        },
      );
    });
  }

  // Out-of-scope rows are filtered per row (no list-wide 403), same shape as
  // listTasks. `managed_system_id=all` keeps the caller's scope.
  async function listMilestones(args: {
    actor: MilestonesActor;
    query: ListMilestonesQuery;
  }): Promise<{ items: MilestoneDto[] }> {
    if (!hasElevatedFindingRole(args.actor)) {
      throw new HttpError('permission.denied', 'finding.manage capability required');
    }
    const managedSystemId =
      args.query.managed_system_id && args.query.managed_system_id !== 'all'
        ? args.query.managed_system_id
        : undefined;
    const rows = await listMilestonesByWorkspace(deps.db, {
      workspaceId: args.actor.workspace_id,
      ...(args.query.status !== undefined ? { status: args.query.status } : {}),
      ...(managedSystemId !== undefined ? { managedSystemId } : {}),
    });
    const visibleRows: MilestoneRow[] = [];
    for (const row of rows) {
      const canManage = (
        await checkFindingManage(deps.checkService, args.actor, row.primary_managed_system_id, {
          requireElevatedRole: true,
        })
      ).allow;
      if (canManage) visibleRows.push(row);
    }
    // #514 B1c — one grouped count query over the already-visible ids only,
    // so an out-of-scope Milestone stays absent (requirement 6).
    const counts = await countTasksByMilestone(deps.db, {
      workspaceId: args.actor.workspace_id,
      milestoneIds: visibleRows.map((row) => row.id),
    });
    return {
      items: visibleRows.map((row) => milestoneToDto(row, toMilestoneProgress(counts.get(row.id)))),
    };
  }

  // #514 A9 — the source Finding read goes through findings/index.ts (the
  // module seam); milestones/repo never touches finding.findings.
  async function getMilestone(args: {
    actor: MilestonesActor;
    milestoneId: string;
  }): Promise<MilestoneDetailDto> {
    if (!hasElevatedFindingRole(args.actor)) {
      throw new HttpError('permission.denied', 'finding.manage capability required');
    }

    const row = await findMilestoneById(deps.db, {
      workspaceId: args.actor.workspace_id,
      milestoneId: args.milestoneId,
    });
    if (!row) throw new HttpError('not_found.record', 'milestone not found');

    const canManage = (
      await checkFindingManage(deps.checkService, args.actor, row.primary_managed_system_id, {
        requireElevatedRole: true,
      })
    ).allow;
    if (!canManage) {
      throw new HttpError('permission.denied', 'finding.manage capability required');
    }

    const source_finding = await findSourceFindingForMilestone(deps.db, {
      workspaceId: args.actor.workspace_id,
      milestoneId: row.id,
    });
    const counts = await countTasksByMilestone(deps.db, {
      workspaceId: args.actor.workspace_id,
      milestoneIds: [row.id],
    });
    return {
      ...milestoneToDto(row, toMilestoneProgress(counts.get(row.id))),
      source_finding,
    };
  }

  async function patchMilestone(args: {
    actor: MilestonesActor;
    milestoneId: string;
    ifMatch: string;
    input: PatchMilestoneRequest;
    idempotencyKey: string;
    requestHash: string;
  }): Promise<{ status: number; body: MilestoneDto }> {
    if (!hasElevatedFindingRole(args.actor)) {
      throw new HttpError('permission.denied', 'finding.manage capability required');
    }
    return deps.db.transaction(async (tx) => {
      return deps.idempotencyService.runIdempotent(
        tx,
        args.actor.actor_id,
        args.idempotencyKey,
        args.requestHash,
        async () => {
          const milestone = await lockMilestoneForUpdate(tx, {
            workspaceId: args.actor.workspace_id,
            milestoneId: args.milestoneId,
          });
          if (!milestone) throw new HttpError('not_found.record', 'milestone not found');

          const canManage = (
            await checkFindingManage(
              deps.checkService,
              args.actor,
              milestone.primary_managed_system_id,
              { requireElevatedRole: true },
              { tx },
            )
          ).allow;
          if (!canManage) {
            throw new HttpError('permission.denied', 'finding.manage capability required');
          }

          if (milestone.updated_at.toISOString() !== args.ifMatch) {
            throw new HttpError(
              'conflict.stale_write',
              'milestone updated_at does not match If-Match',
              { current_updated_at: milestone.updated_at.toISOString() },
            );
          }

          if (args.input.owner_actor_id !== undefined) {
            await assertMilestoneOwner({
              tx,
              workspaceId: args.actor.workspace_id,
              ownerActorId: args.input.owner_actor_id,
              managedSystemId: milestone.primary_managed_system_id,
              checkService: deps.checkService,
            });
          }

          if (args.input.analytics_area_id) {
            await assertMilestoneAnalyticsArea({
              tx,
              workspaceId: args.actor.workspace_id,
              analyticsAreaId: args.input.analytics_area_id,
              managedSystemId: milestone.primary_managed_system_id,
            });
          }

          const fields = Object.keys(args.input);
          const updated = await updateMilestone(tx, {
            workspaceId: args.actor.workspace_id,
            milestoneId: milestone.id,
            patch: {
              ...(args.input.title !== undefined ? { title: args.input.title } : {}),
              ...(args.input.why !== undefined ? { why: args.input.why } : {}),
              ...(args.input.owner_actor_id !== undefined
                ? { ownerActorId: args.input.owner_actor_id }
                : {}),
              ...(args.input.analytics_area_id !== undefined
                ? { analyticsAreaId: args.input.analytics_area_id }
                : {}),
              ...(args.input.start_date !== undefined ? { startDate: args.input.start_date } : {}),
              ...(args.input.target_date !== undefined
                ? { targetDate: args.input.target_date }
                : {}),
              ...(args.input.status !== undefined ? { status: args.input.status } : {}),
            },
          });

          // ADR-0050: a status change records the pair. A title-only PATCH does not.
          const statusChanged =
            args.input.status !== undefined && args.input.status !== milestone.status;
          await deps.auditService.record(tx, {
            workspace_id: args.actor.workspace_id,
            actor_id: args.actor.actor_id,
            event_type: 'milestone_updated',
            subject_type: 'milestone',
            subject_id: milestone.id,
            summary: 'Milestone updated',
            detail: {
              milestone_id: milestone.id,
              fields,
              ...(statusChanged
                ? { from_status: milestone.status, to_status: args.input.status }
                : {}),
            },
          });

          const counts = await countTasksByMilestone(tx, {
            workspaceId: args.actor.workspace_id,
            milestoneIds: [milestone.id],
          });
          return {
            status: 200,
            body: milestoneToDto(updated, toMilestoneProgress(counts.get(milestone.id))),
          };
        },
      );
    });
  }

  return {
    createMilestone,
    listMilestones,
    getMilestone,
    patchMilestone,
    milestoneToDto,
  };
}

export type MilestonesService = ReturnType<typeof createMilestonesService>;
