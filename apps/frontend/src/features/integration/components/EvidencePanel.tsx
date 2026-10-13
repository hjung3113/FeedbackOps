import { ListStateMessage } from '@/components/ListStateMessage';
import { ApiError } from '@/lib/api';
import { EVIDENCE_COPY as COPY } from '@/lib/copy/evidence';
import type { EvidenceInventoryItem } from '@fops/shared';
import { Button, PermissionBlockedPanel, Skeleton } from '@fops/ui';
import { Link } from '@tanstack/react-router';
import { EvidenceContent } from './EvidenceContent';

export function EvidencePanel({
  item,
  loading,
  error,
  mismatch,
  onClose,
  onRetry,
}: {
  item: EvidenceInventoryItem | undefined;
  loading: boolean;
  error: unknown;
  mismatch: boolean;
  onClose: () => void;
  onRetry: () => void;
}) {
  return (
    <section
      aria-label="Evidence 상세"
      className="flex h-full min-h-0 flex-col"
      data-testid="evidence-panel"
    >
      <header className="flex h-toolbar shrink-0 items-center justify-between border-b border-border-subtle px-4">
        <h2 className="text-sm font-semibold">Evidence</h2>
        <Button variant="subtle" size="sm" onClick={onClose} aria-label="패널 닫기">
          닫기
        </Button>
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto p-5">
        {loading ? (
          <Skeleton className="h-32" role="status" aria-label={COPY.loading} />
        ) : error instanceof ApiError && (error.status === 403 || error.status === 401) ? (
          <PermissionBlockedPanel state="denied" category="Evidence" />
        ) : error ? (
          <ListStateMessage
            variant="error"
            title={error instanceof ApiError && error.status === 404 ? COPY.missing : COPY.error}
            {...(!(error instanceof ApiError && error.status === 404)
              ? { action: { label: COPY.retry, onClick: onRetry } }
              : {})}
          />
        ) : mismatch ? (
          <ListStateMessage variant="filtered" title={COPY.mismatch} />
        ) : item ? (
          <div className="flex flex-col gap-5">
            <h3 className="text-sm font-semibold">
              {item.finding.display_id} · {item.finding.title}
            </h3>
            <EvidenceContent item={item} />
            <p className="text-xs text-text-muted">
              {new Date(item.created_at).toLocaleDateString('ko-KR')}
            </p>
          </div>
        ) : null}
      </div>
      {item && !loading && !error && !mismatch && (
        <footer className="shrink-0 border-t border-border-subtle p-4">
          <Button asChild variant="primary" size="sm">
            <Link to="/findings" search={{ selected: item.finding_id }}>
              {COPY.parent}
            </Link>
          </Button>
        </footer>
      )}
    </section>
  );
}
