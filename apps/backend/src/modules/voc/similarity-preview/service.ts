import type { SimilarityPreviewRequest, SimilarityPreviewResponse } from '@fops/shared';
import type { AppConfig } from '../../../config.js';
import type { Db } from '../../../db/client.js';
import { HttpError } from '../../../lib/errors.js';
import type { JobLog } from '../../../lib/job-log.js';
import { sanitizeRichContentOrThrow } from '../../../lib/rich-content/sanitize-or-throw.js';
import { hashRequestBody } from '../../core/idempotency/canonicalize.js';
import { readManagedSystemState } from '../../managed-systems/index.js';
import { type ActorContextLite, actorReadScope } from '../authorization.js';
import { isEmbeddingEnabled } from '../embedding/factory.js';
import type { EmbeddingProvider, EmbeddingResult } from '../embedding/port.js';
import { deriveVocEmbeddingText } from '../embedding/text.js';
import { PREVIEW_VECTOR_TTL_MS, VOC_SIMILARITY_PREVIEW_MAX_TEXT_BYTES } from './constants.js';
import {
  BudgetDenied,
  DuplicateClaim,
  type PreviewIdentity,
  type PreviewRow,
  candidates,
  complete,
  findRequest,
  hasCandidate,
  reserve,
} from './repo.js';

const unavailable = (
  reason: Extract<SimilarityPreviewResponse, { available: false }>['reason'],
): SimilarityPreviewResponse => ({ available: false, reason, items: [] });
const compatible = (a: PreviewIdentity, b: PreviewIdentity) =>
  a.provider === b.provider &&
  a.model === b.model &&
  a.dimensions === b.dimensions &&
  a.embeddingVersion === b.embeddingVersion;
