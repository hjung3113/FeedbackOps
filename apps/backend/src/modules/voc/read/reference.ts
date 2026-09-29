// VOC reference visibility resolution for cross-module read consumers.
import { HttpError } from '../../../lib/errors.js';
import type {
  ReadActorContext,
  VocReadServiceDeps,
  VocReferenceResolution,
} from '../read-service.js';
import type { VocReadRow } from '../repo-read.js';

type ResolveVocAccess = (args: { actor: ReadActorContext; vocId: string }) => Promise<{
  kind: 'full' | 'summary';
  row: VocReadRow;
}>;

export function createVocReferenceReader(
  deps: VocReadServiceDeps,
  resolveVocAccess: ResolveVocAccess,
) {
  // ── resolveVocReference (#378) ────────────────────────────────────────────

  /**
   * Narrow cross-module read interface (Task detail source trail): maps the
   * VOC access decision plus the full-read endpoint gate (as getVocDetail
   * does through listLinks) onto the entity-link visibility vocabulary, without
   * assembling the full detail envelope:
   *   kind 'full' + readable endpoint → 'allowed' (id/display_id/title from the VOC row)
   *   kind 'full' + unreadable endpoint → 'hidden'
   *   kind 'summary'   → 'summary_visible' (no endpoint gate or identifiers forwarded)
   *   HttpError not_found.record (missing/archived/foreign-workspace row OR the
   *                    out-of-effective-scope 404 anti-probe) → 'hidden'
   *   HttpError permission.denied → 'denied' (defensive: the access matrix
   *                    currently never raises it, but the mapping keeps the
   *                    vocabulary complete)
   *   anything else    → rethrown (callers must not degrade silently)
   */
  async function resolveVocReference(args: {
    actor: ReadActorContext;
    vocId: string;
  }): Promise<VocReferenceResolution> {
    try {
      // Same access decision as getVocDetail (resolveVocAccess) but WITHOUT
      // assembling the full envelope (conversation, attachments, similar VOCs,
      // links): a Task read must not depend on unrelated VOC reads succeeding.
      const access = await resolveVocAccess(args);
      if (access.kind === 'full') {
        // Admin 'all' scope ignores explicit voc.read denies; the endpoint gate does not.
        const canRead = await deps.entityLinksService.canReadEndpoint({
          actor: args.actor,
          endpoint: { type: 'voc', id: args.vocId },
        });
        if (!canRead) return { visibility_state: 'hidden' };
        return {
          visibility_state: 'allowed',
          id: access.row.id,
          display_id: access.row.displayId,
          title: access.row.title,
        };
      }
      return { visibility_state: 'summary_visible' };
    } catch (error) {
      if (error instanceof HttpError && error.code === 'not_found.record') {
        return { visibility_state: 'hidden' };
      }
      if (error instanceof HttpError && error.code === 'permission.denied') {
        return { visibility_state: 'denied' };
      }
      throw error;
    }
  }
  return { resolveVocReference };
}
