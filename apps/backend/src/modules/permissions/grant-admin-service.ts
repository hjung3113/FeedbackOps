import { randomUUID } from 'node:crypto';

import { and, asc, desc, eq, gt, inArray, isNull, or } from 'drizzle-orm';

import {
  type AuditEventType,
  CAPABILITIES,
  type Capability,
  type DirectPermissionGrant,
  type PermissionDenyAdminItem,
  type PermissionGrantAdminItem,
  type PermissionGrantOptions,
  type PermissionGrantPreflight,
  type RevokePermissionBody,
  type RevokePermissionResult,
  directPermissionGrantSchema,
  permissionGrantOptionsSchema,
} from '@fops/shared';

import type { Db } from '../../db/client.js';
import {
  permissionDenies,
  permissionGrants,
  permissionRequests,
} from '../../db/schema/permission.js';
import type { Tx } from '../../db/tx.js';
import { HttpError } from '../../lib/errors.js';
import { findWorkspaceActorDisplay, lockWorkspaceActor } from '../auth/index.js';
import type { AuditService } from '../core/audit/audit-service.js';
import { hashRequestBody } from '../core/idempotency/canonicalize.js';
import type { IdempotencyService } from '../core/idempotency/idempotency-service.js';
import type { NotificationNotifier } from '../notifications/index.js';
import {
  getResolvedWorkspaceSettings,
  getResolvedWorkspaceSettingsForUpdate,
} from '../workspace-settings/index.js';
import type { ActorContext, CheckService } from './check-service.js';
import { writePermissionGrant } from './grant-command.js';
import {
  supportedScopeCandidates,
  validateRequestExpiration,
  validateSupportedScope,
} from './supported-scope-policy.js';

export interface GrantAdminServiceDeps {
  db: Db;
  checkService: CheckService;
  auditService: AuditService;
  idempotencyService: IdempotencyService;
  notify: NotificationNotifier;
}

export interface GrantAdminServiceOptions {
  idempotencyKey?: string | undefined;
}

export type GrantAdminService = ReturnType<typeof createGrantAdminService>;

