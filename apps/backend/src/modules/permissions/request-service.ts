// Permission-request application service. Owns the write-side of permission
// asks per docs/implementation/02-domain-module-boundaries.md and
// docs/implementation/05-permission-policy.md.
//
// Single transaction contract (AGENTS.md, ADR-0008):
//   1. Idempotency lookup against (actor_id, key).
//      - match → return stored response verbatim, do nothing else.
//      - mismatch → throw HttpError('conflict.idempotency_key_reuse').
//      - miss → continue.
//   2. Re-run checkCapability; if allow → 409 capability_already_granted.
//   3. INSERT permission_requests row with status='pending'. On the partial
//      unique index violation → 409 permission_request_duplicate.
//   4. Audit `permission_requested` in the same tx.
//   5. Reserve the idempotency row with the 201 response body so retries
//      replay verbatim.
//
// Note on the partial unique index: 0000 migration encodes a COALESCE-tuple
// across (workspace, requester, capability, ms, object_type, object_id,
// source_object_type, source_object_id, source_action_id) filtered on
// status IN ('pending','needs_more_info'). NULLs are mapped to sentinel
// values inside the index so duplicate inserts with all-NULL scope/source
// still collide as expected.

import { and, desc, eq, inArray } from 'drizzle-orm';
import type { DatabaseError } from 'pg';

import {
  type AuditEventType,
  type Capability,
  isCapability,
  isSensitiveCapability,
} from '@fops/shared';

import type { Db } from '../../db/client.js';
import { permissionRequests } from '../../db/schema/permission.js';
import { HttpError } from '../../lib/errors.js';
import type { AuditService } from '../core/audit/audit-service.js';
import { hashRequestBody } from '../core/idempotency/canonicalize.js';
import type { IdempotencyService } from '../core/idempotency/idempotency-service.js';
import type { ActorContext, CheckService } from './check-service.js';

export interface CreatePermissionRequestBody {
  requested_capability: string;
  requested_managed_system_id?: string | undefined;
  requested_object_type?: string | undefined;
  requested_object_id?: string | undefined;
  reason: string;
  requested_expiration?: string | undefined;
  source_object_type?: string | undefined;
  source_object_id?: string | undefined;
  source_action_id?: string | undefined;
  return_route_intent?: string | undefined;
}

export interface CreatePermissionRequestResult {
  status: number;
  body: {
    id: string;
    status: 'pending';
    created_at: string;
  };
}

export interface CreatePermissionRequestOptions {
  /** Optional client-supplied Idempotency-Key (already validated as UUIDv4). */
  idempotencyKey?: string;
}

export interface RequestServiceDeps {
  db: Db;
  checkService: CheckService;
  auditService: AuditService;
  idempotencyService: IdempotencyService;
}

export type RequestService = ReturnType<typeof createRequestService>;

const PERMISSION_REQUESTED: AuditEventType = 'permission_requested';

const ACTIVE_STATUSES = ['pending', 'needs_more_info'] as const;

