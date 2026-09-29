// VOC conversation page read method.
import type { ConversationEntry, GetConversationQuery } from '@fops/shared';
import { HttpError } from '../../../lib/errors.js';
import { actorEffectiveScope, actorReadScope, actorTriageScope } from '../authorization.js';
import type { ReadActorContext, VocReadServiceDeps } from '../read-service.js';
import * as repoRead from '../repo-read.js';
import { decodeConversationCursor, encodeConversationCursor } from './cursor.js';
import { mapConversationRowsWithAttachments } from './mappers.js';
import { msInScope } from './scope.js';

export function createVocConversationReader(deps: VocReadServiceDeps) {
  // ── getConversation ───────────────────────────────────────────────────────

  async function getConversation(args: {
    actor: ReadActorContext;
    vocId: string;
    query: GetConversationQuery;
  }): Promise<{ items: ConversationEntry[]; page: { cursor?: string; has_more: boolean } }> {
    const { actor, vocId, query } = args;

    // ── 1. Fetch VOC (access matrix check) ──────────────────────────────────
    const row = await repoRead.selectVocByIdForRead(deps.db, actor.workspace_id, vocId);
    if (!row) throw new HttpError('not_found.record', 'VOC not found');

    // ── 2. Resolve scopes in parallel ───────────────────────────────────────
    const [readScope, effectiveScope, triageScope] = await Promise.all([
      actorReadScope(deps.db, actor),
      actorEffectiveScope(deps.db, actor),
      actorTriageScope(deps.db, actor),
    ]);

    // ── 3. Compute access flags ──────────────────────────────────────────────
    const isReporter = row.reporterId === actor.actor_id;
    const primaryMs = row.primaryManagedSystemId;
    const msInReadScope = msInScope(readScope, primaryMs);
    const msInEffectiveScope = msInScope(effectiveScope, primaryMs);
    const canTriage = msInScope(triageScope, primaryMs);

    // ── 4. Access matrix ─────────────────────────────────────────────────────
    if (!msInReadScope && !isReporter && !msInEffectiveScope) {
      // 404 to prevent existence probe.
      throw new HttpError('not_found.record', 'VOC not found');
    }

    if (!msInReadScope && !isReporter && msInEffectiveScope) {
      // Summary-territory actors don't get conversation access.
      throw new HttpError('permission.denied', 'conversation not available without voc.read scope');
    }

    // ── 5. Decode conversation cursor (optional — first-page call passes none) ─
    // PLAN-22 §Bug-2: cursor is optional at the schema layer. Treat undefined
    // as "start from oldest" — selectConversationPage already handles the
    // undefined-cursor branch (no cursor predicate emitted).
    const decodedConvCursor =
      query.cursor !== undefined ? decodeConversationCursor(query.cursor) : undefined;

    // ── 6. Fetch conversation page ────────────────────────────────────────────
    const convArgs: repoRead.SelectConversationPageArgs = {
      workspaceId: actor.workspace_id,
      vocId,
      actorId: actor.actor_id,
      canTriage,
      isReporter,
      limit: query.limit,
    };
    if (decodedConvCursor !== undefined) convArgs.cursor = decodedConvCursor;
    if (query.kind !== undefined) convArgs.kind = query.kind;

    const convResult = await repoRead.selectConversationPage(deps.db, convArgs);

    // PLAN-22 §Bug-1: hydrate per-entry attachments[] (same contract as the
    // inline timeline on getVocDetail).
    const commentIds = convResult.entries.map((e) => e.id);
    const commentAttachmentsMap = await repoRead.selectAttachmentsForComments(
      deps.db,
      actor.workspace_id,
      commentIds,
    );
    const items = mapConversationRowsWithAttachments(convResult.entries, commentAttachmentsMap);

    let nextCursorStr: string | undefined;
    if (convResult.hasMore && convResult.nextCursor) {
      nextCursorStr = encodeConversationCursor(convResult.nextCursor);
    }

    const convPage: { cursor?: string; has_more: boolean } = { has_more: convResult.hasMore };
    if (nextCursorStr !== undefined) convPage.cursor = nextCursorStr;

    return { items, page: convPage };
  }
  return { getConversation };
}
