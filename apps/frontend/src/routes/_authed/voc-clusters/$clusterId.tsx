// /voc-clusters/:clusterId — VOC Cluster detail route. URL/shell wiring only:
// path param in, shell callbacks out. Screen composition lives in
// features/voc-cluster/components/detail (AGENTS.md ownership).

import { createFileRoute, useNavigate } from '@tanstack/react-router';
import type * as React from 'react';

import { VocClusterListShell } from '@/features/voc-cluster/components/detail/VocClusterListShell';

export const Route = createFileRoute('/_authed/voc-clusters/$clusterId')({
  component: VocClusterDetailPage,
});

export function VocClusterDetailPage(): React.ReactElement {
  const { clusterId } = Route.useParams();
  const navigate = useNavigate();

  return (
    <VocClusterListShell
      selectedId={clusterId}
      onSelect={(id) =>
        void navigate({
          to: '/voc-clusters/$clusterId',
          params: { clusterId: id },
        })
      }
      onCloseDetail={() => void navigate({ to: '/voc-clusters' })}
    />
  );
}
