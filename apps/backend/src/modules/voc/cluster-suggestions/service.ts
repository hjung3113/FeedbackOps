import type {
  ConfirmVocClusterSuggestionRequest,
  DiscardVocClusterSuggestionRequest,
  VocClusterSuggestionItem,
  VocClusterSuggestionsResponse,
} from '@fops/shared';
import { sql } from 'drizzle-orm';
import type { Db } from '../../../db/client.js';
import { lockRecoveryCommand } from '../../../db/recovery-command-lock.js';
import type { Tx } from '../../../db/tx.js';
import { HttpError } from '../../../lib/errors.js';
import type { AuditService } from '../../core/audit/audit-service.js';
import type { IdempotencyService } from '../../core/idempotency/idempotency-service.js';
import {
  actorFindingReadScope,
  checkFindingManage,
  isFindingInReadScope,
} from '../../findings/authorization.js';
import { lockManagedSystem } from '../../managed-systems/index.js';
import type { CheckService } from '../../permissions/check-service.js';
import type { VocClustersService } from '../../voc-clusters/index.js';
import { type ActorContextLite, actorReadScope, isVocVisibleToActor } from '../authorization.js';
import type { EmbeddingProvider } from '../embedding/port.js';
import { selectVocForUpdate } from '../repo.js';
import {
  type PagePosition,
  type PairVoc,
  SUGGESTION_PAGE_SIZE,
  SUGGESTION_PENDING_CAP,
  SUGGESTION_READ_SCAN_CEILING,
  type SuggestionRow,
  eligiblePair,
  eligiblePending,
  lockSuggestions,
  pairVocs,
  pendingPage,
  suggestionById,
  writeCounter,
} from './repo.js';

