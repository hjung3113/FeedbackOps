import type { EntityLinkStatus } from '@fops/shared';
import { cn } from '@fops/ui';

const STATUS_META: Record<EntityLinkStatus, { label: string; className: string }> = {
  active: {
    label: 'Active',
    className: 'bg-[rgb(var(--text-success)/0.12)] text-text-success',
  },
  stale: {
    label: 'Stale',
    className: 'bg-[rgb(var(--text-warning)/0.12)] text-text-warning',
  },
  detached: {
    label: 'Detached',
    className: 'bg-[rgb(var(--text-muted)/0.12)] text-text-muted',
  },
  revoked: {
    label: 'Revoked',
    className: 'bg-[rgb(var(--text-danger)/0.12)] text-text-danger',
  },
};

export function LinkStatusBadge({ status }: { status: EntityLinkStatus }) {
  const meta = STATUS_META[status];
  return (
    <span
      style={{ fontSize: 'var(--text-tiny)' }}
      className={cn(
        'inline-flex h-5 items-center rounded px-1.5 font-medium leading-none',
        meta.className,
      )}
    >
      {meta.label}
    </span>
  );
}