export function createRequestService(deps: RequestServiceDeps) {
  const { db, checkService, auditService, idempotencyService } = deps;

  async function createRequest(
    actor: ActorContext,
    body: CreatePermissionRequestBody,
    options: CreatePermissionRequestOptions = {},
  ): Promise<CreatePermissionRequestResult> {
    if (!isCapability(body.requested_capability)) {
      throw new HttpError('validation.unknown_capability', 'unknown capability', {
        capability: body.requested_capability,
      });
    }
    const capability: Capability = body.requested_capability;
    const sensitive = isSensitiveCapability(capability);
    // Sensitive capabilities (docs/implementation/05-permission-policy.md:62-76)
    // require a non-empty `reason`. The route Zod schema already requires
    // `reason.min(1)`, but we re-check here so the service emits a distinct
    // ADR-0012 code that downstream UIs can surface specifically.
    if (sensitive && body.reason.trim().length === 0) {
      throw new HttpError(
        'validation.sensitive_reason_required',
        'a non-empty reason is required for sensitive capabilities',
        { capability },
      );
    }
    const requestHash = hashRequestBody(body);

    return await db.transaction(async (tx) => {
      // (1) Idempotency lookup.
      if (options.idempotencyKey) {
        const hit = await idempotencyService.lookup(
          tx,
          actor.actor_id,
          options.idempotencyKey,
          requestHash,
        );
        if (hit.kind === 'match') {
          return {
            status: hit.status,
            body: hit.body as CreatePermissionRequestResult['body'],
          };
        }
        if (hit.kind === 'mismatch') {
          throw new HttpError(
            'conflict.idempotency_key_reuse',
            'Idempotency-Key reused with a different request body',
          );
        }
      }

      // (2) Re-check capability — fail fast if the actor already has it.
      const decision = await checkService.checkCapability(actor, capability, {
        workspace_id: actor.workspace_id,
        ...(body.requested_managed_system_id !== undefined
          ? { managed_system_id: body.requested_managed_system_id }
          : {}),
      });
      if (decision.allow === true) {
        throw new HttpError(
          'conflict.capability_already_granted',
          'actor already holds the requested capability',
        );
      }

      // (3) Insert permission_request row.
      let insertedId: string;
      let insertedCreatedAt: Date;
      try {
        const rows = await tx
          .insert(permissionRequests)
          .values({
            workspaceId: actor.workspace_id,
            requesterActorId: actor.actor_id,
            requestedCapability: capability,
            requestedManagedSystemId: body.requested_managed_system_id ?? null,
            requestedObjectType: body.requested_object_type ?? null,
            requestedObjectId: body.requested_object_id ?? null,
            reason: body.reason,
            requestedExpiration: body.requested_expiration
              ? new Date(body.requested_expiration)
              : null,
            sourceObjectType: body.source_object_type ?? null,
            sourceObjectId: body.source_object_id ?? null,
            sourceActionId: body.source_action_id ?? null,
            returnRouteIntent: body.return_route_intent ?? null,
            status: 'pending',
          })
          .returning({ id: permissionRequests.id, createdAt: permissionRequests.createdAt });
        const row = rows[0];
        if (!row) {
          throw new HttpError('internal.unexpected', 'permission_request insert returned no row');
        }
        insertedId = row.id;
        insertedCreatedAt = row.createdAt;
      } catch (err) {
        // Postgres unique_violation = 23505. The partial unique index
        // `permission_requests_active_uq` fires for an existing
        // pending|needs_more_info row with the same scope/source tuple.
        const pgErr = err as DatabaseError;
        if (pgErr?.code === '23505') {
          throw new HttpError(
            'conflict.permission_request_duplicate',
            'an open permission request already exists for this capability and scope',
          );
        }
        throw err;
      }

      // (4) Audit row, same transaction.
      await auditService.record(tx, {
        workspace_id: actor.workspace_id,
        actor_id: actor.actor_id,
        event_type: PERMISSION_REQUESTED,
        subject_type: 'permission_request',
        subject_id: insertedId,
        summary: `Permission requested: ${capability}`,
        detail: {
          capability,
          managed_system_id: body.requested_managed_system_id ?? null,
          reason: body.reason,
          sensitive,
          source_object_type: body.source_object_type ?? null,
          source_object_id: body.source_object_id ?? null,
          source_action_id: body.source_action_id ?? null,
        },
      });

      const responseBody = {
        id: insertedId,
        status: 'pending' as const,
        created_at: insertedCreatedAt.toISOString(),
      };

      // (5) Reserve the idempotency row.
      if (options.idempotencyKey) {
        await idempotencyService.record(
          tx,
          actor.actor_id,
          options.idempotencyKey,
          requestHash,
          201,
          responseBody,
        );
      }

      return { status: 201, body: responseBody };
    });
  }

  async function listMine(actor: ActorContext) {
    const rows = await db
      .select({
        id: permissionRequests.id,
        requestedCapability: permissionRequests.requestedCapability,
        requestedManagedSystemId: permissionRequests.requestedManagedSystemId,
        reason: permissionRequests.reason,
        requestedObjectType: permissionRequests.requestedObjectType,
        requestedObjectId: permissionRequests.requestedObjectId,
        sourceObjectType: permissionRequests.sourceObjectType,
        sourceObjectId: permissionRequests.sourceObjectId,
        sourceActionId: permissionRequests.sourceActionId,
        status: permissionRequests.status,
        createdAt: permissionRequests.createdAt,
      })
      .from(permissionRequests)
      .where(
        and(
          eq(permissionRequests.workspaceId, actor.workspace_id),
          eq(permissionRequests.requesterActorId, actor.actor_id),
          inArray(permissionRequests.status, [...ACTIVE_STATUSES]),
        ),
      )
      .orderBy(desc(permissionRequests.createdAt));

    return rows.map((r) => ({
      id: r.id,
      requested_capability: r.requestedCapability,
      requested_managed_system_id: r.requestedManagedSystemId,
      reason: r.reason,
      requested_object_type: r.requestedObjectType,
      requested_object_id: r.requestedObjectId,
      source_object_type: r.sourceObjectType,
      source_object_id: r.sourceObjectId,
      source_action_id: r.sourceActionId,
      status: r.status,
      created_at: r.createdAt.toISOString(),
    }));
  }

  return { createRequest, listMine };
}