export interface SuggestionDeps {
  db: Db;
  auditService: AuditService;
  idempotencyService: IdempotencyService;
  checkService: CheckService;
  embeddingVersion: number;
  embeddingEnabled: boolean;
  embeddingIdentity: ReturnType<EmbeddingProvider['identity']>;
  suggestionPageSize?: number;
  suggestionReadScanCeiling?: number;
  createClustersService: (db: Db) => VocClustersService;
}
export function createVocClusterSuggestionsService(deps: SuggestionDeps) {
  function stale(row: SuggestionRow): never {
    throw new HttpError('conflict.stale_write', 'Cluster suggestion changed; refresh required', {
      current_revision: row.revision,
    });
  }
  function discardTime(row: SuggestionRow): Date {
    if (!row.discarded_at) throw new Error('Discard timestamp missing');
    return new Date(row.discarded_at);
  }
  function missing(): never {
    throw new HttpError('not_found.record', 'Cluster suggestion not found');
  }
  async function authorize(
    tx: Tx,
    actor: ActorContextLite,
    row: SuggestionRow,
  ): Promise<[PairVoc, PairVoc]> {
    const vocs = await pairVocs(tx, row);
    const scope = await actorReadScope(tx, actor);
    if (
      vocs.length !== 2 ||
      vocs.some((v) => v.archived_at || !isVocVisibleToActor(scope, actor.actor_id, v))
    )
      missing();
    if (
      !(
        await checkFindingManage(
          deps.checkService,
          actor,
          row.primary_managed_system_id,
          { requireElevatedRole: true },
          { tx },
        )
      ).allow
    )
      throw new HttpError('permission.denied', 'finding.manage capability required');
    const [a, b] = vocs;
    if (!a || !b) return missing();
    return [a, b];
  }
  async function list(args: {
    actor: ActorContextLite;
    managedSystemId?: string;
  }): Promise<VocClusterSuggestionsResponse> {
    if (!deps.embeddingEnabled) return { available: false, reason: 'provider_disabled', items: [] };
    const findingScope = await actorFindingReadScope(deps.db, args.actor, {
      requireElevatedRole: true,
    });
    const readScope = await actorReadScope(deps.db, args.actor);
    const items: VocClusterSuggestionItem[] = [];
    let after: PagePosition | undefined;
    const pageSize = deps.suggestionPageSize ?? SUGGESTION_PAGE_SIZE;
    const ceiling = deps.suggestionReadScanCeiling ?? SUGGESTION_READ_SCAN_CEILING;
    for (let scanned = 0; scanned < ceiling; ) {
      const page = await pendingPage(
        deps.db,
        args.actor.workspace_id,
        after,
        args.managedSystemId,
        Math.min(pageSize, ceiling - scanned),
        { actor: args.actor, findingScope, readScope },
      );
      scanned += page.length;
      for (const row of page) {
        if (!isFindingInReadScope(findingScope, row.primary_managed_system_id)) continue;
        const vocs = await pairVocs(deps.db, row);
        if (
          vocs.length !== 2 ||
          vocs.some((v) => !isVocVisibleToActor(readScope, args.actor.actor_id, v))
        )
          continue;
        if (
          !(await eligiblePair(deps.db, row, deps.embeddingVersion, deps.embeddingIdentity, vocs))
        )
          continue;
        const [a, b] = vocs;
        if (!a || !b) continue;
        items.push({
          id: row.id,
          primary_managed_system_id: row.primary_managed_system_id,
          revision: row.revision,
          embedding_version: row.embedding_version,
          source_hashes: [row.source_hash_a, row.source_hash_b],
          vocs: [wireVoc(a), wireVoc(b)],
        });
        if (items.length === SUGGESTION_PENDING_CAP) return { available: true, items };
      }
      if (page.length < pageSize) break;
      after = page[page.length - 1];
    }
    return { available: true, items };
  }
  function wireVoc(v: PairVoc) {
    return {
      id: v.id,
      display_id: v.display_id,
      title: v.title,
      description_rich_content: v.description_rich_content,
    };
  }
  async function audit(
    tx: Tx,
    actor: ActorContextLite,
    row: SuggestionRow,
    action: 'confirmed' | 'discarded' | 'restored',
  ) {
    await deps.auditService.record(tx, {
      workspace_id: actor.workspace_id,
      actor_id: actor.actor_id,
      event_type: `voc_cluster_suggestion_${action}`,
      subject_type: 'voc_cluster_suggestion',
      subject_id: row.id,
      summary: `Cluster suggestion ${action}`,
      detail: {
        voc_a_id: row.voc_a_id,
        voc_b_id: row.voc_b_id,
        primary_managed_system_id: row.primary_managed_system_id,
        revision: row.revision,
        embedding_version: row.embedding_version,
        source_hash_a: row.source_hash_a,
        source_hash_b: row.source_hash_b,
        score: row.score,
        cut: row.cut,
        ...(action === 'confirmed' ? { voc_cluster_id: row.voc_cluster_id } : {}),
      },
    });
  }
  type Command = {
    actor: ActorContextLite;
    id: string;
    key: string;
    requestHash: string;
    input: DiscardVocClusterSuggestionRequest | ConfirmVocClusterSuggestionRequest;
  };
  async function command(action: 'confirm' | 'discard' | 'restore', args: Command) {
    return deps.db.transaction(async (tx) => {
      // All suggestion writers serialize with permission/recovery/member writers FIRST.
      await lockRecoveryCommand(tx, args.actor.workspace_id);
      const initial = await suggestionById(tx, args.actor.workspace_id, args.id);
      if (!initial) return missing();
      await authorize(tx, args.actor, initial); // Even a replay must retain current access.
      await tx.execute(
        sql`SELECT pg_advisory_xact_lock(hashtext(${args.actor.actor_id}), hashtext(${args.key}))`,
      );
      const hit = await deps.idempotencyService.lookup(
        tx,
        args.actor.actor_id,
        args.key,
        args.requestHash,
      );
      if (hit.kind === 'mismatch')
        throw new HttpError(
          'conflict.idempotency_key_reuse',
          'Idempotency-Key reused with different request body',
        );
      if (hit.kind === 'match') return { status: 200, body: hit.body };
      await lockSuggestions(tx, args.actor.workspace_id);
      const ms = await lockManagedSystem(
        tx,
        args.actor.workspace_id,
        initial.primary_managed_system_id,
      );
      if (!ms) return missing();
      if (action === 'confirm') {
        for (const id of [initial.voc_a_id, initial.voc_b_id])
          await selectVocForUpdate(tx, args.actor.workspace_id, id);
      } else await pairVocs(tx, initial, true); // Ahead of trigger's implicit FOR SHARE.
      const row = await suggestionById(tx, args.actor.workspace_id, args.id, true);
      if (!row) return missing();
      const vocs = await authorize(tx, args.actor, row);
      if (
        row.state !== 'confirmed' &&
        vocs.some((v) => v.primary_managed_system_id !== row.primary_managed_system_id)
      )
        return stale(row); // Prevent a scope drift from failing inside the storage write guard.
      let status = 200;
      let body: object;
      if (action === 'confirm' && row.state === 'confirmed') {
        body = { voc_cluster_id: row.voc_cluster_id, cluster_created: true };
      } else {
        if (row.revision !== args.input.expected_revision || row.state === 'confirmed')
          return stale(row);
        if (action === 'discard') {
          if (row.state === 'pending') {
            const updated = await tx.execute<SuggestionRow>(sql`UPDATE voc.voc_cluster_suggestions
              SET state = 'discarded', discarded_by_actor_id = ${args.actor.actor_id}, discarded_at = clock_timestamp(),
                revision = revision + 1 WHERE id = ${row.id} RETURNING *`);
            Object.assign(row, updated.rows[0]);
            await audit(tx, args.actor, row, 'discarded');
          }
          const at = discardTime(row);
          body = {
            id: row.id,
            revision: row.revision,
            discarded_at: at.toISOString(),
            undo_until: new Date(at.getTime() + 300_000).toISOString(),
          };
        } else {
          const input = args.input as ConfirmVocClusterSuggestionRequest;
          if (
            !deps.embeddingEnabled ||
            input.embedding_version !== row.embedding_version ||
            input.source_hashes[0] !== row.source_hash_a ||
            input.source_hashes[1] !== row.source_hash_b
          )
            return stale(row);
          if (action === 'restore' && row.state === 'discarded') {
            if (row.discarded_by_actor_id !== args.actor.actor_id)
              throw new HttpError('permission.denied', 'Only the discard actor can restore');
            const time = await tx.execute<{ now: Date } & Record<string, unknown>>(
              sql`SELECT clock_timestamp() AS now`,
            );
            const currentTime = time.rows[0];
            if (!currentTime) throw new Error('Database clock missing');
            if (new Date(currentTime.now).getTime() >= discardTime(row).getTime() + 300_000)
              return stale(row);
          } else if (row.state !== 'pending') return stale(row);
          if (!(await eligiblePair(tx, row, deps.embeddingVersion, deps.embeddingIdentity, vocs)))
            return stale(row);
          const pending = await eligiblePending(
            tx,
            args.actor.workspace_id,
            deps.embeddingVersion,
            deps.embeddingIdentity,
            undefined,
            deps.suggestionPageSize,
          );
          if (
            pending.some(
              (p) =>
                p.id !== row.id &&
                [p.voc_a_id, p.voc_b_id].some((id) => id === row.voc_a_id || id === row.voc_b_id),
            )
          )
            return stale(row);
          if (action === 'confirm') {
            const clusters = deps.createClustersService(tx as Db);
            const created = await clusters.createCluster({
              actor: args.actor,
              input: {
                title: vocs[0].title,
                primary_managed_system_id: row.primary_managed_system_id,
              },
            });
            const clusterId = created.body.id;
            for (const vocId of [row.voc_a_id, row.voc_b_id])
              await clusters.addMember({ actor: args.actor, clusterId, input: { voc_id: vocId } });
            await clusters.updateCluster({
              actor: args.actor,
              clusterId,
              input: { status: 'confirmed' },
            });
            const updated =
              await tx.execute<SuggestionRow>(sql`UPDATE voc.voc_cluster_suggestions SET state = 'confirmed',
              voc_cluster_id = ${clusterId}, confirmed_by_actor_id = ${args.actor.actor_id}, confirmed_at = now(),
              revision = revision + 1 WHERE id = ${row.id} RETURNING *`);
            Object.assign(row, updated.rows[0]);
            await audit(tx, args.actor, row, 'confirmed');
            status = 201;
            body = { voc_cluster_id: clusterId, cluster_created: true };
          } else {
            if (row.state === 'discarded') {
              if (pending.length >= SUGGESTION_PENDING_CAP) return stale(row);
              const updated =
                await tx.execute<SuggestionRow>(sql`UPDATE voc.voc_cluster_suggestions SET state = 'pending',
                discarded_by_actor_id = NULL, discarded_at = NULL, revision = revision + 1 WHERE id = ${row.id} RETURNING *`);
              Object.assign(row, updated.rows[0]);
              await audit(tx, args.actor, row, 'restored');
            }
            body = { id: row.id, revision: row.revision };
          }
        }
        await writeCounter(
          tx,
          args.actor.workspace_id,
          (
            await eligiblePending(
              tx,
              args.actor.workspace_id,
              deps.embeddingVersion,
              deps.embeddingIdentity,
              undefined,
              deps.suggestionPageSize,
            )
          ).length,
        );
      }
      await deps.idempotencyService.record(
        tx,
        args.actor.actor_id,
        args.key,
        args.requestHash,
        status,
        body,
      );
      return { status, body };
    });
  }
  return {
    list,
    confirm: (args: Command) => command('confirm', args),
    discard: (args: Command) => command('discard', args),
    restore: (args: Command) => command('restore', args),
  };
}
export type VocClusterSuggestionsService = ReturnType<typeof createVocClusterSuggestionsService>;