export function createGrantAdminService(deps: GrantAdminServiceDeps) {
  async function assertAdmin(actor: ActorContext, tx?: Tx): Promise<void> {
    const options = tx !== undefined ? { tx } : {};
    const decision = await deps.checkService.checkCapability(
      actor,
      'workspace.admin',
      { workspace_id: actor.workspace_id },
      options,
    );
    if (decision.allow !== true) {
      throw new HttpError('permission.denied', 'workspace.admin required');
    }
  }

  async function preflight(
    tx: Tx,
    workspaceId: string,
    actorId: string,
    capability: Capability,
    managedSystemId: string | null,
  ): Promise<PermissionGrantPreflight> {
    const [request] = await tx
      .select({ id: permissionRequests.id })
      .from(permissionRequests)
      .where(
        and(
          eq(permissionRequests.workspaceId, workspaceId),
          eq(permissionRequests.requesterActorId, actorId),
          eq(permissionRequests.requestedCapability, capability),
          managedSystemId === null
            ? isNull(permissionRequests.requestedManagedSystemId)
            : eq(permissionRequests.requestedManagedSystemId, managedSystemId),
          isNull(permissionRequests.requestedObjectType),
          isNull(permissionRequests.requestedObjectId),
          inArray(permissionRequests.status, ['pending', 'needs_more_info']),
        ),
      )
      .orderBy(asc(permissionRequests.createdAt), asc(permissionRequests.id))
      .limit(1);
    if (request)
      return {
        state: 'request_review',
        request_id: request.id,
        review_route: `/admin/permissions/requests?selected=${request.id}`,
      };
    const denies = await tx
      .select({ id: permissionDenies.id })
      .from(permissionDenies)
      .where(
        and(
          eq(permissionDenies.workspaceId, workspaceId),
          eq(permissionDenies.actorId, actorId),
          eq(permissionDenies.capability, capability),
          isNull(permissionDenies.revokedAt),
          managedSystemId === null
            ? undefined
            : or(
                isNull(permissionDenies.managedSystemId),
                eq(permissionDenies.managedSystemId, managedSystemId),
              ),
        ),
      )
      .orderBy(asc(permissionDenies.id));
    if (denies.length > 0)
      return {
        state: 'deny_lift',
        deny_ids: denies.map((deny) => deny.id),
        lift_route: `/admin/permissions/grants?tab=denies&selected=${denies[0]?.id}`,
      };
    return { state: 'available' };
  }

  async function grantOptions(
    actor: ActorContext,
    actorId: string,
  ): Promise<PermissionGrantOptions> {
    return deps.db.transaction(
      async (tx) => {
        await assertAdmin(actor, tx);
        const recipient = await findWorkspaceActorDisplay(tx, {
          workspaceId: actor.workspace_id,
          actorId,
        });
        if (!recipient) throw new HttpError('not_found.record', 'recipient not found');
        const settings = await getResolvedWorkspaceSettings(tx, actor.workspace_id);
        const candidates: PermissionGrantOptions['candidates'] = [];
        for (const capability of CAPABILITIES) {
          const scopes = await supportedScopeCandidates(tx, actor.workspace_id, capability);
          for (const scope of scopes)
            candidates.push({
              capability,
              ...scope,
              governance_required: capability === 'workspace.admin',
              preflight: await preflight(
                tx,
                actor.workspace_id,
                actorId,
                capability,
                scope.managed_system_id,
              ),
            });
        }
        return permissionGrantOptionsSchema.parse({
          recipient,
          self_policy: settings.permission_self_approval,
          self_approval_required:
            actorId === actor.actor_id && settings.permission_self_approval === 'allowed',
          candidates,
        });
      },
      { isolationLevel: 'repeatable read', accessMode: 'read only' },
    );
  }

  async function grant(
    actor: ActorContext,
    body: DirectPermissionGrant,
    options: GrantAdminServiceOptions = {},
  ): Promise<{ status: number; body: PermissionGrantAdminItem }> {
    return deps.db.transaction(async (tx) => {
      await assertAdmin(actor, tx);
      const parsed = directPermissionGrantSchema.safeParse(body);
      if (!parsed.success)
        throw new HttpError('validation.failed', 'invalid direct grant', {
          fields: parsed.error.issues.map((issue) => ({ path: issue.path, code: issue.code })),
        });
      const input = parsed.data;
      const recipient = await lockWorkspaceActor(tx, {
        workspaceId: actor.workspace_id,
        actorId: input.actor_id,
      });
      if (!recipient) throw new HttpError('not_found.record', 'recipient not found');
      const requestHash = hashRequestBody({ action: 'direct_grant', ...input });
      const run = async (): Promise<{ status: number; body: PermissionGrantAdminItem }> => {
        const managedSystemId = input.managed_system_id ?? null;
        await validateSupportedScope(
          tx,
          actor.workspace_id,
          input.capability,
          managedSystemId,
          null,
          null,
          { approval: true, field: 'managed_system_id' },
        );
        const expiresAt = input.expires_at ? new Date(input.expires_at) : null;
        validateRequestExpiration(expiresAt, 'expires_at');
        const state = await preflight(
          tx,
          actor.workspace_id,
          input.actor_id,
          input.capability,
          managedSystemId,
        );
        if (state.state === 'request_review')
          throw new HttpError(
            'conflict.permission_request_duplicate',
            'matching open request requires review',
            { request_id: state.request_id, review_route: state.review_route },
          );
        if (state.state === 'deny_lift')
          throw new HttpError(
            'conflict.capability_already_denied',
            'overlapping deny requires explicit lift',
            { deny_ids: state.deny_ids, lift_route: state.lift_route },
          );
        const settings = await getResolvedWorkspaceSettingsForUpdate(tx, actor.workspace_id);
        const self = input.actor_id === actor.actor_id;
        if (self && settings.permission_self_approval === 'forbidden') {
          throw new HttpError('permission.denied', 'self grant forbidden by workspace policy');
        }
        if (self !== (input.self_approval !== undefined)) {
          throw new HttpError(
            'validation.failed',
            'self envelope must accompany only a self grant',
            {
              fields: [{ path: ['self_approval'], code: 'custom' }],
            },
          );
        }
        validateRequestExpiration(expiresAt, 'expires_at');
        const result = await writePermissionGrant(tx, {
          workspaceId: actor.workspace_id,
          actorId: input.actor_id,
          capability: input.capability,
          managedSystemId,
          grantedByActorId: actor.actor_id,
          expiresAt,
          reason: input.reason,
        });
        await deps.auditService.record(tx, {
          workspace_id: actor.workspace_id,
          actor_id: actor.actor_id,
          event_type: 'permission_granted',
          subject_type: 'permission_grant',
          subject_id: result.item.id,
          summary: 'Permission granted',
          detail: {
            grant_id: result.item.id,
            grantee_actor_id: input.actor_id,
            capability: input.capability,
            managed_system_id: managedSystemId,
            reason: input.reason,
            expires_at: result.item.expires_at,
            mode: result.previousGrantId ? 'reissue' : 'create',
            ...(result.previousGrantId ? { previous_grant_id: result.previousGrantId } : {}),
            ...(self ? { self_grant: true, self_approval: input.self_approval } : {}),
          },
        });
        return { status: 201, body: result.item };
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
  async function listGrants(actor: ActorContext): Promise<{ items: PermissionGrantAdminItem[] }> {
    await assertAdmin(actor);
    const now = new Date();
    const rows = await deps.db
      .select({
        id: permissionGrants.id,
        actorId: permissionGrants.actorId,
        capability: permissionGrants.capability,
        managedSystemId: permissionGrants.managedSystemId,
        grantedByActorId: permissionGrants.grantedByActorId,
        grantedAt: permissionGrants.grantedAt,
        expiresAt: permissionGrants.expiresAt,
      })
      .from(permissionGrants)
      .where(
        and(
          eq(permissionGrants.workspaceId, actor.workspace_id),
          isNull(permissionGrants.revokedAt),
          isNull(permissionGrants.supersededAt),
          or(isNull(permissionGrants.expiresAt), gt(permissionGrants.expiresAt, now)),
        ),
      )
      .orderBy(desc(permissionGrants.grantedAt));

    return {
      items: rows.map((row) => ({
        id: row.id,
        actor_id: row.actorId,
        capability: row.capability,
        managed_system_id: row.managedSystemId,
        granted_by_actor_id: row.grantedByActorId,
        granted_at: row.grantedAt.toISOString(),
        expires_at: row.expiresAt?.toISOString() ?? null,
      })),
    };
  }

  async function listDenies(actor: ActorContext): Promise<{ items: PermissionDenyAdminItem[] }> {
    await assertAdmin(actor);
    const rows = await deps.db
      .select({
        id: permissionDenies.id,
        actorId: permissionDenies.actorId,
        capability: permissionDenies.capability,
        managedSystemId: permissionDenies.managedSystemId,
        reason: permissionDenies.reason,
        createdByActorId: permissionDenies.createdByActorId,
        createdAt: permissionDenies.createdAt,
      })
      .from(permissionDenies)
      .where(
        and(
          eq(permissionDenies.workspaceId, actor.workspace_id),
          isNull(permissionDenies.revokedAt),
        ),
      )
      .orderBy(desc(permissionDenies.createdAt));

    return {
      items: rows.map((row) => ({
        id: row.id,
        actor_id: row.actorId,
        capability: row.capability,
        managed_system_id: row.managedSystemId,
        reason: row.reason,
        created_by_actor_id: row.createdByActorId,
        created_at: row.createdAt.toISOString(),
      })),
    };
  }

  async function revokeGrant(
    actor: ActorContext,
    grantId: string,
    body: RevokePermissionBody,
    options: GrantAdminServiceOptions = {},
  ): Promise<{ status: number; body: RevokePermissionResult }> {
    return deps.db.transaction(async (tx) => {
      await assertAdmin(actor, tx);
      const reason = requireReason(body.reason);
      const requestHash = hashRequestBody({ grant_id: grantId, reason });

      const run = async (): Promise<{ status: number; body: RevokePermissionResult }> => {
        const rows = await tx
          .select()
          .from(permissionGrants)
          .where(
            and(
              eq(permissionGrants.id, grantId),
              eq(permissionGrants.workspaceId, actor.workspace_id),
            ),
          )
          .for('update');
        const grant = rows[0];
        if (!grant) throw new HttpError('not_found.record', 'permission grant not found');

        const now = new Date();
        if (
          grant.revokedAt !== null ||
          grant.supersededAt !== null ||
          (grant.expiresAt !== null && grant.expiresAt <= now)
        ) {
          throw new HttpError('conflict.permission_not_active', 'permission grant is not active');
        }

        const updated = await tx
          .update(permissionGrants)
          .set({ revokedAt: now, revokedByActorId: actor.actor_id, revokedReason: reason })
          .where(
            and(
              eq(permissionGrants.id, grant.id),
              eq(permissionGrants.workspaceId, actor.workspace_id),
            ),
          )
          .returning({ revokedAt: permissionGrants.revokedAt });
        const revokedAt = updated[0]?.revokedAt;
        if (!revokedAt) {
          throw new HttpError('internal.unexpected', 'permission grant revoke returned no row');
        }

        const eventType: AuditEventType = 'permission_revoked';
        await deps.auditService.record(tx, {
          workspace_id: actor.workspace_id,
          actor_id: actor.actor_id,
          event_type: eventType,
          subject_type: 'permission_grant',
          subject_id: grant.id,
          summary: 'Permission grant revoked',
          detail: {
            grant_id: grant.id,
            capability: grant.capability,
            managed_system_id: grant.managedSystemId,
            grantee_actor_id: grant.actorId,
            reason,
          },
        });

        await deps.notify(tx, 'permission_grant.revoked', {
          workspace_id: actor.workspace_id,
          actor_ids: [grant.actorId],
          subject_id: grant.id,
          correlation_id: randomUUID(),
          detail: { permission_grant_id: grant.id },
          params: {},
        });

        return { status: 200, body: { id: grant.id, revoked_at: revokedAt.toISOString() } };
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

  async function revokeDeny(
    actor: ActorContext,
    denyId: string,
    body: RevokePermissionBody,
    options: GrantAdminServiceOptions = {},
  ): Promise<{ status: number; body: RevokePermissionResult }> {
    return deps.db.transaction(async (tx) => {
      await assertAdmin(actor, tx);
      const reason = requireReason(body.reason);
      const requestHash = hashRequestBody({ deny_id: denyId, reason });

      const run = async (): Promise<{ status: number; body: RevokePermissionResult }> => {
        const rows = await tx
          .select()
          .from(permissionDenies)
          .where(
            and(
              eq(permissionDenies.id, denyId),
              eq(permissionDenies.workspaceId, actor.workspace_id),
            ),
          )
          .for('update');
        const deny = rows[0];
        if (!deny) throw new HttpError('not_found.record', 'permission deny not found');
        if (deny.revokedAt !== null) {
          throw new HttpError('conflict.permission_not_active', 'permission deny is not active');
        }
        const isSelfLift = deny.actorId === actor.actor_id;
        if (isSelfLift) {
          const workspaceSettings = await getResolvedWorkspaceSettingsForUpdate(
            tx,
            actor.workspace_id,
          );
          if (workspaceSettings.permission_self_approval === 'forbidden') {
            throw new HttpError(
              'permission.denied',
              'self deny lift forbidden by workspace policy',
            );
          }
        }

        const updated = await tx
          .update(permissionDenies)
          .set({ revokedAt: new Date(), revokedByActorId: actor.actor_id })
          .where(
            and(
              eq(permissionDenies.id, deny.id),
              eq(permissionDenies.workspaceId, actor.workspace_id),
            ),
          )
          .returning({ revokedAt: permissionDenies.revokedAt });
        const revokedAt = updated[0]?.revokedAt;
        if (!revokedAt) {
          throw new HttpError('internal.unexpected', 'permission deny revoke returned no row');
        }

        const eventType: AuditEventType = 'permission_deny_revoked';
        await deps.auditService.record(tx, {
          workspace_id: actor.workspace_id,
          actor_id: actor.actor_id,
          event_type: eventType,
          subject_type: 'permission_deny',
          subject_id: deny.id,
          summary: 'Permission deny lifted',
          detail: {
            deny_id: deny.id,
            capability: deny.capability,
            managed_system_id: deny.managedSystemId,
            denied_actor_id: deny.actorId,
            reason,
            ...(isSelfLift ? { self_lift: true as const } : {}),
          },
        });

        return { status: 200, body: { id: deny.id, revoked_at: revokedAt.toISOString() } };
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

  async function resolveNotificationReference(actor: ActorContext, grantId: string) {
    const rows = await deps.db
      .select({
        id: permissionGrants.id,
        actorId: permissionGrants.actorId,
        capability: permissionGrants.capability,
      })
      .from(permissionGrants)
      .where(
        and(eq(permissionGrants.id, grantId), eq(permissionGrants.workspaceId, actor.workspace_id)),
      )
      .limit(1);
    const grant = rows[0];
    if (!grant) return null;

    if (grant.actorId !== actor.actor_id) {
      const decision = await deps.checkService.checkCapability(actor, 'workspace.admin', {
        workspace_id: actor.workspace_id,
      });
      if (decision.allow !== true) return null;
    }

    return { id: grant.id, capability: grant.capability };
  }

  return {
    grantOptions,
    grant,
    listGrants,
    listDenies,
    revokeGrant,
    revokeDeny,
    resolveNotificationReference,
  };
}

function requireReason(value: string): string {
  const reason = value.trim();
  if (!reason) {
    throw new HttpError('validation.failed', 'a non-empty revocation reason is required', {
      fields: [{ path: ['reason'], code: 'too_small' }],
    });
  }
  return reason;
}
