// MockAuthProvider — selected by AUTH_PROVIDER=mock (the default in dev and
// CI). Reads the seeded actor roster from `core.actors` to build the picker
// HTML and to synthesize claims when a user is chosen. The `system` actor is
// seeded for audit-trail authorship but is NOT exposed in the picker
// (locked decision: only mock-admin-1 and mock-user-1).
//
// The HTML page is minimal — the orchestrator's design system reference is
// pending. We render two POST forms (one per actor) so the page works without
// JavaScript, which keeps it usable from the integration tests too. The
// frontend's /login route also POSTs the same endpoint with JSON.

import { and, eq, ne } from 'drizzle-orm';

import type { Db } from '../../db/client.js';
import { actors } from '../../db/schema/core.js';
import { HttpError } from '../../lib/errors.js';
import type { AuthClaims, AuthProvider, CompleteLoginInput } from './auth-provider.js';

export interface MockAuthProviderDeps {
  db: Db;
  workspaceId: string;
}

export function createMockAuthProvider(deps: MockAuthProviderDeps): AuthProvider {
  return {
    name: 'mock',

    async startLogin() {
      const rows = await deps.db
        .select({
          externalId: actors.externalId,
          email: actors.email,
          displayName: actors.displayName,
          roleLevel: actors.roleLevel,
          actorType: actors.actorType,
        })
        .from(actors)
        .where(and(eq(actors.workspaceId, deps.workspaceId), ne(actors.actorType, 'system')));

      const cards = rows
        .map(
          (r) => `
        <form method="POST" action="/auth/mock-login">
          <input type="hidden" name="external_id" value="${escapeHtml(r.externalId)}" />
          <button type="submit">
            <strong>${escapeHtml(r.displayName)}</strong>
            <small> (${escapeHtml(r.roleLevel)})</small>
            <br />${escapeHtml(r.email)}
          </button>
        </form>`,
        )
        .join('\n');

      const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>Mock login · FeedbackOps</title></head>
<body>
<h1>Mock login</h1>
<p>Dev-only picker. Selecting an actor issues a session immediately.</p>
${cards}
</body></html>`;
      return { html };
    },

    async completeLogin(input: CompleteLoginInput) {
      const externalId = typeof input.external_id === 'string' ? input.external_id : '';
      if (!externalId) {
        throw new HttpError('validation.failed', 'external_id is required', {
          fields: [{ path: ['external_id'], code: 'required', message: 'required' }],
        });
      }
      const row = await deps.db
        .select({
          externalId: actors.externalId,
          email: actors.email,
          displayName: actors.displayName,
          actorType: actors.actorType,
        })
        .from(actors)
        .where(and(eq(actors.workspaceId, deps.workspaceId), eq(actors.externalId, externalId)))
        .limit(1);

      const actor = row[0];
      if (!actor) {
        throw new HttpError('not_found.record', `mock actor '${externalId}' not seeded`);
      }
      if (actor.actorType === 'system') {
        // System actor is for audit authorship only, never an interactive login.
        throw new HttpError('not_found.record', 'system actor cannot log in');
      }

      const claims: AuthClaims = {
        sub: actor.externalId,
        email: actor.email,
        display_name: actor.displayName,
        raw_claims: { provider: 'mock', external_id: actor.externalId },
      };
      return claims;
    },
  };
}

function escapeHtml(s: string): string {
  return s
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}
