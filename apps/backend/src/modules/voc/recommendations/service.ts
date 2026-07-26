// Embedding recommendation service (#168 step 4, ADR-0034 D3/D4/D5/D6).
//
// Scope of this step is service + storage. There is no route here and no DTO
// in @fops/shared: the HTTP and frontend surface is step 6, which also amends
// ADR-0031 and FR-VOC-004. Until then the ADR-0031 same-Managed-System
// heuristic remains the shipped "similar VOC" behaviour, untouched.

import type { Db } from '../../../db/client.js';
import type { Tx } from '../../../db/tx.js';
import { HttpError } from '../../../lib/errors.js';
import type { AuditService } from '../../core/audit/audit-service.js';
import type { VocClustersService } from '../../voc-clusters/service.js';
import { type Scope, actorReadScope } from '../repo-read.js';

import { VOC_RECOMMENDATION_LIMIT, VOC_RECOMMENDATION_SIMILARITY_THRESHOLD } from './constants.js';
import {
  type RecommendationVocRow,
  hasEmbeddingAtVersion,
  insertRecommendationDismissal,
  selectClusterIdForVoc,
  selectRecommendationVocs,
  selectVocRecommendations,
  upsertRecommendationConfirmation,
} from './repo.js';
import { dismissalScopeKey, isVocVisible } from './scope.js';

export interface VocRecommendationsActor {
  actor_id: string;
  workspace_id: string;
  role_level: 'admin' | 'developer' | 'user';
}

export interface VocRecommendationItem {
  voc_id: string;
  display_id: string;
  title: string;
  severity: 'low' | 'medium' | 'high' | 'critical' | null;
  reporter_facing_status: string;
  score: number;
}

/**
 * `available: false` is never a silently empty list (ADR-0034 D2). The two
 * reasons are honest and distinguishable to the caller:
 *   * `provider_disabled` — this environment has no embedding provider.
 *   * `source_not_embedded` — the provider exists, but this VOC has no vector
 *     at the active version yet (freshly created, or awaiting a backfill after
 *     a version bump).
 */
export type VocRecommendationsResult =
  | {
      available: false;
      reason: 'provider_disabled' | 'source_not_embedded';
      embedding_version: number;
      items: VocRecommendationItem[];
      total: number;
    }
  | {
      available: true;
      embedding_version: number;
      items: VocRecommendationItem[];
      total: number;
    };

export interface VocRecommendationsServiceDeps {
  db: Db;
  auditService: AuditService;
  embeddingVersion: number;
  embeddingEnabled: boolean;
  /**
   * Builds a cluster service bound to a given handle. Confirmation must reuse
   * the existing cluster path (ADR-0034 D3) *and* commit atomically with the
   * decision row, so the service is constructed per-transaction rather than
   * injected pre-bound to the pool.
   */
  createClustersService: (db: Db) => VocClustersService;
  /** Overridable only so tests can exercise the cut from both sides. */
  threshold?: number;
  limit?: number;
}

