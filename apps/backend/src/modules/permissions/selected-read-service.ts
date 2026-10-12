import {
  type PermissionRequestAdminDetail,
  type PermissionRequestOwnerDetail,
  type PermissionRiskIndicator,
  isCapability,
  isSensitiveCapability,
  permissionRequestAdminDetailSchema,
  permissionRequestOwnerDetailSchema,
} from '@fops/shared';
import { and, eq, isNull, or } from 'drizzle-orm';
import type { Db } from '../../db/client.js';
import {
  permissionDenies,
  permissionGrants,
  permissionRequests,
} from '../../db/schema/permission.js';
import type { Tx } from '../../db/tx.js';
import { HttpError } from '../../lib/errors.js';
import { findWorkspaceActorDisplay } from '../auth/index.js';
import { latestPermissionRequestQuestion } from '../core/audit/index.js';
import { permissionTaskSourceSummary } from '../tasks/index.js';
import { permissionVocSourceSummary } from '../voc/index.js';
import { getResolvedWorkspaceSettings } from '../workspace-settings/index.js';
import { type ActorContext, type CheckService, applyAdminModuleBypass } from './check-service.js';
import { isSupportedScope, supportedScopeCandidates } from './supported-scope-policy.js';

type RequestRow = typeof permissionRequests.$inferSelect;
export type SelectedReadService = ReturnType<typeof createSelectedReadService>;

