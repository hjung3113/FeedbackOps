// Permission-request decision application service. Decisions mint the actual
// grant/deny rows consumed by check-service; they never execute the originally
// blocked domain action.

import { and, eq, sql } from 'drizzle-orm';
import type { DatabaseError } from 'pg';

import {
  type AuditEventType,
  type Capability,
  isCapability,
  isSensitiveCapability,
  type PermissionDecisionResult,
} from '@fops/shared';

import type { Db } from '../../db/client.js';
import {
  permissionDenies,
  permissionGrants,
  permissionRequests,
} from '../../db/schema/permission.js';
import { HttpError } from '../../lib/errors.js';
import type { AuditService } from '../core/audit/audit-service.js';
import { hashRequestBody } from '../core/idempotency/canonicalize.js';
import type { IdempotencyService } from '../core/idempotency/idempotency-service.js';
import type { ActorContext, CheckService } from './check-service.js';

export interface DecisionServiceDeps {
  db: Db;
  checkService: CheckService;
  auditService: AuditService;
  idempotencyService: IdempotencyService;
}

export interface DecisionOptions {
  idempotencyKey?: string | undefined;
}

export type DecisionService = ReturnType<typeof createDecisionService>;

type DecisionAction = 'approve' | 'reject' | 'need_more_info' | 'deny';
type DecisionBody = { reason?: string; note?: string };
type DecidableStatus = 'pending' | 'needs_more_info';

const DECIDABLE_STATUSES: readonly DecidableStatus[] = ['pending', 'needs_more_info'];

