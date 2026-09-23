// VOC Cluster presentation helpers shared by the list shell and detail panel.
// Feature-local on purpose: the labels and test ids are cluster-status specific.
// Extract to a shared lib only when a second feature needs them.

import type * as React from 'react';

import { OutlineBadge } from '@fops/ui';

export function clusterStatusLabel(status: string): string {
  return status === 'confirmed' ? '확정' : '초안';
}

export function ClusterStatusBadge({
  status,
  surface,
}: {
  status: string;
  surface: 'list' | 'detail';
}): React.ReactElement {
  return (
    <OutlineBadge
      data-testid={
        surface === 'detail' ? 'cluster-detail-status-badge' : `cluster-status-badge-${status}`
      }
    >
      {clusterStatusLabel(status)}
    </OutlineBadge>
  );
}

export function shortId(id: string): string {
  return `${id.slice(0, 8)}...`;
}

export function formatClusterDate(raw: string): string {
  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: '2-digit',
  }).format(new Date(raw));
}