export function createSelectedReadService(deps: { db: Db; checkService: CheckService }) {
  const { db, checkService } = deps;

  async function selected(tx: Tx, actor: ActorContext, id: string, owner: boolean) {
    const [row] = await tx
      .select()
      .from(permissionRequests)
      .where(
        and(
          eq(permissionRequests.id, id),
          eq(permissionRequests.workspaceId, actor.workspace_id),
          ...(owner ? [eq(permissionRequests.requesterActorId, actor.actor_id)] : []),
        ),
      )
      .limit(1);
    if (!row) throw new HttpError('not_found.record', 'permission request not found');
    return row;
  }

  function capability(row: RequestRow) {
    if (!isCapability(row.requestedCapability)) {
      // Historical unsupported data is a calculation failure, never a successful zero signal.
      throw new Error('cannot calculate selected request context for unknown capability');
    }
    return row.requestedCapability;
  }

  async function common(tx: Tx, actor: ActorContext, row: RequestRow) {
    const source_summary =
      row.sourceObjectId === null
        ? null
        : row.sourceObjectType === 'task'
          ? await permissionTaskSourceSummary(tx, checkService, actor, row.sourceObjectId)
          : row.sourceObjectType === 'voc'
            ? await permissionVocSourceSummary(tx, actor, row.sourceObjectId)
            : null;
    // Survey/response and unsupported source identities remain opaque. No raw candidate reads.
    return {
      id: row.id,
      requester_actor_id: row.requesterActorId,
      requested_capability: row.requestedCapability,
      requested_managed_system_id: row.requestedManagedSystemId,
      requested_object_type: row.requestedObjectType,
      requested_object_id: row.requestedObjectId,
      reason: row.reason,
      requested_expiration: row.requestedExpiration?.toISOString() ?? null,
      source_object_type: row.sourceObjectType,
      source_object_id: row.sourceObjectId,
      source_action_id: row.sourceActionId,
      return_route_intent: row.returnRouteIntent,
      source_summary,
      status: row.status,
      revision: row.revision,
      created_at: row.createdAt.toISOString(),
      updated_at: row.updatedAt.toISOString(),
    };
  }

  async function ownerDetail(
    actor: ActorContext,
    id: string,
  ): Promise<PermissionRequestOwnerDetail> {
    return db.transaction(
      async (tx) => {
        const row = await selected(tx, actor, id, true);
        const latest_admin_question = await latestPermissionRequestQuestion(
          tx,
          actor.workspace_id,
          row.id,
        );
        const cap = capability(row);
        const editable_scope_candidates = await supportedScopeCandidates(
          tx,
          actor.workspace_id,
          cap,
        );
        return permissionRequestOwnerDetailSchema.parse({
          ...(await common(tx, actor, row)),
          latest_admin_question,
          editable_scope_candidates,
          allowed_actions:
            row.status === 'pending'
              ? ['edit', 'withdraw']
              : row.status === 'needs_more_info'
                ? ['supplement', 'withdraw']
                : [],
        });
      },
      { isolationLevel: 'repeatable read', accessMode: 'read only' },
    );
  }

  async function adminDetail(
    actor: ActorContext,
    id: string,
  ): Promise<PermissionRequestAdminDetail> {
    return db.transaction(
      async (tx) => {
        // Authorize before reading either request identity or requester context.
        const authority = await checkService.checkCapability(
          actor,
          'workspace.admin',
          {
            workspace_id: actor.workspace_id,
          },
          { tx },
        );
        if (!authority.allow) throw new HttpError('permission.denied', 'workspace.admin required');
        const row = await selected(tx, actor, id, false);
        const requester = await findWorkspaceActorDisplay(tx, {
          workspaceId: actor.workspace_id,
          actorId: row.requesterActorId,
        });
        if (!requester) throw new Error('selected requester context unavailable');
        const cap = capability(row);
        const recipient: ActorContext = {
          actor_id: requester.id,
          workspace_id: actor.workspace_id,
          role_level: requester.role_level,
        };
        const decision = applyAdminModuleBypass(
          requester.role_level,
          cap,
          await checkService.checkCapability(
            recipient,
            cap,
            {
              workspace_id: actor.workspace_id,
              ...(row.requestedManagedSystemId === null
                ? {}
                : { managed_system_id: row.requestedManagedSystemId }),
            },
            { tx },
          ),
        );
        const scope = await checkService.capabilityScope(
          recipient,
          cap,
          {
            workspace_id: actor.workspace_id,
          },
          { tx },
        );
        const [grant] =
          decision.allow && decision.grant_id !== undefined
            ? await tx
                .select({
                  expiresAt: permissionGrants.expiresAt,
                  managedSystemId: permissionGrants.managedSystemId,
                })
                .from(permissionGrants)
                .where(
                  and(
                    eq(permissionGrants.id, decision.grant_id),
                    eq(permissionGrants.workspaceId, actor.workspace_id),
                    eq(permissionGrants.actorId, requester.id),
                  ),
                )
                .limit(1)
            : [];
        // Overlap is deliberately separate from checkCapability's existing scope semantics.
        const matching_denies = await tx
          .select({
            id: permissionDenies.id,
            managed_system_id: permissionDenies.managedSystemId,
          })
          .from(permissionDenies)
          .where(
            and(
              eq(permissionDenies.workspaceId, actor.workspace_id),
              eq(permissionDenies.actorId, requester.id),
              eq(permissionDenies.capability, cap),
              isNull(permissionDenies.revokedAt),
              ...(row.requestedManagedSystemId === null
                ? []
                : [
                    or(
                      isNull(permissionDenies.managedSystemId),
                      eq(permissionDenies.managedSystemId, row.requestedManagedSystemId),
                    ),
                  ]),
            ),
          )
          .orderBy(permissionDenies.id);
        const risk_indicators: PermissionRiskIndicator[] = [];
        if (isSensitiveCapability(cap))
          risk_indicators.push({ code: 'sensitive_capability', evidence: { capability: cap } });
        if (row.requestedManagedSystemId === null)
          risk_indicators.push({ code: 'workspace_scope', evidence: { managed_system_id: null } });
        if (row.requestedExpiration === null)
          risk_indicators.push({ code: 'no_expiration', evidence: { requested_expiration: null } });
        const [firstDeny, ...otherDenies] = matching_denies;
        if (firstDeny)
          risk_indicators.push({
            code: 'active_deny',
            evidence: { denies: [firstDeny, ...otherDenies] },
          });
        const candidates = await supportedScopeCandidates(tx, actor.workspace_id, cap);
        const approval_scope_candidates = isSupportedScope(
          candidates,
          row.requestedManagedSystemId,
          row.requestedObjectType,
          row.requestedObjectId,
        )
          ? candidates.filter(
              (candidate) =>
                row.requestedManagedSystemId === null ||
                candidate.managed_system_id === row.requestedManagedSystemId,
            )
          : [];
        const policy = await getResolvedWorkspaceSettings(tx, actor.workspace_id);
        const is_requester = actor.actor_id === requester.id;
        const open = row.status === 'pending' || row.status === 'needs_more_info';
        const canApprove =
          approval_scope_candidates.length > 0 &&
          !(is_requester && policy.permission_self_approval === 'forbidden');
        return permissionRequestAdminDetailSchema.parse({
          ...(await common(tx, actor, row)),
          requester,
          effective_access: {
            decision,
            scope,
            expires_at: grant?.expiresAt?.toISOString() ?? null,
            granted_managed_system_id: grant?.managedSystemId ?? null,
          },
          administrative_authority: {
            capability: 'workspace.admin',
            allowed: true,
            is_requester,
            permission_self_approval: policy.permission_self_approval,
            self_approval_required: is_requester && policy.permission_self_approval === 'allowed',
          },
          approval_scope_candidates,
          matching_denies,
          risk_indicators,
          allowed_actions: open
            ? [...(canApprove ? ['approve'] : []), 'reject', 'need_more_info', 'deny']
            : [],
        });
      },
      { isolationLevel: 'repeatable read', accessMode: 'read only' },
    );
  }

  return { ownerDetail, adminDetail };
}
