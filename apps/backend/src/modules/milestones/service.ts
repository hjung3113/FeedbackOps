import type { CreateMilestoneRequest, MilestoneDto } from '@fops/shared';

import type { Db } from '../../db/client.js';
import type { Tx } from '../../db/tx.js';
import { HttpError } from '../../lib/errors.js';
import { lockAnalyticsArea } from '../analytics-areas/index.js';
import type { AuditService } from '../core/audit/audit-service.js';
import type { IdempotencyService } from '../core/idempotency/idempotency-service.js';
import { checkFindingManage, hasElevatedFindingRole } from '../findings/authorization.js';
import { lockManagedSystem } from '../managed-systems/index.js';
import type { CheckService } from '../permissions/check-service.js';
import { type MilestoneRow, insertMilestone } from './repo.js';

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

function milestoneToDto(row: MilestoneRow): MilestoneDto {
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

          return { status: 201, body: milestoneToDto(row) };
        },
      );
    });
  }

  return {
    createMilestone,
    milestoneToDto,
  };
}

export type MilestonesService = ReturnType<typeof createMilestonesService>;