export function createDecisionService(deps: DecisionServiceDeps) {
  async function decide(
    actor: ActorContext,
    requestId: string,
    action: DecisionAction,
    body: DecisionBody,
    options: DecisionOptions = {},
  ): Promise<{ status: number; body: PermissionDecisionResult }> {
    const requestHash = hashRequestBody({
      request_id: requestId,
      action,
      ...body,
    });

    return deps.db.transaction(async (tx) => {
      // Gate before idempotency replay as well: a cached response never
      // bypasses the authoritative workspace.admin capability check.
      const admin = await deps.checkService.checkCapability(
        actor,
        'workspace.admin',
        { workspace_id: actor.workspace_id },
        { tx },
      );
      if (admin.allow !== true) {
        throw new HttpError('permission.denied', 'workspace.admin required');
      }
      const run = async (): Promise<{
        status: number;
        body: PermissionDecisionResult;
      }> => {
        const rows = await tx
          .select()
          .from(permissionRequests)
          .where(
            and(
              eq(permissionRequests.id, requestId),
              eq(permissionRequests.workspaceId, actor.workspace_id),
            ),
          )
          .for('update');
        const request = rows[0];
        if (!request) throw new HttpError('not_found.record', 'permission request not found');
        if (!DECIDABLE_STATUSES.includes(request.status as DecidableStatus)) {
          throw new HttpError('conflict.stale_write', 'permission request is no longer decidable');
        }
        if (!isCapability(request.requestedCapability)) {
          throw new HttpError('validation.unknown_capability', 'unknown capability', {
            capability: request.requestedCapability,
          });
        }
        const capability: Capability = request.requestedCapability;
        const reason = body.reason?.trim();
        const note = body.note?.trim();
        if (action === 'approve' && isSensitiveCapability(capability) && !reason) {
          throw new HttpError(
            'validation.sensitive_reason_required',
            'a non-empty reason is required for sensitive capabilities',
            { capability },
          );
        }
        if (
          ((action === 'reject' || action === 'deny') && !reason) ||
          (action === 'need_more_info' && !note)
        ) {
          throw new HttpError('validation.failed', 'a non-empty decision reason is required', {
            fields: [
              {
                path: [action === 'need_more_info' ? 'note' : 'reason'],
                code: 'too_small',
              },
            ],
          });
        }

        let grantId: string | undefined;
        let denyId: string | undefined;
        const status =
          action === 'approve'
            ? 'approved'
            : action === 'need_more_info'
              ? 'needs_more_info'
              : 'rejected';

        try {
          if (action === 'approve') {
            const inserted = await tx
              .insert(permissionGrants)
              .values({
                workspaceId: request.workspaceId,
                actorId: request.requesterActorId,
                capability,
                managedSystemId: request.requestedManagedSystemId,
                grantedByActorId: actor.actor_id,
                expiresAt: request.requestedExpiration,
                sensitiveReason: reason || null,
              })
              .returning({ id: permissionGrants.id });
            grantId = inserted[0]?.id;
            if (!grantId)
              throw new HttpError('internal.unexpected', 'permission grant insert returned no row');
          }
          if (action === 'deny') {
            const inserted = await tx
              .insert(permissionDenies)
              .values({
                workspaceId: request.workspaceId,
                actorId: request.requesterActorId,
                capability,
                managedSystemId: request.requestedManagedSystemId,
                reason: reason as string,
                createdByActorId: actor.actor_id,
              })
              .returning({ id: permissionDenies.id });
            denyId = inserted[0]?.id;
            if (!denyId)
              throw new HttpError('internal.unexpected', 'permission deny insert returned no row');
          }
        } catch (err) {
          const pgErr = err as DatabaseError;
          if (pgErr?.code === '23505') {
            throw new HttpError(
              action === 'deny'
                ? 'conflict.capability_already_denied'
                : 'conflict.capability_already_granted',
              action === 'deny'
                ? 'actor already has an active capability deny'
                : 'actor already has an active capability grant',
            );
          }
          throw err;
        }

        await tx
          .update(permissionRequests)
          .set({ status, updatedAt: new Date() })
          .where(eq(permissionRequests.id, request.id));

        const eventType: AuditEventType =
          action === 'approve'
            ? 'permission_approved'
            : action === 'reject'
              ? 'permission_rejected'
              : action === 'need_more_info'
                ? 'permission_needs_more_info'
                : 'permission_denied';
        const detail = {
          capability,
          managed_system_id: request.requestedManagedSystemId,
          requester_actor_id: request.requesterActorId,
          ...(action === 'need_more_info' ? { note: note as string } : { reason: reason || null }),
          ...(grantId ? { grant_id: grantId } : {}),
          ...(denyId ? { deny_id: denyId } : {}),
        };
        await deps.auditService.record(tx, {
          workspace_id: actor.workspace_id,
          actor_id: actor.actor_id,
          event_type: eventType,
          subject_type: 'permission_request',
          subject_id: request.id,
          summary: `Permission request ${action.replaceAll('_', ' ')}`,
          detail,
        });

        return {
          status: 200,
          body: {
            id: request.id,
            status,
            ...(grantId ? { grant_id: grantId } : {}),
            ...(denyId ? { deny_id: denyId } : {}),
          },
        };
      };

      if (!options.idempotencyKey) return run();
      return deps.idempotencyService.runIdempotent(
        tx,
        actor.actor_id,
        options.idempotencyKey,
        requestHash,
        run,
      );
    });
  }

  return {
    approveRequest: (
      actor: ActorContext,
      requestId: string,
      body: { reason?: string },
      options?: DecisionOptions,
    ) => decide(actor, requestId, 'approve', body, options),
    rejectRequest: (
      actor: ActorContext,
      requestId: string,
      body: { reason?: string },
      options?: DecisionOptions,
    ) => decide(actor, requestId, 'reject', body, options),
    needMoreInfoRequest: (
      actor: ActorContext,
      requestId: string,
      body: { note?: string },
      options?: DecisionOptions,
    ) => decide(actor, requestId, 'need_more_info', body, options),
    denyRequest: (
      actor: ActorContext,
      requestId: string,
      body: { reason?: string },
      options?: DecisionOptions,
    ) => decide(actor, requestId, 'deny', body, options),
  };
}