export function createVocRecommendationsService(deps: VocRecommendationsServiceDeps) {
  const threshold = deps.threshold ?? VOC_RECOMMENDATION_SIMILARITY_THRESHOLD;
  const limit = deps.limit ?? VOC_RECOMMENDATION_LIMIT;

  /**
   * Resolves the source VOC and the actor's voc.read scope, or throws
   * `not_found.record`.
   *
   * The source is checked against the same ADR-0031 predicate as candidates.
   * A reporter can reach their own VOC without voc.read (that is the OR arm),
   * which is exactly why candidate visibility has to be decided independently
   * further down instead of being inherited from source access.
   */
  async function loadSource(
    db: Tx,
    actor: VocRecommendationsActor,
    sourceVocId: string,
  ): Promise<{ source: RecommendationVocRow; readScope: Scope }> {
    const readScope = await actorReadScope(db, actor);
    const vocs = await selectRecommendationVocs(db, {
      workspaceId: actor.workspace_id,
      vocIds: [sourceVocId],
    });
    const source = vocs.get(sourceVocId);
    if (!source || source.archived_at !== null) {
      throw new HttpError('not_found.record', 'voc not found');
    }
    if (!isVocVisible(readScope, actor.actor_id, source)) {
      throw new HttpError('not_found.record', 'voc not found');
    }
    return { source, readScope };
  }

  async function listRecommendations(args: {
    actor: VocRecommendationsActor;
    sourceVocId: string;
  }): Promise<VocRecommendationsResult> {
    const { source, readScope } = await loadSource(deps.db, args.actor, args.sourceVocId);

    if (!deps.embeddingEnabled) {
      return {
        available: false,
        reason: 'provider_disabled',
        embedding_version: deps.embeddingVersion,
        items: [],
        total: 0,
      };
    }
    if (
      !(await hasEmbeddingAtVersion(deps.db, {
        vocId: source.id,
        embeddingVersion: deps.embeddingVersion,
      }))
    ) {
      return {
        available: false,
        reason: 'source_not_embedded',
        embedding_version: deps.embeddingVersion,
        items: [],
        total: 0,
      };
    }

    // Everything below the cap and the count is decided inside this one query;
    // see the note on `selectVocRecommendations`. Nothing is filtered here.
    const page = await selectVocRecommendations(deps.db, {
      workspaceId: args.actor.workspace_id,
      sourceVocId: source.id,
      actorId: args.actor.actor_id,
      readScope,
      embeddingVersion: deps.embeddingVersion,
      threshold,
      limit,
    });

    return {
      available: true,
      embedding_version: deps.embeddingVersion,
      items: page.items.map((row) => ({
        voc_id: row.voc_id,
        display_id: row.display_id,
        title: row.title,
        severity: row.severity,
        reporter_facing_status: row.reporter_facing_status,
        score: row.score,
      })),
      total: page.total,
    };
  }

  /**
   * Resolves and authorizes both ends of a pair for a mutation.
   *
   * Both are checked against the ADR-0031 predicate and both failures are
   * `not_found.record`: a `permission.denied` on the candidate would confirm
   * that the id names a real VOC in this workspace, which is the exact
   * inference ADR-0034 D4 forbids.
   */
  async function loadPair(
    tx: Tx,
    actor: VocRecommendationsActor,
    sourceVocId: string,
    candidateVocId: string,
  ): Promise<{ source: RecommendationVocRow; candidate: RecommendationVocRow; readScope: Scope }> {
    if (sourceVocId === candidateVocId) {
      throw new HttpError('validation.failed', 'a VOC cannot be its own recommendation', {
        fields: [{ path: ['candidate_voc_id'], code: 'invalid' }],
      });
    }
    const readScope = await actorReadScope(tx, actor);
    const vocs = await selectRecommendationVocs(tx, {
      workspaceId: actor.workspace_id,
      vocIds: [sourceVocId, candidateVocId],
    });
    const source = vocs.get(sourceVocId);
    const candidate = vocs.get(candidateVocId);
    for (const voc of [source, candidate]) {
      if (!voc || voc.archived_at !== null || !isVocVisible(readScope, actor.actor_id, voc)) {
        throw new HttpError('not_found.record', 'voc not found');
      }
    }
    return {
      source: source as RecommendationVocRow,
      candidate: candidate as RecommendationVocRow,
      readScope,
    };
  }

  async function dismissRecommendation(args: {
    actor: VocRecommendationsActor;
    sourceVocId: string;
    candidateVocId: string;
  }): Promise<{ status: 204; body: null }> {
    return deps.db.transaction(async (tx) => {
      const { source, candidate, readScope } = await loadPair(
        tx,
        args.actor,
        args.sourceVocId,
        args.candidateVocId,
      );
      const scopeKey = dismissalScopeKey(
        readScope,
        args.actor.actor_id,
        candidate.primary_managed_system_id,
      );
      await insertRecommendationDismissal(tx, {
        workspaceId: args.actor.workspace_id,
        sourceVocId: source.id,
        candidateVocId: candidate.id,
        embeddingVersion: deps.embeddingVersion,
        scopeKey,
        actorId: args.actor.actor_id,
      });
      await deps.auditService.record(tx, {
        workspace_id: args.actor.workspace_id,
        actor_id: args.actor.actor_id,
        event_type: 'voc_recommendation_dismissed',
        subject_type: 'voc',
        subject_id: source.id,
        summary: 'VOC recommendation dismissed',
        detail: {
          source_voc_id: source.id,
          candidate_voc_id: candidate.id,
          embedding_version: deps.embeddingVersion,
          scope_key: scopeKey,
        },
      });
      return { status: 204 as const, body: null };
    });
  }

  /**
   * The only path that creates or joins a cluster (ADR-0034 D3, FR-VOC-004
   * criterion 2). Nothing about computing recommendations writes a cluster
   * row; clustering happens here and only when a person asks for it.
   */
  async function confirmRecommendation(args: {
    actor: VocRecommendationsActor;
    sourceVocId: string;
    candidateVocId: string;
  }): Promise<{ status: 200; body: { voc_cluster_id: string; cluster_created: boolean } }> {
    return deps.db.transaction(async (tx) => {
      const { source, candidate, readScope } = await loadPair(
        tx,
        args.actor,
        args.sourceVocId,
        args.candidateVocId,
      );

      // Cluster membership is single-Managed-System by construction (the
      // cluster service rejects an out-of-system member), so a cross-system
      // pair has nowhere to be confirmed *to*. Reject explicitly rather than
      // letting it surface as a confusing member-level validation error.
      if (source.primary_managed_system_id !== candidate.primary_managed_system_id) {
        throw new HttpError(
          'validation.failed',
          'recommendation pair spans two managed systems and cannot form a cluster',
          { fields: [{ path: ['candidate_voc_id'], code: 'out_of_scope' }] },
        );
      }

      // Bind the cluster service to the open transaction so the cluster write,
      // the decision row and the audit rows commit together. A DrizzleTx
      // exposes the same execute/insert/transaction surface as Db (a nested
      // `transaction()` becomes a SAVEPOINT) but the two are not structurally
      // assignable, hence the cast — the same one the `Db | Tx` repo helpers
      // in this module already make.
      const clusters = deps.createClustersService(tx as Db);

      const existingClusterId = await selectClusterIdForVoc(tx, {
        workspaceId: args.actor.workspace_id,
        vocId: source.id,
        managedSystemId: source.primary_managed_system_id,
      });

      let clusterId: string;
      let clusterCreated: boolean;
      if (existingClusterId) {
        clusterId = existingClusterId;
        clusterCreated = false;
      } else {
        const created = await clusters.createCluster({
          actor: args.actor,
          input: {
            title: source.title,
            primary_managed_system_id: source.primary_managed_system_id,
          },
        });
        clusterId = created.body.id;
        clusterCreated = true;
        await clusters.addMember({
          actor: args.actor,
          clusterId,
          input: { voc_id: source.id },
        });
      }

      await clusters.addMember({
        actor: args.actor,
        clusterId,
        input: { voc_id: candidate.id },
      });

      const scopeKey = dismissalScopeKey(
        readScope,
        args.actor.actor_id,
        candidate.primary_managed_system_id,
      );
      await upsertRecommendationConfirmation(tx, {
        workspaceId: args.actor.workspace_id,
        sourceVocId: source.id,
        candidateVocId: candidate.id,
        embeddingVersion: deps.embeddingVersion,
        scopeKey,
        clusterId,
        actorId: args.actor.actor_id,
      });

      await deps.auditService.record(tx, {
        workspace_id: args.actor.workspace_id,
        actor_id: args.actor.actor_id,
        event_type: 'voc_recommendation_confirmed',
        subject_type: 'voc_cluster',
        subject_id: clusterId,
        summary: 'VOC recommendation confirmed into a cluster',
        detail: {
          source_voc_id: source.id,
          candidate_voc_id: candidate.id,
          embedding_version: deps.embeddingVersion,
          scope_key: scopeKey,
          voc_cluster_id: clusterId,
          cluster_created: clusterCreated,
          primary_managed_system_id: source.primary_managed_system_id,
        },
      });

      return {
        status: 200 as const,
        body: { voc_cluster_id: clusterId, cluster_created: clusterCreated },
      };
    });
  }

  return { listRecommendations, dismissRecommendation, confirmRecommendation };
}

export type VocRecommendationsService = ReturnType<typeof createVocRecommendationsService>;
