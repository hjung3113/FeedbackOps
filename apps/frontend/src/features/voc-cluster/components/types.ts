// Presentation-facing shapes for the VOC Cluster screens. Backend hooks return
// DTOs; these types add the optional enriched fields the components render
// (display ids, member titles, linked findings).

import type { LinkedFindingDto, VocClusterMemberDto } from '@fops/shared';

export type VocClusterMemberPresentation = VocClusterMemberDto & {
  display_id?: string | null;
  title?: string | null;
};

export type VocClusterDetailPresentation = {
  display_id?: string | null;
  members?: VocClusterMemberPresentation[];
  linked_findings?: LinkedFindingDto[];
};

export type VocClusterListPresentation = {
  id: string;
  display_id: string;
  title: string;
  status: string;
  created_at: string;
  member_count: number;
  members?: { voc_id: string }[] | undefined;
  linked_findings?: LinkedFindingDto[] | undefined;
};
