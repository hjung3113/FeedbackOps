/**
 * ClusterSectionReadOnly — Cluster 추천 section (#168 step 6, chunk 6b).
 *
 * Prototype ref: screen-voc-create.jsx:512-541
 *
 * The prototype predates ADR-0034 and models ONE aggregate cluster decision.
 * The real resource is per candidate: dismiss and confirm each take a specific
 * candidate_voc_id. So the prototype's single 확정 / 무시 pair becomes a list,
 * one row per recommended VOC, each row carrying its own actions. The section
 * title, the Similarity badge, the nested card and the explanatory sentence are
 * kept verbatim from the prototype.
 *
 * ADR-0031 coexistence: `similarCount` is the same-Managed-System heuristic and
 * is NOT replaced or reinterpreted here. It still drives the Similarity badge,
 * because when the recommendation response is `available: false` the heuristic
 * is the only related-VOC signal left.
 *
 * Token translations (PROTOTYPE-TO-PACK17.md §3.9):
 *   .card-nested → bg-surface-canvas rounded-md p-3
 */

import type { VocRecommendationItem } from '@fops/shared';
import { Button, PanelSectionTitle, ReporterStatusBadge } from '@fops/ui';
import { Check, Sparkles } from 'lucide-react';
import * as React from 'react';

import type { ApiError } from '@/lib/api';

import {
  isCrossManagedSystemError,
  useConfirmVocRecommendation,
} from '../../hooks/useConfirmVocRecommendation';
import { useDismissVocRecommendation } from '../../hooks/useDismissVocRecommendation';
import { useVocRecommendations } from '../../hooks/useVocRecommendations';

export interface ClusterSectionReadOnlyProps {
  /** Source VOC id — the recommendation resource is scoped to it. */
  vocId: string;
  /** ADR-0031 same-Managed-System heuristic count. Unchanged by this chunk. */
  similarCount: number;
}

/** Similarity score is a [0,1] cosine value; render it as a percentage. */
function formatScore(score: number): string {
  return `${Math.round(score * 100)}%`;
}

function mutationErrorMessage(err: ApiError): string {
  if (isCrossManagedSystemError(err)) {
    return '다른 Managed System의 VOC와는 Cluster를 만들 수 없습니다.';
  }
  if (err.status === 404) {
    return '이 VOC를 더 이상 볼 수 없습니다. 추천 목록을 새로 불러왔습니다.';
  }
  return '요청을 처리하지 못했습니다. 잠시 후 다시 시도해 주세요.';
}

