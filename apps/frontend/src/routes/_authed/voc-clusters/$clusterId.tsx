// /voc-clusters/:clusterId — VOC Cluster detail route. URL/shell wiring only:
// path param in, shell callbacks out. Screen composition lives in
// features/voc-cluster/components/detail (AGENTS.md ownership).

import { createFileRoute, useNavigate } from '@tanstack/react-router';
import type * as React from 'react';

import { VocClusterListShell } from '@/features/voc-cluster/components/detail/VocClusterListShell';

// #982: the router plugin skips code-splitting when the route component is an
// exported local (hasExport check). The alias keeps the page exported for
// tests while letting the route component split into its own chunk.
const VocClusterDetailPageSplit = VocClusterDetailPage;

export const Route = createFileRoute('/_authed/voc-clusters/$clusterId')({
  component: VocClusterDetailPageSplit,
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
