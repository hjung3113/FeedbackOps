// Auth application service. Per AGENTS.md "backend application services own
// transactions, permissions, audits, idempotency, and cross-system commands."
// Slice 1 #3 has no audits yet (the audit_log writer lands with the first
// audited mutation in Slice 1 #5) but the boundary is established here:
// controllers parse HTTP and call into this service; the service owns every
// DB write touching `core.actors` or `core.sessions`.
//
// First-login auto-provisioning follows ADR-0006:42-52.

import { randomBytes } from 'node:crypto';
import { and, eq, gt, isNull, sql } from 'drizzle-orm';

import type { Db } from '../../db/client.js';
import { actors, sessions } from '../../db/schema/core.js';
import { HttpError } from '../../lib/errors.js';
import type { AuthClaims } from './auth-provider.js';

export interface ActorRecord {
  id: string;
  workspaceId: string;
  externalId: string;
  email: string;
  displayName: string;
  roleLevel: string;
  actorType: string;
}

export interface SessionRecord {
  id: string;
  actorId: string;
  workspaceId: string;
}

/** ADR-0006:23-26 — 12h TTL on issue. `last_seen_at` updated per request. */
export const SESSION_TTL_MS = 12 * 60 * 60 * 1000;

/** ADR-0006:25 — 32+ bytes random, base64url-encoded. 48 bytes → 64 chars. */
function newSessionId(): string {
  return randomBytes(48).toString('base64url');
}

export interface SessionServiceDeps {
  db: Db;
  workspaceId: string;
  now?: () => Date;
}

export interface CreateSessionInput {
  claims: AuthClaims;
  userAgent?: string;
  ip?: string;
}

export function createSessionService(deps: SessionServiceDeps) {
  const now = deps.now ?? (() => new Date());

  return {
    /**
     * First-login auto-provision + session issue. Per ADR-0006:42-52:
     *  1. Look up actor by external_id (= claims.sub) within the workspace.
     *  2. If found, update email/display_name if the claim differs.
     *  3. If not found, insert with role_level='user', actor_type='internal_member'.
     *
     * Returns the issued session id (opaque, set as the cookie value) and the
     * resolved actor record. All writes happen inside one transaction.
     */
    async provisionAndIssueSession(input: CreateSessionInput): Promise<{
      session: SessionRecord;
      actor: ActorRecord;
      expiresAt: Date;
    }> {
      const { claims } = input;
      return deps.db.transaction(async (tx) => {
        // Upsert-or-update actor.
        const existing = await tx
          .select()
          .from(actors)
          .where(and(eq(actors.workspaceId, deps.workspaceId), eq(actors.externalId, claims.sub)))
          .limit(1);

        let actor: ActorRecord;
        if (existing[0]) {
          const row = existing[0];
          if (row.email !== claims.email || row.displayName !== claims.display_name) {
            await tx
              .update(actors)
              .set({
                email: claims.email,
                displayName: claims.display_name,
                updatedAt: now(),
              })
              .where(eq(actors.id, row.id));
            actor = {
              id: row.id,
              workspaceId: row.workspaceId,
              externalId: row.externalId,
              email: claims.email,
              displayName: claims.display_name,
              roleLevel: row.roleLevel,
              actorType: row.actorType,
            };
          } else {
            actor = {
              id: row.id,
              workspaceId: row.workspaceId,
              externalId: row.externalId,
              email: row.email,
              displayName: row.displayName,
              roleLevel: row.roleLevel,
              actorType: row.actorType,
            };
          }
        } else {
          const inserted = await tx
            .insert(actors)
            .values({
              workspaceId: deps.workspaceId,
              externalId: claims.sub,
              email: claims.email,
              displayName: claims.display_name,
              roleLevel: 'user', // ADR-0006:48
              actorType: 'internal_member',
            })
            .returning();
          const row = inserted[0];
          if (!row) {
            throw new HttpError('internal.unexpected', 'failed to provision actor on first login');
          }
          actor = {
            id: row.id,
            workspaceId: row.workspaceId,
            externalId: row.externalId,
            email: row.email,
            displayName: row.displayName,
            roleLevel: row.roleLevel,
            actorType: row.actorType,
          };
        }

        const createdAt = now();
        const expiresAt = new Date(createdAt.getTime() + SESSION_TTL_MS);
        const sessionId = newSessionId();

        await tx.insert(sessions).values({
          id: sessionId,
          actorId: actor.id,
          workspaceId: deps.workspaceId,
          expiresAt,
          lastSeenAt: createdAt,
          createdAt,
          createdUserAgentSummary: input.userAgent?.slice(0, 256),
          createdIpSummary: input.ip?.slice(0, 64),
        });

        return {
          session: { id: sessionId, actorId: actor.id, workspaceId: deps.workspaceId },
          actor,
          expiresAt,
        };
      });
    },

    /**
     * Look up an active session and touch `last_seen_at`. Returns null when
     * the row is missing, revoked, or expired — the caller renders the
     * `auth.session_invalid` 401 envelope.
     */
    async loadAndTouch(
      sessionId: string,
    ): Promise<{ session: SessionRecord; actor: ActorRecord } | null> {
      const rightNow = now();
      const rows = await deps.db
        .select({
          sessionId: sessions.id,
          sessionActorId: sessions.actorId,
          sessionWorkspaceId: sessions.workspaceId,
          actorId: actors.id,
          actorWorkspaceId: actors.workspaceId,
          externalId: actors.externalId,
          email: actors.email,
          displayName: actors.displayName,
          roleLevel: actors.roleLevel,
          actorType: actors.actorType,
        })
        .from(sessions)
        .innerJoin(actors, eq(actors.id, sessions.actorId))
        .where(
          and(
            eq(sessions.id, sessionId),
            isNull(sessions.revokedAt),
            gt(sessions.expiresAt, rightNow),
          ),
        )
        .limit(1);

      const row = rows[0];
      if (!row) return null;

      await deps.db
        .update(sessions)
        .set({ lastSeenAt: rightNow })
        .where(eq(sessions.id, row.sessionId));

      return {
        session: {
          id: row.sessionId,
          actorId: row.sessionActorId,
          workspaceId: row.sessionWorkspaceId,
        },
        actor: {
          id: row.actorId,
          workspaceId: row.actorWorkspaceId,
          externalId: row.externalId,
          email: row.email,
          displayName: row.displayName,
          roleLevel: row.roleLevel,
          actorType: row.actorType,
        },
      };
    },

    /** Revoke immediately. Idempotent: revoking an already-revoked row is a no-op. */
    async revoke(sessionId: string): Promise<void> {
      const rightNow = now();
      await deps.db
        .update(sessions)
        .set({ revokedAt: rightNow })
        .where(and(eq(sessions.id, sessionId), isNull(sessions.revokedAt)));
    },
  };
}

export type SessionService = ReturnType<typeof createSessionService>;

// Re-export the sql helper users may want to drop into tests. Kept here so
// the auth module remains the single import surface for session shape.
export { sql };
