import { RECOVERY_COPY as COPY } from '@/lib/copy/recovery';

export function RecoveryFreshness({
  computedAt,
  failed,
  updatedAt,
}: { computedAt: string | undefined; failed: boolean; updatedAt?: number }) {
  if (!computedAt) return null;
  return (
    <div
      className="my-3 flex flex-col gap-1 text-xs text-text-muted"
      data-testid="recovery-freshness"
    >
      <p>
        {COPY.computed} ·{' '}
        <time dateTime={computedAt}>
          {computedAt.replace('T', ' ').replace(/(?:\.\d+)?Z$/, ' UTC')}
        </time>
      </p>
      {updatedAt !== undefined && updatedAt > 0 && (
        <p>
          {COPY.successful} ·{' '}
          <time dateTime={new Date(updatedAt).toISOString()}>
            {new Date(updatedAt)
              .toISOString()
              .replace('T', ' ')
              .replace(/\.\d+Z$/, ' UTC')}
          </time>
        </p>
      )}
      {failed && <output>{COPY.stale}</output>}
    </div>
  );
}
