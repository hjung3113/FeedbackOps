import { lockRecoveryCommand } from '../../db/recovery-command-lock.js';
import type { RecoveryRecorder } from '../dashboard/recorder.js';
// Permission-request decision application service. Decisions mint the actual
// grant/deny rows consumed by check-service; they never execute the originally
// blocked domain action.

import { randomUUID } from 'node:crypto';

import { and, eq } from 'drizzle-orm';
import type { DatabaseError } from 'pg';

import {
  type ApprovePermissionRequest,
  type AuditEventType,
  type Capability,
  type DenyPermissionRequest,
  type NeedMoreInfoPermissionRequest,
  type PermissionDecisionResult,
  type RejectPermissionRequest,
  isCapability,
  isSensitiveCapability,
} from '@fops/shared';

import type { Db } from '../../db/client.js';
import { permissionDenies, permissionRequests } from '../../db/schema/permission.js';
import type { Tx } from '../../db/tx.js';
import { HttpError } from '../../lib/errors.js';
import { lockWorkspaceActor } from '../auth/index.js';
import type { AuditService } from '../core/audit/audit-service.js';
import { hashRequestBody } from '../core/idempotency/canonicalize.js';
import type { IdempotencyService } from '../core/idempotency/idempotency-service.js';
import type { NotificationNotifier } from '../notifications/index.js';
import { getResolvedWorkspaceSettingsForUpdate } from '../workspace-settings/index.js';
import type { ActorContext, CheckService } from './check-service.js';
import { writePermissionGrant } from './grant-command.js';
import { validateRequestExpiration, validateSupportedScope } from './supported-scope-policy.js';

export interface DecisionServiceDeps {
  recoveryRecorder?: RecoveryRecorder;
  db: Db;
  checkService: CheckService;
  auditService: AuditService;
  idempotencyService: IdempotencyService;
  notify: NotificationNotifier;
  resolveWorkspaceSettings: (
    dbOrTx: Db | Tx,
    workspaceId: string,
  ) => Promise<{ permission_self_approval: 'allowed' | 'forbidden' }>;
}

export interface DecisionOptions {
  idempotencyKey?: string | undefined;
}

export type DecisionService = ReturnType<typeof createDecisionService>;