export function createSimilarityPreviewService(deps: {
  db: Db;
  config: AppConfig;
  provider: EmbeddingProvider;
  log: JobLog;
  deadlineMs?: number;
  clock?: () => Date;
}) {
  const now = () => deps.clock?.() ?? new Date();
  const identity = (): PreviewIdentity => ({
    ...deps.provider.identity(),
    embeddingVersion: deps.config.EMBEDDING_VERSION,
  });
  const enabled = () =>
    deps.config.VOC_SIMILARITY_PREVIEW === 'enabled' && isEmbeddingEnabled(deps.config);
  async function preview(args: {
    actor: ActorContextLite;
    key: string;
    input: SimilarityPreviewRequest;
  }): Promise<SimilarityPreviewResponse> {
    const start = Date.now();
    const { actor, key, input } = args;
    const content = sanitizeRichContentOrThrow({
      surface: 'voc-description',
      doc: input.description_rich_content,
      fieldPath: ['description_rich_content'],
    });
    const text = deriveVocEmbeddingText({ title: input.title, descriptionRichContent: content });
    if (Buffer.byteLength(text, 'utf8') > VOC_SIMILARITY_PREVIEW_MAX_TEXT_BYTES) {
      throw new HttpError('validation.failed', 'derived draft text too large', {
        fields: [{ path: ['description_rich_content'], code: 'too_big' }],
      });
    }
    const ms = await readManagedSystemState(
      deps.db,
      actor.workspace_id,
      input.primary_managed_system_id,
    );
    if (!ms) throw new HttpError('not_found.record', 'managed system not found');
    if (ms.archived_at)
      throw new HttpError('conflict.parent_archived', 'managed system archived', {
        fields: [{ path: ['primary_managed_system_id'], code: 'parent_archived' }],
      });
    const requestHash = hashRequestBody({ primary_managed_system_id: ms.id, text });
    const requestKey = { workspaceId: actor.workspace_id, actorId: actor.actor_id, key };
    const candidateArgs = async (id: PreviewIdentity) => ({
      ...id,
      workspaceId: actor.workspace_id,
      actorId: actor.actor_id,
      managedSystemId: ms.id,
      readScope: await actorReadScope(deps.db, actor),
    });
    async function replay(row: PreviewRow): Promise<SimilarityPreviewResponse> {
      if (row.request_hash !== requestHash)
        throw new HttpError('conflict.idempotency_key_reuse', 'idempotency key reused');
      if (row.outcome === 'reserved' || row.outcome === 'outcome_unknown')
        return unavailable('provider_outcome_unknown');
      if (!enabled()) return unavailable('provider_disabled');
      if (row.outcome === 'succeeded' && !compatible(row, identity()))
        return unavailable('provider_outcome_unknown');
      if (
        row.outcome === 'succeeded' &&
        (!row.vector_expires_at || new Date(row.vector_expires_at) <= now() || !row.vector)
      )
        return unavailable('preview_expired');
      if (row.outcome === 'failed') return unavailable('provider_failed');
      if (row.outcome === 'timed_out') return unavailable('provider_timeout');
      return candidates(deps.db, await candidateArgs(identity()), row.vector as string);
    }
    const previous = await findRequest(deps.db, requestKey);
    if (previous) return replay(previous);
    if (!enabled()) return unavailable('provider_disabled');
    const reservedIdentity = identity();
    if (!(await hasCandidate(deps.db, await candidateArgs(reservedIdentity))))
      return { available: true, items: [] };
    const reservedAt = now();
    let attempt: string;
    try {
      attempt = await reserve(deps.db, {
        ...requestKey,
        ...reservedIdentity,
        managedSystemId: ms.id,
        requestHash,
        now: reservedAt,
      });
    } catch (error) {
      if (error instanceof BudgetDenied || error instanceof DuplicateClaim) {
        // The failed transaction has already rolled back every provisional count.
        const committed = await findRequest(deps.db, requestKey);
        if (committed) return replay(committed);
        if (error instanceof BudgetDenied)
          throw new HttpError(`rate_limited.${error.scope}`, 'paid preview budget exhausted', {
            budget_period: error.period,
            retry_after_seconds: error.retryAfter,
          });
      }
      throw new HttpError('internal.unexpected', 'preview reservation failed');
    }
    const log = (outcome: string) =>
      deps.log.info(`voc.similarity_preview.${outcome}`, {
        workspace: actor.workspace_id,
        actor: actor.actor_id,
        version: reservedIdentity.embeddingVersion,
        attempt,
        outcome,
        latency_ms: Date.now() - start,
      });
    log('reserved');
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), deps.deadlineMs ?? 10_000);
    let result: EmbeddingResult;
    try {
      const aborted = new Promise<never>((_resolve, reject) => {
        controller.signal.addEventListener('abort', () => reject(new Error('preview deadline')), {
          once: true,
        });
      });
      result = await Promise.race([
        deps.provider.embed([text], { signal: controller.signal }),
        aborted,
      ]);
      if (controller.signal.aborted) throw new Error('preview deadline');
    } catch {
      const outcome = controller.signal.aborted ? 'timed_out' : 'failed';
      await complete(deps.db, { id: attempt, outcome, now: now() });
      log(outcome);
      return unavailable(outcome === 'timed_out' ? 'provider_timeout' : 'provider_failed');
    } finally {
      clearTimeout(timer);
    }
    if (
      !enabled() ||
      !compatible(reservedIdentity, identity()) ||
      !compatible(reservedIdentity, result) ||
      result.vectors.length !== 1 ||
      result.vectors[0]?.length !== reservedIdentity.dimensions ||
      !result.vectors[0]?.every(Number.isFinite) ||
      !result.vectors[0]?.some((v) => v !== 0)
    ) {
      await complete(deps.db, { id: attempt, outcome: 'outcome_unknown', now: now() });
      log('outcome_unknown');
      return unavailable('provider_outcome_unknown');
    }
    const vector = JSON.stringify(result.vectors[0]);
    const vectorExpiresAt = new Date(reservedAt.getTime() + PREVIEW_VECTOR_TTL_MS);
    await complete(deps.db, {
      id: attempt,
      outcome: 'succeeded',
      now: now(),
      vector,
      vectorExpiresAt,
    });
    log('succeeded');
    if (vectorExpiresAt <= now()) return unavailable('preview_expired');
    return candidates(deps.db, await candidateArgs(identity()), vector);
  }
  return { preview };
}
export type SimilarityPreviewService = ReturnType<typeof createSimilarityPreviewService>;