export function ClusterSectionReadOnly({
  vocId,
  similarCount,
}: ClusterSectionReadOnlyProps): React.ReactElement {
  const { data, isPending, isError } = useVocRecommendations(vocId);
  const [feedback, setFeedback] = React.useState<{ tone: 'ok' | 'error'; text: string } | null>(
    null,
  );

  // Reset transient feedback when the panel switches to another VOC.
  // biome-ignore lint/correctness/useExhaustiveDependencies: vocId is the reset trigger.
  React.useEffect(() => {
    setFeedback(null);
  }, [vocId]);

  const dismiss = useDismissVocRecommendation(vocId);
  const confirm = useConfirmVocRecommendation(vocId);

  const busy = dismiss.isPending || confirm.isPending;

  const handleDismiss = React.useCallback(
    (item: VocRecommendationItem) => {
      dismiss.mutate(item.voc_id, {
        onSuccess: () => {
          setFeedback({ tone: 'ok', text: `${item.display_id} 추천을 무시했습니다.` });
        },
        onError: (err) => {
          setFeedback({ tone: 'error', text: mutationErrorMessage(err) });
        },
      });
    },
    [dismiss],
  );

  const handleConfirm = React.useCallback(
    (item: VocRecommendationItem) => {
      confirm.mutate(item.voc_id, {
        onSuccess: (res) => {
          setFeedback({
            tone: 'ok',
            text: res.cluster_created
              ? `${item.display_id}와(과) 새 Cluster를 만들었습니다.`
              : `${item.display_id}을(를) 기존 Cluster에 추가했습니다.`,
          });
        },
        onError: (err) => {
          setFeedback({ tone: 'error', text: mutationErrorMessage(err) });
        },
      });
    },
    [confirm],
  );

  // ── state line ──────────────────────────────────────────────────────────────
  // Four distinct response states plus loading/error. `available: false` is NOT
  // an empty list: the backend refuses to collapse the two reasons (ADR-0034
  // D2), so the UI must not collapse them either.
  let stateLine: React.ReactNode;
  if (isPending) {
    stateLine = '추천을 불러오는 중입니다…';
  } else if (isError || !data) {
    stateLine = '추천을 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.';
  } else if (!data.available) {
    stateLine =
      data.reason === 'provider_disabled'
        ? '이 환경에는 임베딩 제공자가 설정되어 있지 않아 Cluster 추천이 꺼져 있습니다.'
        : '이 VOC는 아직 임베딩되지 않았습니다. 임베딩이 생성되면 추천이 표시됩니다.';
  } else if (data.items.length === 0) {
    stateLine = '추천 임계값을 넘은 유사 VOC가 없습니다.';
  } else {
    stateLine = (
      <>
        유사한 VOC <strong className="text-text-primary">{data.items.length}</strong>건이 발견됐어요.
      </>
    );
  }

  return (
    <div className="mb-8" data-anchor="cluster" data-testid="cluster-recommendation-section">
      <div className="flex items-center justify-between">
        <PanelSectionTitle className="mb-0">Cluster 추천</PanelSectionTitle>
        {similarCount > 0 && (
          <span
            data-testid="cluster-similarity-badge"
            className="inline-flex items-center gap-1 rounded-md bg-accent-primary/[0.12] px-2 py-0.5 text-[11px] font-medium text-accent-primary"
          >
            <Sparkles size={9} aria-hidden="true" />
            Similarity {similarCount}
          </span>
        )}
      </div>

      <div className="bg-surface-canvas rounded-md p-3 mt-3.5 flex flex-col gap-2.5">
        <p className="text-sm text-text-secondary leading-relaxed">
          자동 클러스터링은 추천만 합니다 — 확정이 필요합니다.
        </p>

        <div
          data-testid="cluster-recommendation-state"
          className="text-sm text-text-muted leading-relaxed"
        >
          {stateLine}
        </div>

        {data?.available === true && data.items.length > 0 && (
          <>
            <ul
              data-testid="cluster-recommendation-list"
              className="flex flex-col gap-2 list-none p-0 m-0"
            >
              {data.items.map((item) => (
                <li
                  key={item.voc_id}
                  data-testid={`cluster-recommendation-row-${item.voc_id}`}
                  className="rounded-md bg-surface-card-elevated p-2.5 flex items-start justify-between gap-3"
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 text-xs text-text-muted">
                      <span className="font-mono tabular-nums">{item.display_id}</span>
                      <span aria-hidden="true">·</span>
                      <span data-testid={`cluster-recommendation-score-${item.voc_id}`}>
                        유사도 {formatScore(item.score)}
                      </span>
                      <ReporterStatusBadge status={item.reporter_facing_status} />
                    </div>
                    <p className="text-sm text-text-primary leading-snug mt-1 truncate">
                      {item.title}
                    </p>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <Button
                      variant="primary"
                      size="sm"
                      disabled={busy}
                      data-testid={`cluster-recommendation-confirm-${item.voc_id}`}
                      onClick={() => {
                        handleConfirm(item);
                      }}
                    >
                      <Check size={11} aria-hidden="true" />
                      확정
                    </Button>
                    <Button
                      variant="subtle"
                      size="sm"
                      disabled={busy}
                      data-testid={`cluster-recommendation-dismiss-${item.voc_id}`}
                      onClick={() => {
                        handleDismiss(item);
                      }}
                    >
                      무시
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
            <p className="text-xs text-text-muted leading-relaxed">
              유사도는 참고 신호입니다. 추천 임계값은 실제 임베딩으로 검증되지 않았습니다.
            </p>
          </>
        )}

        {feedback && (
          <p
            data-testid="cluster-recommendation-feedback"
            className={
              feedback.tone === 'error'
                ? 'text-xs text-accent-danger leading-relaxed'
                : 'text-xs text-text-muted leading-relaxed'
            }
          >
            {feedback.text}
          </p>
        )}
      </div>
    </div>
  );
}

ClusterSectionReadOnly.displayName = 'ClusterSectionReadOnly';
