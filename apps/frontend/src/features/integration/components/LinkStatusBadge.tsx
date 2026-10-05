import type { EntityLinkStatus } from '@fops/shared';
import { StatusBadgeFrame } from '@fops/ui';

const STATUS_META: Record<
  EntityLinkStatus,
  { label: string; tone: 'success' | 'warning' | 'muted' | 'danger' }
> = {
  active: { label: '활성', tone: 'success' },
  stale: { label: '오래됨', tone: 'warning' },
  detached: { label: '분리됨', tone: 'muted' },
  revoked: { label: '취소됨', tone: 'danger' },
};

export function LinkStatusBadge({ status }: { status: EntityLinkStatus }) {
  const meta = STATUS_META[status];
  return (
    <StatusBadgeFrame appearance="link" tone={meta.tone}>
      {meta.label}
    </StatusBadgeFrame>
  );
}
