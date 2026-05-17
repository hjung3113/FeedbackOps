// Auth application service. Per AGENTS.md "backend application services own
// transactions, permissions, audits, idempotency, and cross-system commands."
// Slice 1 #3 has no audits yet (the audit_log writer lands with the first
// audited mutation in Slice 1 #5) but the boundary is established here:
// controllers parse HTTP and call into this service; the service owns every
// DB write touching `core.actors` or `core.sessions`.
//
// First-login auto-provisioning follows ADR-0006:42-52.

import { createHash, randomBytes } from 'node:crypto';
import { and, eq, isNull, sql } from 'drizzle-orm';

import type { Db } from '../../db/client.js';
import { actors, sessions } from '../../db/schema/core.js';
import { HttpError } from '../../lib/errors.js';
import type { AuthClaims } from './auth-provider.js';

/** Role vocab — matches `core.actors.role_level` CHECK constraint. */
export type RoleLevel = 'admin' | 'developer' | 'user';

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
  /** Mirrors `core.actors.role_level` for the actor that owns this session.
   * Joined in by `loadAndTouch` so HTTP-tier callers don't need a second
   * SELECT. See ADR-0019 Section E / Slice 3 prologue Task 5. */
  roleLevel: RoleLevel;
}

/** ADR-0006:23-26 — 12h TTL on issue. `last_seen_at` updated per request. */
export const SESSION_TTL_MS = 12 * 60 * 60 * 1000;

/** ADR-0006:25 — 32+ bytes random, base64url-encoded. 48 bytes → 64 chars. */
function newSessionId(): string {
  return randomBytes(48).toString('base64url');
}

// F-008: ADR-0006:38 names these columns `*_summary` with the explicit
// intent that they be derived, low-resolution values rather than full PII.
// We truncate IPs to a network prefix (/24 for v4, /48 for v6) and hash the
// result so two requests from the same subnet collide but no single client
// IP is recoverable from the audit. User-Agent is reduced to its product
// family (the first token before `/` or `(`).
export function summarizeIp(raw: string | undefined): string | null {
  if (!raw || raw.length === 0) return null;
  // Strip an IPv4-mapped IPv6 prefix like '::ffff:1.2.3.4' so the v4 branch
  // handles it.
  const stripped = raw.startsWith('::ffff:') ? raw.slice('::ffff:'.length) : raw;
  let prefix: string;
  if (stripped.includes('.')) {
    // IPv4 → /24 (drop the last octet).
    const parts = stripped.split('.');
    if (parts.length !== 4) return hashTo16('ipv4:invalid');
    prefix = `ipv4:${parts[0]}.${parts[1]}.${parts[2]}.0/24`;
  } else if (stripped.includes(':')) {
    // IPv6 → /48 (keep first three hextets).
    const parts = stripped.split(':');
    const head = parts.slice(0, 3).join(':');
    prefix = `ipv6:${head}::/48`;
  } else {
    prefix = `unknown:${stripped.slice(0, 32)}`;
  }
  return hashTo16(prefix);
}

export function summarizeUserAgent(raw: string | undefined): string | null {
  if (!raw || raw.length === 0) return null;
  // Take the substring up to the first `/`, `(`, or whitespace — the UA
  // product token (e.g. 'Mozilla', 'curl', 'Go-http-client'). No third
  // party parser dependency; this is intentionally lossy.
  const trimmed = raw.trim();
  const cutAt = trimmed.search(/[/\s(]/);
  const family = (cutAt === -1 ? trimmed : trimmed.slice(0, cutAt)).slice(0, 64);
  return family.length > 0 ? family : null;
}

function hashTo16(input: string): string {
  return createHash('sha256').update(input).digest('hex').slice(0, 16);
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
          createdUserAgentSummary: summarizeUserAgent(input.userAgent),
          createdIpSummary: summarizeIp(input.ip),
        });

        return {
          session: {
            id: sessionId,
            actorId: actor.id,
            workspaceId: deps.workspaceId,
            roleLevel: actor.roleLevel as RoleLevel,
          },
          actor,
          expiresAt,
        };
      });
    },

    /**
     * Look up an active session and touch `last_seen_at`. Returns null when
     * the row is missing, revoked, or expired — the caller renders the
     * `auth.session_invalid` 401 envelope.
     *
     * F-007: the predicate (`revoked_at IS NULL AND expires_at > now()`)
     * MUST be evaluated in the same statement that writes `last_seen_at`,
     * otherwise a concurrent `revoke()` between SELECT and UPDATE would
     * see the touch land on an already-revoked row and the request would
     * complete against a session the operator believes is dead. We use a
     * single `UPDATE … WHERE … RETURNING …` so Postgres locks the row
     * during the predicate evaluation, then JOIN-fetch the actor.
     */
    async loadAndTouch(
      sessionId: string,
    ): Promise<{ session: SessionRecord; actor: ActorRecord } | null> {
      const rightNow = now();
      // Single round-trip: UPDATE the session row (predicate evaluated in the
      // same statement per F-007) inside a CTE, then JOIN the actor row in
      // one go. Avoids the load amplification of a follow-up SELECT and the
      // per-route `loadActorContext` helper that lived in three modules
      // before Slice 3 prologue Task 5.
      const result = await deps.db.execute<{
        session_id: string;
        actor_id: string;
        session_workspace_id: string;
        actor_workspace_id: string;
        external_id: string;
        email: string;
        display_name: string;
        role_level: RoleLevel;
        actor_type: string;
      }>(sql`
        WITH touched AS (
          UPDATE core.sessions
             SET last_seen_at = ${rightNow}
           WHERE id = ${sessionId}
             AND revoked_at IS NULL
             AND expires_at > ${rightNow}
        RETURNING id, actor_id, workspace_id
        )
        SELECT t.id AS session_id,
               t.actor_id,
               t.workspace_id AS session_workspace_id,
               a.workspace_id AS actor_workspace_id,
               a.external_id,
               a.email,
               a.display_name,
               a.role_level,
               a.actor_type
          FROM touched t
          JOIN core.actors a
            ON a.id = t.actor_id
      `);

      const row = result.rows[0];
      if (!row) return null;

      return {
        session: {
          id: row.session_id,
          actorId: row.actor_id,
          workspaceId: row.session_workspace_id,
          roleLevel: row.role_level,
        },
        actor: {
          id: row.actor_id,
          workspaceId: row.actor_workspace_id,
          externalId: row.external_id,
          email: row.email,
          displayName: row.display_name,
          roleLevel: row.role_level,
          actorType: row.actor_type,
        },
      };
    },

    /**
     * Read-only lookup of the actor_id for an active session token. Does NOT
     * touch `last_seen_at`. Intended for the `@fastify/rate-limit`
     * keyGenerator which runs in the `onRequest` hook (before the
     * `requireSession` preHandler) and needs the actor identity without
     * paying for a second `loadAndTouch` write. Returns null when the row
     * is missing, revoked, or expired — the keyGenerator falls back to IP.
     *
     * Adversarial review API-C-2.
     */
    async lookupActorIdByToken(sessionId: string): Promise<string | null> {
      const rightNow = now();
      const result = await deps.db.execute<{ actor_id: string }>(sql`
        SELECT actor_id
          FROM core.sessions
         WHERE id = ${sessionId}
           AND revoked_at IS NULL
           AND expires_at > ${rightNow}
         LIMIT 1
      `);
      return result.rows[0]?.actor_id ?? null;
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
