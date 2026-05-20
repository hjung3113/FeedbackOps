/**
 * ClusterSectionReadOnly — Cluster 추천 section (Slice 3 stub).
 *
 * Prototype ref: screen-voc-create.jsx:512-541
 * Spec: issue #21 says "Cluster 추천은 다음 슬라이스에서 제공됩니다" — always empty state.
 * Real cluster recommendation ships in a later slice when the Cluster table is ready.
 *
 * Token translations (PROTOTYPE-TO-PACK17.md §3.9):
 *   .card-nested → bg-surface-canvas rounded-md p-3
 */

import * as React from 'react';
import { PanelSectionTitle } from '@fops/ui';

export interface ClusterSectionReadOnlyProps {
  /** Similar count from voc — kept for future Chunk N activation. */
  similarCount: number;
}

export function ClusterSectionReadOnly({
  similarCount: _similarCount,
}: ClusterSectionReadOnlyProps): React.ReactElement {
  return (
    <div className="mb-8">
      <PanelSectionTitle>Cluster 추천</PanelSectionTitle>
      <div className="bg-surface-canvas rounded-md p-3 text-sm text-text-muted leading-relaxed">
        Cluster 추천은 다음 슬라이스에서 제공됩니다.
      </div>
    </div>
  );
}

ClusterSectionReadOnly.displayName = 'ClusterSectionReadOnly';
