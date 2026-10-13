import {
  type Capability,
  type PermissionGrantAdminItem,
  permissionGrantAdminItemSchema,
} from '@fops/shared';
// Caller owns the transaction and recipient → request → policy locks.
// Both approval and requestless grants retain expired provenance through reissue.
import { and, eq, isNull } from 'drizzle-orm';
import { permissionGrants } from '../../db/schema/permission.js';
import type { Tx } from '../../db/tx.js';
import { HttpError } from '../../lib/errors.js';

export async function writePermissionGrant(
  tx: Tx,
  input: {
    workspaceId: string;
    actorId: string;
    capability: Capability;
    managedSystemId: string | null;
    grantedByActorId: string;
    expiresAt: Date | null;
    reason: string | null;
  },
): Promise<{ item: PermissionGrantAdminItem; previousGrantId?: string }> {
  const [predecessor] = await tx
    .select()
    .from(permissionGrants)
    .where(
      and(
        eq(permissionGrants.workspaceId, input.workspaceId),
        eq(permissionGrants.actorId, input.actorId),
        eq(permissionGrants.capability, input.capability),
        input.managedSystemId === null
          ? isNull(permissionGrants.managedSystemId)
          : eq(permissionGrants.managedSystemId, input.managedSystemId),
        isNull(permissionGrants.objectType),
        isNull(permissionGrants.objectId),
        isNull(permissionGrants.revokedAt),
        isNull(permissionGrants.supersededAt),
      ),
    )
    .for('update');
  if (predecessor) {
    const now = new Date();
    if (predecessor.expiresAt === null || predecessor.expiresAt > now) {
      throw new HttpError(
        'conflict.capability_already_granted',
        'actor already has an active capability grant',
      );
    }
    await tx
      .update(permissionGrants)
      .set({ supersededAt: now })
      .where(eq(permissionGrants.id, predecessor.id));
  }
  const [grant] = await tx
    .insert(permissionGrants)
    .values({
      workspaceId: input.workspaceId,
      actorId: input.actorId,
      capability: input.capability,
      managedSystemId: input.managedSystemId,
      grantedByActorId: input.grantedByActorId,
      expiresAt: input.expiresAt,
      sensitiveReason: input.reason,
    })
    .returning();
  if (!grant) throw new HttpError('internal.unexpected', 'permission grant insert returned no row');
  return {
    item: permissionGrantAdminItemSchema.parse({
      id: grant.id,
      actor_id: grant.actorId,
      capability: grant.capability,
      managed_system_id: grant.managedSystemId,
      granted_by_actor_id: grant.grantedByActorId,
      granted_at: grant.grantedAt.toISOString(),
      expires_at: grant.expiresAt?.toISOString() ?? null,
    }),
    ...(predecessor ? { previousGrantId: predecessor.id } : {}),
  };
}