type DecisionAction = 'approve' | 'reject' | 'need_more_info' | 'deny';
type SelfApprovalEnvelope = {
  policy_citation: string;
  peer_reviewer_absence: string;
};
type DecisionBody = {
  expected_revision: number;
  granted_managed_system_id?: string | null | undefined;
  reason?: string | undefined;
  note?: string | undefined;
  expiration?: string | null | undefined;
  self_approval?: SelfApprovalEnvelope | undefined;
};
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
      await lockRecoveryCommand(tx, actor.workspace_id);
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
      const selected = await tx
        .select({ requesterActorId: permissionRequests.requesterActorId })
        .from(permissionRequests)
        .where(
          and(
            eq(permissionRequests.id, requestId),
            eq(permissionRequests.workspaceId, actor.workspace_id),
          ),
        );
      if (!selected[0]) throw new HttpError('not_found.record', 'permission request not found');
      await lockWorkspaceActor(tx, {
        workspaceId: actor.workspace_id,
        actorId: selected[0].requesterActorId,
      });
      const run = async (): Promise<{
        status: number;
        body: PermissionDecisionResult;
      }> => {
        const recovery = await deps.recoveryRecorder?.capture(tx, actor.workspace_id, [
          { type: 'permission_request', id: requestId },
        ]);
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
        if (
          !DECIDABLE_STATUSES.includes(request.status as DecidableStatus) ||
          request.revision !== body.expected_revision
        ) {
          throw new HttpError(
            'conflict.stale_write',
            'permission request status or revision changed',
            {
              current_revision: request.revision,
            },
          );
        }
        if (!isCapability(request.requestedCapability)) {
          throw new HttpError('validation.unknown_capability', 'unknown capability', {
            capability: request.requestedCapability,
          });
        }
        const capability: Capability = request.requestedCapability;
        const reason = body.reason?.trim();
        const note = body.note?.trim();
        const isSelfApproval = action === 'approve' && request.requesterActorId === actor.actor_id;
        if (action === 'approve') {
          const workspaceSettings = await getResolvedWorkspaceSettingsForUpdate(
            tx,
            actor.workspace_id,
          );
          if (isSelfApproval) {
            if (workspaceSettings.permission_self_approval === 'forbidden') {
              throw new HttpError(
                'permission.denied',
                'self-approval forbidden by workspace policy',
              );
            }
            if (!body.self_approval) {
              throw new HttpError('validation.failed', 'self-approval envelope is required', {
                fields: [{ path: ['self_approval'], code: 'custom' }],
              });
            }
          } else if (body.self_approval) {
            throw new HttpError(
              'validation.failed',
              'self-approval envelope is only valid for self-approval',
              {
                fields: [{ path: ['self_approval'], code: 'custom' }],
              },
            );
          }
        }
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

        let grantedManagedSystemId = request.requestedManagedSystemId;
        if (action === 'approve') {
          await validateSupportedScope(
            tx,
            actor.workspace_id,
            capability,
            request.requestedManagedSystemId,
            request.requestedObjectType,
            request.requestedObjectId,
            { approval: true },
          );
          if (body.granted_managed_system_id !== undefined) {
            if (
              request.requestedManagedSystemId !== null &&
              request.requestedManagedSystemId !== body.granted_managed_system_id
            ) {
              throw new HttpError(
                'validation.failed',
                'approval cannot move or widen requested scope',
                {
                  fields: [{ path: ['granted_managed_system_id'], code: 'custom' }],
                },
              );
            }
            grantedManagedSystemId = body.granted_managed_system_id;
            await validateSupportedScope(
              tx,
              actor.workspace_id,
              capability,
              grantedManagedSystemId,
              null,
              null,
              { approval: true, field: 'granted_managed_system_id' },
            );
          }
        }
        let grantedExpiration = request.requestedExpiration;
        if (action === 'approve' && body.expiration !== undefined) {
          if (body.expiration === null) {
            grantedExpiration = null;
          } else {
            grantedExpiration = new Date(body.expiration);
            if (grantedExpiration.getTime() <= Date.now()) {
              throw new HttpError(
                'validation.failed',
                'approval expiration must be in the future',
                {
                  fields: [{ path: ['expiration'], code: 'custom' }],
                },
              );
            }
          }
        }

        if (action === 'approve') validateRequestExpiration(grantedExpiration, 'expiration');

        let grantId: string | undefined;
        let previousGrantId: string | undefined;
        let denyId: string | undefined;
        const status =
          action === 'approve'
            ? 'approved'
            : action === 'need_more_info'
              ? 'needs_more_info'
              : 'rejected';

        try {
          if (action === 'approve') {
            // Policy lock precedes the shared writer's grant-row lock for all approvals.
            validateRequestExpiration(grantedExpiration, 'expiration');
            const result = await writePermissionGrant(tx, {
              workspaceId: request.workspaceId,
              actorId: request.requesterActorId,
              capability,
              managedSystemId: grantedManagedSystemId,
              grantedByActorId: actor.actor_id,
              expiresAt: grantedExpiration,
              reason: reason || null,
            });
            grantId = result.item.id;
            previousGrantId = result.previousGrantId;
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

        const updatedAt = new Date();
        await tx
          .update(permissionRequests)
          .set({ status, revision: request.revision + 1, updatedAt })
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
          previous_revision: request.revision,
          revision: request.revision + 1,
          capability,
          managed_system_id: request.requestedManagedSystemId,
          requester_actor_id: request.requesterActorId,
          ...(action === 'need_more_info' ? { note: note as string } : { reason: reason || null }),
          ...(grantId ? { grant_id: grantId } : {}),
          ...(previousGrantId ? { previous_grant_id: previousGrantId } : {}),
          ...(action === 'approve'
            ? {
                requested_managed_system_id: request.requestedManagedSystemId,
                granted_managed_system_id: grantedManagedSystemId,
                requested_expiration: request.requestedExpiration?.toISOString() ?? null,
                granted_expiration: grantedExpiration?.toISOString() ?? null,
              }
            : {}),
          ...(denyId ? { deny_id: denyId } : {}),
          ...(isSelfApproval ? { self_approval: body.self_approval as SelfApprovalEnvelope } : {}),
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

        if (action === 'approve' || action === 'reject' || action === 'deny') {
          await deps.notify(tx, 'permission_request.decided', {
            workspace_id: actor.workspace_id,
            actor_ids: [request.requesterActorId],
            subject_id: request.id,
            correlation_id: randomUUID(),
            detail: { permission_request_id: request.id },
            params: { outcome: action === 'approve' ? 'approved' : 'rejected' },
          });
        }
        if (recovery) await deps.recoveryRecorder?.finish(tx, recovery, actor.actor_id, 'decide');
        return {
          status: 200,
          body: {
            id: request.id,
            revision: request.revision + 1,
            updated_at: updatedAt.toISOString(),
            ...(action === 'approve'
              ? {
                  requested_managed_system_id: request.requestedManagedSystemId,
                  granted_managed_system_id: grantedManagedSystemId,
                  requested_expiration: request.requestedExpiration?.toISOString() ?? null,
                  granted_expiration: grantedExpiration?.toISOString() ?? null,
                }
              : {}),
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
      body: ApprovePermissionRequest,
      options?: DecisionOptions,
    ) => decide(actor, requestId, 'approve', body, options),
    rejectRequest: (
      actor: ActorContext,
      requestId: string,
      body: RejectPermissionRequest,
      options?: DecisionOptions,
    ) => decide(actor, requestId, 'reject', body, options),
    needMoreInfoRequest: (
      actor: ActorContext,
      requestId: string,
      body: NeedMoreInfoPermissionRequest,
      options?: DecisionOptions,
    ) => decide(actor, requestId, 'need_more_info', body, options),
    denyRequest: (
      actor: ActorContext,
      requestId: string,
      body: DenyPermissionRequest,
      options?: DecisionOptions,
    ) => decide(actor, requestId, 'deny', body, options),
  };
}
