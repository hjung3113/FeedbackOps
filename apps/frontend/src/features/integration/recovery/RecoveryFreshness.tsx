import { RECOVERY_COPY as COPY } from '@/lib/copy/recovery';

export function formatRecoveryTime(value: string): string {
  return value.replace('T', ' ').replace(/(?:\.\d+)?Z$/, ' UTC');
}

export function RecoveryFreshness({
  computedAt,
  failed,
  updatedAt,
  pageComputedAt,
}: {
  computedAt: string | undefined;
  failed: boolean;
  updatedAt?: number;
  pageComputedAt?: string | undefined;
}) {
  if (!computedAt || (!failed && computedAt === pageComputedAt)) return null;
  return (
    <p className="my-3 text-xs text-text-muted" data-testid="recovery-freshness">
      {COPY.computed} · <time dateTime={computedAt}>{formatRecoveryTime(computedAt)}</time>
      {updatedAt !== undefined && updatedAt > 0 && (
        <>
          {' '}
          · {COPY.successful} ·{' '}
          <time dateTime={new Date(updatedAt).toISOString()}>
            {formatRecoveryTime(new Date(updatedAt).toISOString())}
          </time>
        </>
      )}
      {failed && (
        <>
          {' '}
          · <output>{COPY.stale}</output>
        </>
      )}
    </p>
  );
}
