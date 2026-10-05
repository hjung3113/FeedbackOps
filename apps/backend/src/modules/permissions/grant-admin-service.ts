import { randomUUID } from 'node:crypto';

import { and, desc, eq, gt, isNull, or } from 'drizzle-orm';

import type {
  AuditEventType,
  PermissionDenyAdminItem,
  PermissionGrantAdminItem,
  RevokePermissionBody,
  RevokePermissionResult,
} from '@fops/shared';

import type { Db } from '../../db/client.js';
import { permissionDenies, permissionGrants } from '../../db/schema/permission.js';
import type { Tx } from '../../db/tx.js';
import { HttpError } from '../../lib/errors.js';
import type { AuditService } from '../core/audit/audit-service.js';
import { hashRequestBody } from '../core/idempotency/canonicalize.js';
import type { IdempotencyService } from '../core/idempotency/idempotency-service.js';
import type { NotificationNotifier } from '../notifications/index.js';
import type { ActorContext, CheckService } from './check-service.js';

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
        if (grant.revokedAt !== null || (grant.expiresAt !== null && grant.expiresAt <= now)) {
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

  return { listGrants, listDenies, revokeGrant, revokeDeny, resolveNotificationReference };
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
