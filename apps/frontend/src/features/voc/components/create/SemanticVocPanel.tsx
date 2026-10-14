import type { CreateVocRequest } from '@fops/shared';
import { Button, Card, CardContent, cn } from '@fops/ui';
import { Link } from '@tanstack/react-router';
import { useId } from 'react';
import type { UseFormReturn } from 'react-hook-form';

import { SEMANTIC_VOC_PREVIEW_COPY, SEMANTIC_VOC_RECOMMENDATIONS_LABEL } from '@/lib/copy/voc';
import { formatRelativeTime } from '@/lib/format/datetime';
import { useVocSimilarityPreview } from '../../hooks/useVocSimilarityPreview';

export function SemanticVocPanel({ form }: { form: UseFormReturn<CreateVocRequest> }) {
  const { available, canCheck, loading, result, error, check } = useVocSimilarityPreview(form);
  const hintId = useId();
  if (!available) return null;
  let message = error;
  if (loading) message = SEMANTIC_VOC_PREVIEW_COPY.loading;
  else if (result?.available && result.items.length === 0)
    message = SEMANTIC_VOC_PREVIEW_COPY.empty;
  else if (result && !result.available) {
    message =
      result.reason === 'provider_disabled'
        ? SEMANTIC_VOC_PREVIEW_COPY.providerDisabled
        : result.reason === 'preview_expired'
          ? SEMANTIC_VOC_PREVIEW_COPY.expired
          : SEMANTIC_VOC_PREVIEW_COPY.providerFailed;
  }
  const isError =
    !!error ||
    (result &&
      !result.available &&
      ['provider_failed', 'provider_timeout', 'provider_outcome_unknown'].includes(result.reason));

  return (
    <Card padding="compact" data-testid="semantic-voc-panel">
      <CardContent padding="none">
        <div className="mb-2 flex items-center justify-between">
          <span className="text-xs font-semibold uppercase tracking-normal text-text-muted">
            {SEMANTIC_VOC_RECOMMENDATIONS_LABEL}
          </span>
        </div>
        <div className="flex flex-col gap-2">
          <p className="break-keep text-xs text-text-muted">
            {SEMANTIC_VOC_PREVIEW_COPY.disclosure}
          </p>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            disabled={!canCheck}
            aria-disabled={loading}
            // oxlint-disable-next-line shadcn/no-restyle -- Reuse Button disabled classes for loading without native disabled dropping focus (#1100).
            className="aria-disabled:pointer-events-none aria-disabled:opacity-50"
            aria-describedby={canCheck ? undefined : hintId}
            onClick={() => void check()}
          >
            {SEMANTIC_VOC_PREVIEW_COPY.check}
          </Button>
          {!canCheck && (
            <p id={hintId} className="break-keep text-xs text-text-muted">
              {SEMANTIC_VOC_PREVIEW_COPY.required}
            </p>
          )}
          <output aria-live="polite" className="flex flex-col gap-1">
            {message && (
              <span className={cn('text-xs', isError ? 'text-text-danger' : 'text-text-secondary')}>
                {message}
              </span>
            )}
            {result?.available &&
              result.items.map((item) => (
                <Link
                  key={item.id}
                  to="/vocs"
                  search={{ view: 'inbox', selected: item.id }}
                  className="flex w-full flex-col gap-0.5 rounded px-2.5 py-2 text-left transition-colors hover:bg-surface-row-hover focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-border-selected"
                >
                  <span className="truncate text-xs font-medium text-text-primary">
                    {item.title}
                  </span>
                  <span className="font-mono text-tiny text-text-muted">
                    {item.display_id} · {formatRelativeTime(item.created_at)}
                  </span>
                </Link>
              ))}
          </output>
        </div>
      </CardContent>
    </Card>
  );
}
